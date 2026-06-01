"""Safe ADB helper for Android TV diagnostics and app launching."""
from __future__ import annotations

import asyncio
import io
import json
import logging
import os
import re
from pathlib import Path
from typing import Any

_LOGGER = logging.getLogger(__name__)

_PACKAGE_RE = re.compile(r"^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+$")
_COMPONENT_RE = re.compile(r"^([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+)/(?:[A-Za-z0-9_.$]+|\.[A-Za-z0-9_.$]+)$")
_CURRENT_COMPONENT_RE = re.compile(
    r"((?:[A-Za-z0-9_]+\.)+[A-Za-z0-9_]+)/(?:[A-Za-z0-9_.$]+|\.[A-Za-z0-9_.$]+)"
)
_IP_RE = re.compile(r"\binet\s+(\d{1,3}(?:\.\d{1,3}){3})/")


class AdbError(RuntimeError):
    """Raised when an ADB operation fails."""


class AndroidTvAdbClient:
    """Narrow ADB wrapper for a single Android TV device."""

    def __init__(
        self,
        *,
        enabled: bool,
        adb_path: str = "adb",
        storage_dir: str = "/data/adb",
        default_port: int = 5555,
    ) -> None:
        self.enabled = enabled
        self.adb_path = adb_path
        self.storage_dir = Path(storage_dir)
        self.default_port = default_port
        self.host: str | None = None
        self.port = default_port
        self.serial: str | None = None
        self.last_error: str | None = None
        self._lock = asyncio.Lock()

    @property
    def statefile(self) -> Path:
        return self.storage_dir / "state.json"

    @property
    def favorites_file(self) -> Path:
        return self.storage_dir / "favorites.json"

    def load_last_host(self) -> tuple[str, int] | None:
        try:
            data = json.loads(self.statefile.read_text(encoding="utf-8"))
            host = data.get("host")
            port = int(data.get("port") or self.default_port)
            if host:
                return host, port
        except Exception:
            return None
        return None

    async def connect(self, host: str, port: int | None = None) -> dict[str, Any]:
        self._require_enabled()
        port = port or self.default_port
        serial = f"{host}:{port}"
        async with self._lock:
            out = await self._adb("connect", serial, timeout=10)
            self.host = host
            self.port = port
            self.serial = serial
            self._save_last_host()
            if "unable" in out.lower() or "failed" in out.lower():
                self.last_error = out.strip() or "ADB connect failed"
                raise AdbError(self.last_error)
            else:
                self.last_error = None
        await self._wait_for_device(timeout=12)
        return await self.status()

    async def pair(self, host: str, port: int, code: str) -> dict[str, Any]:
        self._require_enabled()
        pair_code = code.strip()
        if not re.fullmatch(r"[A-Za-z0-9]{4,12}", pair_code):
            raise ValueError("Invalid pairing code")
        serial = f"{host}:{port}"
        async with self._lock:
            out = await self._adb("pair", serial, pair_code, timeout=20)
            if "success" not in out.lower() and "paired" not in out.lower():
                self.last_error = out.strip() or "ADB pairing failed"
                raise AdbError(self.last_error)
            self.host = host
            self.last_error = None
        return {"ok": True, "host": host, "pair_port": port}

    async def disconnect(self, *, clear_host: bool = False) -> dict[str, Any]:
        if self.enabled and self.serial:
            try:
                await self._adb("disconnect", self.serial, timeout=5)
            except Exception as exc:
                self.last_error = str(exc)
        if clear_host:
            self._delete_last_host()
        self.host = None
        self.serial = None
        return self.build_status(connected=False, authorized=False)

    async def status(self) -> dict[str, Any]:
        base = self.build_status()
        if not self.enabled:
            return base
        available = await self._adb_available()
        base["adb_available"] = available
        if not available:
            return base
        if not self.serial:
            return base
        state = await self._get_state()
        connected = state == "device"
        authorized = state == "device"
        base.update({"state": state, "connected": connected, "authorized": authorized})
        if connected:
            details, current_app, diagnostics = await asyncio.gather(
                self._safe_status_part(self.device_details(), {}),
                self._safe_status_part(self.current_app(), {"package": None, "activity": None, "name": None}),
                self._safe_status_part(self.diagnostics(), {}),
            )
            base.update(details)
            base["current_app"] = current_app
            base["diagnostics"] = diagnostics
        return base

    def build_status(
        self,
        *,
        connected: bool | None = None,
        authorized: bool | None = None,
    ) -> dict[str, Any]:
        known_connected = bool(self.serial) if connected is None else connected
        known_authorized = bool(self.serial) if authorized is None else authorized
        return {
            "enabled": self.enabled,
            "adb_available": None,
            "host": self.host,
            "port": self.port,
            "serial": self.serial,
            "connected": known_connected,
            "authorized": known_authorized,
            "state": "device" if known_connected else None,
            "model": None,
            "android_version": None,
            "build": None,
            "resolution": None,
            "current_app": None,
            "diagnostics": {},
            "last_error": self.last_error,
        }

    async def device_details(self) -> dict[str, Any]:
        self._require_connected()
        model, version, build, size = await asyncio.gather(
            self._shell("getprop", "ro.product.model"),
            self._shell("getprop", "ro.build.version.release"),
            self._shell("getprop", "ro.build.display.id"),
            self._shell("wm", "size"),
        )
        return {
            "model": model.strip() or None,
            "android_version": version.strip() or None,
            "build": build.strip() or None,
            "resolution": self._parse_resolution(size),
        }

    async def diagnostics(self) -> dict[str, Any]:
        self._require_connected()
        ping, storage, ip = await asyncio.gather(
            self._shell("echo", "ok"),
            self._shell("df", "-k", "/data"),
            self._shell("ip", "-f", "inet", "addr", "show"),
        )
        return {
            "ping": ping.strip() == "ok",
            "storage": self._parse_storage(storage),
            "wifi_ip": self._parse_ip(ip),
            "last_error": self.last_error,
        }

    async def current_app(self) -> dict[str, str | None]:
        self._require_connected()
        output = await self._shell("dumpsys", "window", "windows")
        component = self._extract_component(output)
        if not component:
            output = await self._shell("dumpsys", "activity", "activities")
            component = self._extract_component(output)
        package, activity = self._split_component(component)
        return {"package": package, "activity": activity, "name": self._display_name(package)}

    async def list_apps(self) -> list[dict[str, Any]]:
        self._require_connected()
        output = await self._shell(
            "cmd",
            "package",
            "query-activities",
            "--brief",
            "-a",
            "android.intent.action.MAIN",
            "-c",
            "android.intent.category.LAUNCHER",
        )
        favorites = self._load_favorites()
        apps: dict[str, dict[str, Any]] = {}
        for line in output.splitlines():
            component = self._extract_component(line)
            if not component:
                continue
            package, activity = self._split_component(component)
            if not package:
                continue
            apps[package] = {
                "package": package,
                "activity": activity,
                "name": self._display_name(package),
                "favorite": package in favorites,
            }
        result = sorted(apps.values(), key=lambda item: (not item["favorite"], item["name"].lower()))
        return result

    async def launch_app(self, package: str, activity: str | None = None) -> dict[str, Any]:
        self._require_connected()
        self._validate_package(package)
        if activity:
            component = f"{package}/{activity}"
            self._validate_component(component)
            await self._shell(
                "am",
                "start",
                "-a",
                "android.intent.action.MAIN",
                "-c",
                "android.intent.category.LAUNCHER",
                "-f",
                "0x10200000",
                "-n",
                component,
            )
        else:
            await self._shell(
                "monkey",
                "-p",
                package,
                "-c",
                "android.intent.category.LAUNCHER",
                "1",
            )
        return {"ok": True}

    async def force_stop_app(self, package: str) -> dict[str, Any]:
        self._require_connected()
        self._validate_package(package)
        await self._shell("am", "force-stop", package)
        return {"ok": True}

    async def uninstall_app(self, package: str) -> dict[str, Any]:
        self._require_connected()
        self._validate_package(package)
        await self._shell("pm", "uninstall", package)
        return {"ok": True}

    async def set_favorite(self, package: str, favorite: bool) -> dict[str, Any]:
        self._validate_package(package)
        favorites = self._load_favorites()
        if favorite:
            favorites.add(package)
        else:
            favorites.discard(package)
        self._save_favorites(favorites)
        return {"ok": True, "package": package, "favorite": favorite}

    async def send_text(self, text: str) -> dict[str, Any]:
        self._require_connected()
        if "\r" in text or "\n" in text:
            raise ValueError("Text must be a single line")
        encoded = self._encode_input_text(text)
        await self._shell("input", "text", encoded)
        return {"ok": True}

    async def power_action(self, action: str) -> dict[str, Any]:
        self._require_connected()
        if action == "wake":
            await self._shell("input", "keyevent", "KEYCODE_WAKEUP")
        elif action == "sleep":
            await self._shell("input", "keyevent", "KEYCODE_SLEEP")
        elif action == "power":
            await self._shell("input", "keyevent", "KEYCODE_POWER")
        elif action == "reboot":
            await self._adb("-s", self._serial(), "reboot", timeout=5)
        else:
            raise ValueError("Unsupported power action")
        return {"ok": True}

    async def screenshot(
        self,
        *,
        image_format: str = "png",
        max_width: int | None = None,
        quality: int = 60,
    ) -> bytes:
        self._require_connected()
        data = await self._adb_bytes("-s", self._serial(), "exec-out", "screencap", "-p", timeout=15)
        normalized_format = image_format.lower()
        if normalized_format == "png" and not max_width:
            return data
        return self._convert_screenshot(
            data,
            image_format=normalized_format,
            max_width=max_width,
            quality=quality,
        )

    async def _get_state(self) -> str | None:
        if not self.serial:
            return None
        try:
            return (await self._adb("-s", self.serial, "get-state", timeout=5)).strip()
        except AdbError as exc:
            msg = str(exc)
            self.last_error = msg
            if "unauthorized" in msg.lower():
                return "unauthorized"
            if "offline" in msg.lower():
                return "offline"
            return None

    async def _wait_for_device(self, timeout: float = 12) -> bool:
        deadline = asyncio.get_running_loop().time() + timeout
        last_state: str | None = None
        while asyncio.get_running_loop().time() < deadline:
            last_state = await self._get_state()
            if last_state == "device":
                self.last_error = None
                return True
            await asyncio.sleep(1)
        self.last_error = f"ADB device not ready after connect (state: {last_state or 'unknown'})"
        raise AdbError(self.last_error)

    async def _safe_status_part(self, awaitable, fallback):
        try:
            return await awaitable
        except Exception as exc:
            self.last_error = str(exc) or exc.__class__.__name__
            _LOGGER.debug("ADB status detail failed: %s", self.last_error)
            return fallback

    async def _adb_available(self) -> bool:
        try:
            await self._adb("version", timeout=5)
            return True
        except Exception as exc:
            self.last_error = str(exc)
            return False

    async def _shell(self, *args: str) -> str:
        return await self._adb("-s", self._serial(), "shell", *args)

    async def _adb(self, *args: str, timeout: float = 8) -> str:
        data = await self._adb_bytes(*args, timeout=timeout)
        return data.decode(errors="replace")

    async def _adb_bytes(self, *args: str, timeout: float = 8) -> bytes:
        self._require_enabled()
        env = os.environ.copy()
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        android_home = self.storage_dir / ".android"
        android_home.mkdir(parents=True, exist_ok=True)
        env["HOME"] = str(self.storage_dir)
        env["ANDROID_USER_HOME"] = str(self.storage_dir)
        env["ADB_VENDOR_KEYS"] = str(android_home / "adbkey")
        try:
            proc = await asyncio.create_subprocess_exec(
                self.adb_path,
                *args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
            )
        except OSError as exc:
            self.last_error = f"Could not start adb: {exc}"
            raise AdbError(self.last_error)
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.communicate()
            raise AdbError("ADB command timed out")
        if proc.returncode != 0:
            message = stderr.decode(errors="replace").strip() or stdout.decode(errors="replace").strip()
            self.last_error = message or f"ADB exited with {proc.returncode}"
            raise AdbError(self.last_error)
        return stdout

    def _serial(self) -> str:
        if not self.serial:
            raise AdbError("ADB device is not connected")
        return self.serial

    def _require_enabled(self) -> None:
        if not self.enabled:
            raise AdbError("ADB integration is disabled")

    def _require_connected(self) -> None:
        self._require_enabled()
        if not self.serial:
            raise AdbError("ADB device is not connected")

    def _save_last_host(self) -> None:
        try:
            self.storage_dir.mkdir(parents=True, exist_ok=True)
            self.statefile.write_text(
                json.dumps({"host": self.host, "port": self.port}),
                encoding="utf-8",
            )
        except Exception as exc:
            _LOGGER.warning("Failed to save ADB state: %s", exc)

    def _delete_last_host(self) -> None:
        try:
            self.statefile.unlink()
        except FileNotFoundError:
            pass
        except Exception as exc:
            _LOGGER.warning("Failed to delete ADB state: %s", exc)

    def _load_favorites(self) -> set[str]:
        try:
            data = json.loads(self.favorites_file.read_text(encoding="utf-8"))
            return {pkg for pkg in data.get("packages", []) if _PACKAGE_RE.match(pkg)}
        except Exception:
            return set()

    def _save_favorites(self, favorites: set[str]) -> None:
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self.favorites_file.write_text(
            json.dumps({"packages": sorted(favorites)}),
            encoding="utf-8",
        )

    def _validate_package(self, package: str) -> None:
        if not _PACKAGE_RE.match(package):
            raise ValueError("Invalid package name")

    def _validate_component(self, component: str) -> None:
        if not _COMPONENT_RE.match(component):
            raise ValueError("Invalid activity component")

    def _extract_component(self, text: str) -> str | None:
        match = _CURRENT_COMPONENT_RE.search(text)
        return match.group(0) if match else None

    def _split_component(self, component: str | None) -> tuple[str | None, str | None]:
        if not component or "/" not in component:
            return None, None
        package, activity = component.split("/", 1)
        return package, activity

    def _display_name(self, package: str | None) -> str | None:
        if not package:
            return None
        tail = package.rsplit(".", 1)[-1]
        replacements = {
            "android": "Android",
            "youtube": "YouTube",
            "kodi": "Kodi",
            "plex": "Plex",
            "netflix": "Netflix",
            "spotify": "Spotify",
            "disneyplus": "Disney+",
        }
        return replacements.get(tail.lower(), tail.replace("_", " ").title())

    def _parse_resolution(self, output: str) -> str | None:
        match = re.search(r"(\d{3,5})x(\d{3,5})", output)
        return match.group(0) if match else None

    def _parse_storage(self, output: str) -> dict[str, Any] | None:
        for line in output.splitlines()[1:]:
            parts = line.split()
            if len(parts) >= 5:
                try:
                    return {
                        "size_kb": int(parts[1]),
                        "used_kb": int(parts[2]),
                        "available_kb": int(parts[3]),
                        "used_percent": parts[4],
                    }
                except ValueError:
                    return None
        return None

    def _parse_ip(self, output: str) -> str | None:
        for match in _IP_RE.finditer(output):
            ip = match.group(1)
            if not ip.startswith("127."):
                return ip
        return None

    def _encode_input_text(self, text: str) -> str:
        return (
            text.replace("%", "%25")
            .replace(" ", "%s")
            .replace("\\", "\\\\")
            .replace('"', '\\"')
            .replace("'", "\\'")
        )

    def _convert_screenshot(
        self,
        data: bytes,
        *,
        image_format: str,
        max_width: int | None,
        quality: int,
    ) -> bytes:
        try:
            from PIL import Image
        except ImportError as exc:
            raise AdbError("Pillow is required for optimized screenshots") from exc

        if image_format not in {"png", "jpeg", "webp"}:
            raise ValueError("Unsupported screenshot format")
        quality = max(30, min(int(quality), 95))
        with Image.open(io.BytesIO(data)) as image:
            image.load()
            if max_width and image.width > max_width:
                ratio = max_width / image.width
                size = (max_width, max(1, round(image.height * ratio)))
                image = image.resize(size, Image.Resampling.BILINEAR)
            output = io.BytesIO()
            if image_format == "png":
                image.save(output, format="PNG", optimize=True)
            elif image_format == "webp":
                image.save(output, format="WEBP", quality=quality, method=4)
            else:
                if image.mode not in ("RGB", "L"):
                    image = image.convert("RGB")
                image.save(output, format="JPEG", quality=quality, optimize=True)
            return output.getvalue()
