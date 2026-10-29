#!/usr/bin/env python3
"""Demo-mode WebSocket smoke test (no receiver involved).

Starts uvicorn with DENON_DASHBOARD_DEMO_MODE=true, opens a WebSocket, sends
MVUP and expects a state frame with the changed volume within 1 s. Run from the
repo root with the backend venv's python:

    backend/venv315/bin/python scripts/smoke-demo-ws.py
"""
from __future__ import annotations

import asyncio
import json
import os
import subprocess
import sys
import time

PORT = int(os.environ.get("SMOKE_PORT", "8765"))
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


async def _probe() -> int:
    import websockets

    url = f"ws://127.0.0.1:{PORT}/api/v1/ws"
    async with websockets.connect(url, additional_headers={"Origin": f"http://127.0.0.1:{PORT}"}) as ws:
        first = json.loads(await asyncio.wait_for(ws.recv(), 5))
        before = first["volume"]
        print(f"initial volume={before} heos_connected={first['heos_connected']}")
        await ws.send(json.dumps({"command": "MVUP"}))
        t0 = time.monotonic()
        while True:
            frame = json.loads(await asyncio.wait_for(ws.recv(), 1))
            if frame["volume"] != before:
                print(f"volume changed to {frame['volume']} after {time.monotonic() - t0:.3f}s")
                return 0


def main() -> int:
    env = {**os.environ, "DENON_DASHBOARD_DEMO_MODE": "true", "DENON_DASHBOARD_LOG_LEVEL": "WARNING",
           "DENON_DASHBOARD_DATA_DIR": "/tmp/denon-smoke-data"}
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "main:app", "--port", str(PORT), "--log-level", "warning"],
        cwd=os.path.join(ROOT, "backend"), env=env,
    )
    try:
        import urllib.request
        for _ in range(50):
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{PORT}/api/v1/health", timeout=1)
                break
            except Exception:
                time.sleep(0.2)
        else:
            print("backend did not come up", file=sys.stderr)
            return 1
        return asyncio.run(_probe())
    finally:
        proc.terminate()
        proc.wait(timeout=5)


if __name__ == "__main__":
    sys.exit(main())
