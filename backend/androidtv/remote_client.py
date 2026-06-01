"""Android TV Remote protocol v2 client wrapper."""
from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
from typing import Any, Awaitable, Callable

from androidtvremote2 import AndroidTVRemote, CannotConnect, ConnectionClosed, InvalidAuth

_LOGGER = logging.getLogger(__name__)

NotifyCallback = Callable[[], Awaitable[None]]


class AndroidTvRemoteClient:
    """Stateful wrapper around androidtvremote2 for the dashboard."""

    def __init__(
        self,
        *,
        client_name: str,
        storage_dir: str,
        notify: NotifyCallback,
    ) -> None:
        self.client_name = client_name
        self.storage_dir = Path(storage_dir)
        self.notify = notify
        self.host: str | None = None
        self.remote: AndroidTVRemote | None = None
        self.connected = False
        self.paired = False
        self.pairing = False
        self.available = False
        self.error: str | None = None
        self.device_name: str | None = None
        self.device_mac: str | None = None
        self.device_info: dict[str, Any] | None = None
        self.is_on: bool | None = None
        self.current_app: str | None = None
        self.volume_info: dict[str, Any] | None = None
        self._lock = asyncio.Lock()

    @property
    def certfile(self) -> str:
        return str(self.storage_dir / "cert.pem")

    @property
    def keyfile(self) -> str:
        return str(self.storage_dir / "key.pem")

    @property
    def statefile(self) -> Path:
        return self.storage_dir / "state.json"

    def load_last_host(self) -> str | None:
        try:
            data = json.loads(self.statefile.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None
        host = data.get("host")
        return host if isinstance(host, str) and host.strip() else None

    def build_status(self) -> dict[str, Any]:
        volume = self.volume_info or {}
        return {
            "configured": bool(self.host),
            "connected": self.connected,
            "paired": self.paired,
            "pairing": self.pairing,
            "available": self.available,
            "host": self.host,
            "device_name": self.device_name,
            "device_mac": self.device_mac,
            "device_info": self.device_info,
            "is_on": self.is_on,
            "current_app": self.current_app,
            "volume": volume.get("level"),
            "volume_max": volume.get("max"),
            "muted": volume.get("muted"),
            "error": self.error,
        }

    async def connect(self, host: str) -> dict[str, Any]:
        async with self._lock:
            if self.host == host and self.remote and self.connected:
                return self.build_status()
            self._reset_runtime_state(host)
            await self._ensure_remote()
            await self._connect_locked()
            if self.connected:
                self._save_last_host()
        await self.notify()
        return self.build_status()

    async def start_pairing(self, host: str | None = None) -> dict[str, Any]:
        async with self._lock:
            self._reset_runtime_state(host or self.host)
            if not self.host:
                raise ValueError("Android TV host is required")
            await self._ensure_remote()
            assert self.remote is not None
            try:
                self.device_name, self.device_mac = await self.remote.async_get_name_and_mac()
                await self.remote.async_start_pairing()
                self.pairing = True
                self.connected = False
                self.paired = False
                self.error = None
            except (CannotConnect, ConnectionClosed) as exc:
                self.pairing = False
                self.error = str(exc) or "Could not start pairing"
                raise
        await self.notify()
        return self.build_status()

    async def finish_pairing(self, code: str) -> dict[str, Any]:
        async with self._lock:
            if not self.remote or not self.pairing:
                raise ConnectionClosed("Pairing has not been started")
            try:
                await self.remote.async_finish_pairing(code)
                self.pairing = False
                self.paired = True
                self.error = None
                await self._connect_locked()
                if self.connected:
                    self._save_last_host()
            except InvalidAuth as exc:
                self.error = "Invalid pairing code"
                raise exc
            except (CannotConnect, ConnectionClosed) as exc:
                self.error = str(exc) or "Pairing failed"
                raise
        await self.notify()
        return self.build_status()

    async def send_key(self, key_code: str) -> dict[str, Any]:
        async with self._lock:
            try:
                self._require_connected().send_key_command(key_code)
                self._apply_optimistic_key_state(key_code)
                self.error = None
            except ConnectionClosed:
                self.connected = False
                self.available = False
                self.error = "Android TV is not connected"
                raise
        await self.notify()
        return {"ok": True}

    async def send_text(self, text: str) -> dict[str, Any]:
        async with self._lock:
            try:
                self._require_connected().send_text(text)
                self.error = None
            except ConnectionClosed:
                self.connected = False
                self.available = False
                self.error = "Android TV is not connected"
                raise
        await self.notify()
        return {"ok": True}

    async def disconnect(self, *, clear_host: bool = False) -> None:
        async with self._lock:
            if self.remote:
                self.remote.disconnect()
            self.connected = False
            self.available = False
            self.pairing = False
            if clear_host:
                self.host = None
                self.remote = None
                self.paired = False
                self.error = None
                self.device_name = None
                self.device_mac = None
                self.device_info = None
                self.is_on = None
                self.current_app = None
                self.volume_info = None
                self._delete_last_host()
        await self.notify()

    def _reset_runtime_state(self, host: str | None) -> None:
        if self.host == host and self.remote:
            return
        if self.remote:
            self.remote.disconnect()
        self.host = host
        self.remote = None
        self.connected = False
        self.available = False
        self.paired = False
        self.pairing = False
        self.device_info = None
        self.is_on = None
        self.current_app = None
        self.volume_info = None

    async def _ensure_remote(self) -> None:
        if self.remote:
            return
        if not self.host:
            raise ValueError("Android TV host is required")
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self.remote = AndroidTVRemote(
            self.client_name,
            self.certfile,
            self.keyfile,
            self.host,
            enable_ime=True,
            enable_voice=False,
        )
        if await self.remote.async_generate_cert_if_missing():
            _LOGGER.info("Generated Android TV pairing certificate in %s", self.storage_dir)
        self.remote.add_is_on_updated_callback(self._on_is_on_updated)
        self.remote.add_current_app_updated_callback(self._on_current_app_updated)
        self.remote.add_volume_info_updated_callback(self._on_volume_info_updated)
        self.remote.add_is_available_updated_callback(self._on_is_available_updated)

    async def _connect_locked(self) -> None:
        assert self.remote is not None
        try:
            await self.remote.async_connect()
            self.remote.keep_reconnecting(self._on_invalid_auth)
            self.connected = True
            self.available = True
            self.paired = True
            self.error = None
            self._sync_remote_state()
        except InvalidAuth:
            self.connected = False
            self.available = False
            self.paired = False
            self.error = "Pairing required"
        except (CannotConnect, ConnectionClosed) as exc:
            self.connected = False
            self.available = False
            self.error = str(exc) or "Could not connect"

    def _require_connected(self) -> AndroidTVRemote:
        if not self.remote or not self.connected:
            raise ConnectionClosed("Android TV is not connected")
        return self.remote

    def _sync_remote_state(self) -> None:
        if not self.remote:
            return
        self.device_info = dict(self.remote.device_info) if self.remote.device_info else None
        self.is_on = self.remote.is_on
        self.current_app = self.remote.current_app
        self.volume_info = dict(self.remote.volume_info) if self.remote.volume_info else None

    def _schedule_notify(self) -> None:
        try:
            asyncio.get_running_loop().create_task(self.notify())
        except RuntimeError:
            pass

    def _on_is_on_updated(self, is_on: bool) -> None:
        self.is_on = is_on
        self._schedule_notify()

    def _on_current_app_updated(self, current_app: str) -> None:
        self.current_app = current_app
        self._schedule_notify()

    def _on_volume_info_updated(self, volume_info: dict[str, Any]) -> None:
        self.volume_info = dict(volume_info)
        self._schedule_notify()

    def _on_is_available_updated(self, is_available: bool) -> None:
        self.available = is_available
        self.connected = is_available
        self._schedule_notify()

    def _on_invalid_auth(self) -> None:
        self.connected = False
        self.available = False
        self.paired = False
        self.error = "Pairing required"
        self._schedule_notify()

    def _apply_optimistic_key_state(self, key_code: str) -> None:
        if key_code == "VOLUME_MUTE":
            volume = dict(self.volume_info or {})
            volume["muted"] = not bool(volume.get("muted", False))
            self.volume_info = volume

    def _save_last_host(self) -> None:
        if not self.host:
            return
        try:
            self.storage_dir.mkdir(parents=True, exist_ok=True)
            self.statefile.write_text(json.dumps({"host": self.host}), encoding="utf-8")
        except OSError as exc:
            _LOGGER.warning("Failed to save Android TV last host: %s", exc)

    def _delete_last_host(self) -> None:
        try:
            self.statefile.unlink()
        except FileNotFoundError:
            pass
        except OSError as exc:
            _LOGGER.warning("Failed to delete Android TV last host: %s", exc)
