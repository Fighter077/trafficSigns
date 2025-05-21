# This is the Flask + aiortc backend for WebRTC

import asyncio
import json
import os
from aiohttp import web
from aiortc import RTCPeerConnection, RTCSessionDescription, VideoStreamTrack, MediaStreamError
from aiortc.contrib.media import MediaBlackhole, MediaRelay
import aiohttp_cors
import cv2
import numpy as np
import time


pcs = set()

# global connection store
output_websockets = {}  # clientId -> WebSocket

async def ws_output_handler(request):
    client_id = request.query.get("clientId")
    if not client_id:
        return web.Response(status=400, text="Missing clientId")

    ws = web.WebSocketResponse()
    await ws.prepare(request)

    output_websockets[client_id] = ws
    print(f"🟢 WebSocket connected for client {client_id}")

    try:
        async for _ in ws:
            pass  # optional: handle incoming messages
    finally:
        output_websockets.pop(client_id, None)
        print(f"🔴 WebSocket closed for client {client_id}")

    return ws

async def offer(request):   
    params = await request.json()
    client_id = params["clientId"]
    offer = RTCSessionDescription(sdp=params["sdp"], type=params["type"])

    pc = RTCPeerConnection()
    pcs.add(pc)

    relay = MediaRelay()  # relays media across consumers

    @pc.on("track")
    def on_track(track):
        print("Track received:", track.kind)

        if track.kind == "video":
            local_video = relay.subscribe(track)

            async def read_frames():
                frameCounter = 0
                while True:
                    try:
                        frame = await local_video.recv()
                        img = frame.to_ndarray(format="bgr24")  # OpenCV compatible frame

                        if frameCounter == 0 or frameCounter == 50:
                            timestamp = int(time.time() * 1000)
                            os.makedirs("snapshots", exist_ok=True)
                            filename = f"snapshots/client_{client_id}_{timestamp}.jpg"
                            cv2.imwrite(filename, img)
                            print(f"✅ Saved snapshot to {filename}")
                        frameCounter += 1

                        if (img.shape[0] < 540 or img.shape[1] < 960):
                            print(f"❌ Frame too small, skipping analysis, size: {img.shape}")
                            continue

                        # Dummy analysis: mean color
                        mean_color = img.mean(axis=(0, 1)).astype(int).tolist()
                        timestamp = time.time() * 1000  # ms
                        result = {
                            "mean_color": {"b": mean_color[0], "g": mean_color[1], "r": mean_color[2]},
                            "timestamp": timestamp
                        }

                        # 🔁 Send ONLY to matching client
                        ws = output_websockets.get(client_id)
                        if ws is not None and not ws.closed:
                            await ws.send_str(json.dumps(result))
                    except MediaStreamError:
                        print("✅ Stream ended normally (MediaStreamError)")
                        break
                    except av.AVError as e:
                        print("❌ Invalid data error")
                    except Exception as e:
                        print("Frame reading stopped:", str(e))
                        break
                    #    break

        # Start processing in background
        asyncio.ensure_future(read_frames())

    @pc.on("ended")
    def on_ended():
        print("📴 Track ended cleanly from client.")

    await pc.setRemoteDescription(offer)
    answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    return web.Response(
        content_type="application/json",
        text=json.dumps({
            "sdp": pc.localDescription.sdp,
            "type": pc.localDescription.type
        })
    )

async def on_shutdown(app):
    coros = [pc.close() for pc in pcs]
    await asyncio.gather(*coros)
    pcs.clear()

app = web.Application()

# Set up CORS with default settings (allow all origins)
cors = aiohttp_cors.setup(app, defaults={
    "*": aiohttp_cors.ResourceOptions(
        allow_credentials=True,
        expose_headers="*",
        allow_headers="*",
    )
})

app.on_shutdown.append(on_shutdown)
offerRoute = app.router.add_post("/offer", offer)
cors.add(offerRoute)

wsRoute = app.router.add_get("/ws", ws_output_handler)
cors.add(wsRoute)

if __name__ == "__main__":
    web.run_app(app, port=8080)
