from flask import Flask, request, jsonify
from aiortc import RTCPeerConnection, RTCSessionDescription

app = Flask(__name__)

@app.route("/")
def hello_world():
    return "<p>Hello, World!</p>"

@app.route('/offer', methods=['POST'])
def offer():
    pc = RTCPeerConnection()
    offer = request.json['offer']
    # handle WebRTC offer, setup track handlers
    # send back answer

    return jsonify({"answer": answer})

if __name__ == "__main__":
    app.run(debug=True)