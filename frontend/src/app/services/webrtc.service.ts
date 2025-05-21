import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class WebrtcService {

  constructor() { }

  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;

  public connectionState$: BehaviorSubject<string> = new BehaviorSubject<string>('not connected');
  public iceConnectionState$: BehaviorSubject<string> = new BehaviorSubject<string>('not connected');

  private outputSocket: WebSocket | null = null;

  public meanColor$: BehaviorSubject<{ r: number, g: number, b: number }> = new BehaviorSubject<{ r: number, g: number, b: number }>({ r: 0, g: 0, b: 0 });
  public latencyMs$: BehaviorSubject<number> = new BehaviorSubject<number>(0);
  public sentBytes$: BehaviorSubject<number> = new BehaviorSubject<number>(0);
  public byteRate$: BehaviorSubject<number> = new BehaviorSubject<number>(0);
  public byteRateAvg$: BehaviorSubject<number> = new BehaviorSubject<number>(0);
  public streamDuration$: BehaviorSubject<number> = new BehaviorSubject<number>(0);

  private lastBytesSent: number = 0;
  private lastTime: number = 0;

  private streamStartTime: number | null = null;

  async startWebRTC(videoElement: HTMLVideoElement) {
    const clientId = crypto.randomUUID(); // Or use any unique ID

    this.outputSocket = new WebSocket(`ws://localhost:8080/ws?clientId=${clientId}`);

    const createConnection = async () => {
      this.connectionState$.next('connecting');
      this.iceConnectionState$.next('connecting');

      this.pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' }
        ]
      });

      this.pc.onconnectionstatechange = () => {
        this.connectionState$.next(this.pc?.connectionState || 'disconnected');
      }

      this.pc.oniceconnectionstatechange = () => {
        this.iceConnectionState$.next(this.pc?.iceConnectionState || 'disconnected');
      }

      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 60 }
        }
      });

      this.connectionState$.subscribe(state => {
        if (state === 'connected') {
          videoElement.srcObject = this.localStream;
          videoElement.play();
        }
      });

      // Add stream to PeerConnection
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => {
          if (this.pc) {
            this.pc.addTrack(track, this.localStream as MediaStream);
          }
        });
      }
      const senders = this.pc.getSenders();
      const videoSender = senders.find(s => s.track?.kind === 'video');

      if (videoSender) {
        console.log('Limiting video bitrate');
        const parameters = videoSender.getParameters();
        if (!parameters.encodings) {
          parameters.encodings = [{}];
        }
        parameters.encodings[0].maxBitrate = 500_000;  // 500 kbps
        parameters.encodings[0].maxFramerate = 10; // 10 fps
        parameters.encodings[0].priority = 'high';
        parameters.encodings[0].networkPriority = 'high';
        await videoSender.setParameters(parameters);
      } else {
        console.log('No video sender found');
      }

      // Create offer
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);

      // Send offer to backend
      const response = await fetch('http://localhost:8080/offer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: clientId,
          sdp: this.pc.localDescription?.sdp,
          type: this.pc.localDescription?.type
        })
      });

      const answer = await response.json();
      if (this.pc) {
        await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
        this.startStatsMonitor();
      }
    }

    this.outputSocket.onopen = async () => {
      if (this.outputSocket) {
        this.outputSocket.onmessage = (event) => {
          this.sentBytes$.next(this.sentBytes$.getValue() + event.data.length);
          const message = JSON.parse(event.data);
          this.meanColor$.next(message.mean_color);
          if (message.timestamp) {
            const now = Date.now();
            // reduce to one decimal place
            this.latencyMs$.next(Math.max(Math.round((now - message.timestamp) * 10) / 10, 1));
          }
        };
      }
      await createConnection();
    };
  }

  startStatsMonitor() {
    if (!this.pc) return;

    const monitor = async () => {
      while (this.pc && this.pc.connectionState === 'new' || this.pc?.connectionState === 'connected') {
        const stats: RTCStatsReport = await this.pc.getStats();

        let bytesReceived = 0;
        let bytesSent = 0;
        let elapsedTime = 0;

        stats.forEach(report => {
          if (report.type === 'outbound-rtp' && report.kind === 'video') {
            console.log('Outbound RTP stats:', report);
            const now = Date.now();
            elapsedTime = (now - this.streamStartTime!) / 1000; // in seconds
            bytesSent = report.bytesSent || 0;
          } else if (report.type === 'remote-inbound-rtp' && report.kind === 'video') {
            console.log('Inbound RTP stats:', report);
            const now = Date.now();
            elapsedTime = (now - this.streamStartTime!) / 1000; // in seconds
            bytesReceived = report.bytesReceived || 0;
          }
        });

        this.sentBytes$.next(bytesReceived + bytesSent);
        this.byteRateAvg$.next(Math.round((((bytesReceived + bytesSent) * 10) / elapsedTime) / 1_024) / 10 || 0); // in kbps
        this.byteRate$.next(Math.round((((bytesSent - this.lastBytesSent) * 10) / (elapsedTime - this.lastTime)) / 1_024) / 10 || 0); // in kbps
        this.streamDuration$.next(Math.round(elapsedTime));
        this.lastBytesSent = bytesSent;
        this.lastTime = elapsedTime;

        await new Promise(resolve => setTimeout(resolve, 1000)); // every second
      }
    };

    this.streamStartTime = Date.now();
    monitor(); // start monitor loop
  }

  stopTransmission(videoElement: HTMLVideoElement) {
    if (this.outputSocket) {
      this.outputSocket.close();
      this.outputSocket = null;
    }

    if (videoElement.srcObject) {
      const stream = videoElement.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoElement.srcObject = null;
    }
    this.localStream?.getTracks().forEach(track => track.stop());
    this.pc?.close();
    this.pc = null;
    this.localStream = null;
    this.connectionState$.next('disconnected');
    this.iceConnectionState$.next('disconnected');
  }
}
