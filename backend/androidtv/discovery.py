"""Discovery for Android TV Remote protocol devices."""
from __future__ import annotations

import asyncio
import ipaddress
from typing import Any

from zeroconf import ServiceStateChange, Zeroconf
from zeroconf.asyncio import AsyncServiceBrowser, AsyncServiceInfo, AsyncZeroconf

SERVICE_TYPE = "_androidtvremote2._tcp.local."


async def discover_android_tvs(timeout: float = 4.0) -> list[dict[str, Any]]:
    """Discover Android TV Remote v2 devices via mDNS."""
    found: dict[str, dict[str, Any]] = {}
    pending: set[asyncio.Task[None]] = set()
    zc = AsyncZeroconf()

    async def display_service_info(zeroconf: Zeroconf, service_type: str, name: str) -> None:
        info = AsyncServiceInfo(service_type, name)
        await info.async_request(zeroconf, 3000)
        if not info:
            return
        properties = {
            key.decode("utf-8", errors="ignore"): value.decode("utf-8", errors="ignore")
            for key, value in (info.properties or {}).items()
        }
        for address in info.parsed_scoped_addresses():
            if not _is_local_address(address):
                continue
            found[address] = {
                "name": name.rstrip("."),
                "ip": address,
                "port": info.port,
                "properties": properties,
            }

    def on_service_state_change(
        zeroconf: Zeroconf,
        service_type: str,
        name: str,
        state_change: ServiceStateChange,
    ) -> None:
        if state_change is not ServiceStateChange.Added:
            return
        task = asyncio.create_task(display_service_info(zeroconf, service_type, name))
        pending.add(task)
        task.add_done_callback(pending.discard)

    try:
        browser = AsyncServiceBrowser(
            zc.zeroconf,
            [SERVICE_TYPE],
            handlers=[on_service_state_change],
        )
        await asyncio.sleep(timeout)
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)
        await browser.async_cancel()
    finally:
        await zc.async_close()

    return sorted(found.values(), key=lambda item: item["name"])


def _is_local_address(value: str) -> bool:
    ip_part = value.split("%", 1)[0]
    try:
        addr = ipaddress.ip_address(ip_part)
    except ValueError:
        return False
    return (
        (addr.is_private or addr.is_link_local)
        and not addr.is_loopback
        and not addr.is_multicast
        and not addr.is_unspecified
    )
