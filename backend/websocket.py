from aiohttp import web # type: ignore

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

def get_websocket(client_id):
    return output_websockets.get(client_id)