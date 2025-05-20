# This is the Flask + aiortc backend for WebRTC

import asyncio
import json
from aiohttp import web
from aiortc import RTCPeerConnection, RTCSessionDescription, VideoStreamTrack
from aiortc.contrib.media import MediaBlackhole

pcs = set()

async def offer(request):
    params = await request.json()
    offer = RTCSessionDescription(sdp=params["sdp"], type=params["type"])

    pc = RTCPeerConnection()
    pcs.add(pc)

    @pc.on("track")
    def on_track(track):
        print("Track received: %s" % track.kind)
        if track.kind == "video":
            # Process video frames here
            # You can use OpenCV to read from `track`
            pass

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
app.on_shutdown.append(on_shutdown)
app.router.add_post("/offer", offer)

if __name__ == "__main__":
    web.run_app(app, port=8080)
