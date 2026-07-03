"""SSDP-based discovery for Denon/Marantz AVR receivers."""
from __future__ import annotations

import asyncio
import logging
import re
import socket
import time
from typing import Any

_LOGGER = logging.getLogger(__name__)

SSDP_ADDR = "239.255.255.250"
SSDP_PORT = 1900
HEOS_PORT = 1255
TELNET_PORT = 23

SSDP_TARGETS = [
    "urn:schemas-denon-com:device:ACT-Denon:1",
    "urn:schemas-denon-com:device:ZoneDevice:1",
    "urn:schemas-denon-com:device:MediaRenderer:1",
]


def _get_default_iface_ip() -> str:
    """Get the local IP of the interface used for outbound traffic."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "0.0.0.0"


def _send_ssdp(st: str, timeout: float) -> list[dict[str, Any]]:
    """Send SSDP M-SEARCH and collect responses (blocking)."""
    msg = (
        "M-SEARCH * HTTP/1.1\r\n"
        f"HOST: {SSDP_ADDR}:{SSDP_PORT}\r\n"
        'MAN: "ssdp:discover"\r\n'
        "MX: 2\r\n"
        f"ST: {st}\r\n"
        "\r\n"
    ).encode()

    results: list[dict[str, Any]] = []
    try:
        local_ip = _get_default_iface_ip()
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 4)
        # Bind multicast to the correct outbound interface (important in containers)
        sock.setsockopt(
            socket.IPPROTO_IP,
            socket.IP_MULTICAST_IF,
            socket.inet_aton(local_ip),
        )
        sock.settimeout(timeout)
        sock.sendto(msg, (SSDP_ADDR, SSDP_PORT))

        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            try:
                data, addr = sock.recvfrom(4096)
                text = data.decode(errors="ignore")
                ip = addr[0]
                location = re.search(r"(?i)LOCATION:\s*(.+)", text)
                server = re.search(r"(?i)SERVER:\s*(.+)", text)
                usn = re.search(r"(?i)USN:\s*(.+)", text)
                results.append({
                    "ip": ip,
                    "location": location.group(1).strip() if location else None,
                    "server": server.group(1).strip() if server else None,
                    "usn": usn.group(1).strip() if usn else None,
                })
            except socket.timeout:
                break
        sock.close()
    except Exception as exc:
        _LOGGER.debug("SSDP error for %s: %s", st, exc)

    return results


def _probe_port(ip: str, port: int, timeout: float = 1.0) -> bool:
    """Check if a TCP port is open."""
    try:
        with socket.create_connection((ip, port), timeout=timeout):
            return True
    except Exception:
        return False


def _get_model_from_location(location: str | None) -> str | None:
    """Fetch UPnP device description and extract model/friendly name."""
    if not location:
        return None
    try:
        import ssl
        import urllib.request
        import defusedxml.ElementTree as ET

        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        with urllib.request.urlopen(location, timeout=2, context=ctx) as r:
            xml_data = r.read(512 * 1024).decode(errors="ignore")
        root = ET.fromstring(xml_data)
        for path in (".//{*}modelName", ".//{*}friendlyName", ".//modelName", ".//friendlyName"):
            el = root.find(path)
            if el is not None and el.text:
                return el.text.strip()
    except Exception:
        pass
    return None


def _get_local_subnets() -> list[str]:
    """Get local network subnets to scan using /proc/net/route (no external tools needed)."""
    subnets = set()
    try:
        import struct
        with open("/proc/net/route") as f:
            for line in f.readlines()[1:]:  # skip header
                parts = line.strip().split()
                if len(parts) < 8:
                    continue
                dest_hex = parts[1]
                mask_hex = parts[7]
                # Skip default route and loopback
                if dest_hex == "00000000":
                    continue
                dest = socket.inet_ntoa(struct.pack("<L", int(dest_hex, 16)))
                mask = socket.inet_ntoa(struct.pack("<L", int(mask_hex, 16)))
                # Only include private LAN ranges (skip 172.x Docker bridges)
                if dest.startswith("192.168.") or dest.startswith("10."):
                    # Extract /24 prefix
                    parts_ip = dest.split(".")
                    prefix = ".".join(parts_ip[:3])
                    subnets.add(prefix)
    except Exception as exc:
        _LOGGER.debug("Could not read /proc/net/route: %s", exc)

    # Fallback: derive subnet from own IP address
    if not subnets:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            own_ip = s.getsockname()[0]
            s.close()
            prefix = ".".join(own_ip.split(".")[:3])
            if not own_ip.startswith("127.") and not own_ip.startswith("172."):
                subnets.add(prefix)
        except Exception:
            pass

    return list(subnets)


async def _subnet_scan(subnets: list[str], timeout: float = 3.0) -> list[dict[str, Any]]:
    """
    Fallback: scan local subnets for devices with port 23 (telnet) open.
    Verifies with a quick telnet handshake to confirm it's a Denon receiver.
    """
    if not subnets:
        return []

    _LOGGER.info("SSDP found nothing — falling back to subnet scan on: %s", subnets)

    found = []
    sem = asyncio.Semaphore(50)  # max 50 concurrent probes

    async def probe(ip: str) -> dict | None:
        async with sem:
            loop = asyncio.get_running_loop()
            telnet_ok = await loop.run_in_executor(None, _probe_port, ip, TELNET_PORT, 0.3)
            if not telnet_ok:
                return None
            # Quick verify: send PW? and check for a Denon-style response
            try:
                reader, writer = await asyncio.wait_for(
                    asyncio.open_connection(ip, TELNET_PORT), timeout=1.0
                )
                writer.write(b"PW?\r")
                await writer.drain()
                data = await asyncio.wait_for(reader.read(64), timeout=1.0)
                writer.close()
                text = data.decode(errors="ignore")
                if not any(x in text for x in ("PWON", "PWSTANDBY", "MV", "SI", "MS")):
                    return None  # Not a Denon receiver
            except Exception:
                return None
            heos_ok = await loop.run_in_executor(None, _probe_port, ip, HEOS_PORT, 0.5)
            return {
                "ip": ip,
                "model": "Denon/Marantz AVR",
                "telnet_port": TELNET_PORT,
                "heos_available": heos_ok,
            }

    # Probe all IPs in the subnets concurrently
    all_ips = [f"{subnet}.{i}" for subnet in subnets for i in range(1, 255)]
    tasks = [probe(ip) for ip in all_ips]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    found = [r for r in results if isinstance(r, dict)]
    _LOGGER.info("Subnet scan found %d receiver(s)", len(found))
    return found


async def discover_receivers(timeout: float = 4.0) -> list[dict[str, Any]]:
    """
    Discover Denon/Marantz AVR receivers on the local network via SSDP/UPnP.
    Returns list of dicts: {ip, model, telnet_port, heos_available}
    """
    from config import settings

    seen: dict[str, dict] = {}
    loop = asyncio.get_running_loop()

    # Env-configured host wins: bridge-mode Docker can't SSDP-multicast into the
    # LAN and subnet scan skips 172.x, so trust the operator's DENON_DASHBOARD_DENON_HOST.
    configured_host = (settings.denon_host or "").strip()
    if configured_host:
        telnet_ok = await loop.run_in_executor(None, _probe_port, configured_host, TELNET_PORT, 1.0)
        if telnet_ok:
            heos_ok = await loop.run_in_executor(None, _probe_port, configured_host, HEOS_PORT, 1.0)
            seen[configured_host] = {
                "ip": configured_host,
                "model": "Denon/Marantz AVR (configured)",
                "telnet_port": TELNET_PORT,
                "heos_available": heos_ok,
            }
            _LOGGER.info("Discovery: seeded from DENON_DASHBOARD_DENON_HOST=%s", configured_host)
        else:
            _LOGGER.warning(
                "Discovery: DENON_DASHBOARD_DENON_HOST=%s set but telnet:%d not reachable",
                configured_host, TELNET_PORT,
            )

    tasks = [
        loop.run_in_executor(None, _send_ssdp, st, timeout - 1.0)
        for st in SSDP_TARGETS
    ]
    results_list = await asyncio.gather(*tasks, return_exceptions=True)

    for results in results_list:
        if isinstance(results, Exception):
            continue
        for r in results:
            ip = r["ip"]
            if ip not in seen:
                seen[ip] = r

    if not seen:
        _LOGGER.info("SSDP discovery found no devices — trying subnet scan fallback")
        subnets = await asyncio.get_running_loop().run_in_executor(None, _get_local_subnets)
        return await _subnet_scan(subnets, timeout=timeout)

    async def enrich(ip: str, info: dict) -> dict:
        # Seeded entries (env-configured host) already carry final fields — pass through.
        if info.get("telnet_port") is not None:
            return info
        model = await loop.run_in_executor(None, _get_model_from_location, info.get("location"))
        telnet_ok = await loop.run_in_executor(None, _probe_port, ip, TELNET_PORT, 1.0)
        heos_ok = await loop.run_in_executor(None, _probe_port, ip, HEOS_PORT, 1.0)
        return {
            "ip": ip,
            "model": model or "Denon/Marantz AVR",
            "telnet_port": TELNET_PORT if telnet_ok else None,
            "heos_available": heos_ok,
        }

    enriched = await asyncio.gather(*[enrich(ip, info) for ip, info in seen.items()])
    found = [d for d in enriched if d["telnet_port"] is not None]

    # Fallback: subnet scan if SSDP found nothing
    if not found:
        subnets = await asyncio.get_running_loop().run_in_executor(None, _get_local_subnets)
        found = await _subnet_scan(subnets, timeout=timeout)

    _LOGGER.info("Discovery found %d receiver(s): %s", len(found), [d["ip"] for d in found])
    return found
