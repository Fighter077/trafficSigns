# This is the Flask + aiortc backend for WebRTC

import asyncio
import base64
import json
from aiohttp import web # type: ignore
from aiortc import RTCPeerConnection, RTCSessionDescription, MediaStreamError # type: ignore
from aiortc.contrib.media import MediaRelay # type: ignore
import aiohttp_cors # type: ignore
import cv2 # type: ignore
import time

from detection import Detection
from websocket import get_websocket, ws_output_handler
from helpers import convert_results


pcs = set()

detection = Detection()

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

        # Start processing in background
        latest_frame = asyncio.Queue(maxsize=1)
        asyncio.ensure_future(frame_reader_task(local_video, latest_frame))
        asyncio.ensure_future(read_frames(client_id, latest_frame))

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

async def frame_reader_task(local_video, latest_frame):
    while True:
        try:
            frame = await local_video.recv()
            if latest_frame.full():
                try:
                    _ = latest_frame.get_nowait()  # Drop old frame
                except:
                    pass
            await latest_frame.put(frame)
        except Exception as e:
            print("Frame reader stopped:", e)
            break

async def read_frames(client_id, latest_frame):
    frameCounter = 0
    lastTimestamp = 0
    while True:
        try:
            try:
                frame = await latest_frame.get()
            except asyncio.QueueEmpty:
                await asyncio.sleep(0.01)
                continue
            img = frame.to_ndarray(format="bgr24")  # OpenCV compatible frame

            if frameCounter == 0 or frameCounter == 50:
                timestamp = int(time.time() * 1000)

            # Dummy analysis: mean color
            mean_color = img.mean(axis=(0, 1)).astype(int).tolist()
            timestamp = time.time() * 1000  # ms
            result = {
                "mean_color": {"b": mean_color[0], "g": mean_color[1], "r": mean_color[2]},
                "timestamp": timestamp,
                "fps": 1000 / (timestamp - lastTimestamp) if lastTimestamp > 0 else 0,
                "image": {
                    "width": img.shape[1],
                    "height": img.shape[0],
                    "data": base64.b64encode(cv2.imencode('.jpg', img)[1]).decode('utf-8')
                }
            }

            detected = detection.detect(img)  # Perform detection
            #print(f"✅ Detected", detected)
            if (frameCounter % 50 == 0):
                print(detected)
            json_result = convert_results(detected, img.shape[1], img.shape[0])
            result["detections"] = json_result

            frameCounter += 1

            # 🔁 Send ONLY to matching client
            ws = get_websocket(client_id)
            if ws is not None and not ws.closed:
                await ws.send_str(json.dumps(result))

            if (img.shape[0] < 270 or img.shape[1] < 480):
                print(f"❌ Frame too small, skipping analysis, size: {img.shape}")
                continue

            lastTimestamp = timestamp
        except MediaStreamError:
            print("✅ Stream ended normally (MediaStreamError)")
            break
        except Exception as e:
            print("Frame reading stopped:", str(e))
            break

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
