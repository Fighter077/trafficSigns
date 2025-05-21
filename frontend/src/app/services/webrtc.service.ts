import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Stats } from '../interfaces/stats.interface';

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
  public returnedImage$: BehaviorSubject<string | null> = new BehaviorSubject<string | null>(null);
  public returnedDetections$: BehaviorSubject<any> = new BehaviorSubject<any>(null);

  public stats$: BehaviorSubject<Stats> = new BehaviorSubject<Stats>({
    latencyMs: 0,
    totalBytesSent: 0,
    totalBytesReceived: 0,
    elapsedTime: 0,
    bytesPerSecond: 0,
    bytesPerSecondAvg: 0,
    imageWidth: 0,
    imageHeight: 0,
    fps: 0,
    fpsAnalyzed: 0
  });

  private lastTotalBytes: number = 0;
  private lastBytesSent: number = 0;
  private lastBytesReceived: number = 0;
  private lastTime: number = 0;

  private countOutput: boolean = false;

  private totalBytesWebSocket: number = 0;

  private streamStartTime: number | null = null;

  async startWebRTC(videoElement: HTMLVideoElement) {
    const clientId = crypto.randomUUID(); // Or use any unique ID

    await this.openWebSocket(clientId);
    await this.createConnection(videoElement, clientId);
  }

  createConnection = async (videoElement: HTMLVideoElement, clientId: string) => {
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
      const parameters = videoSender.getParameters();
      if (!parameters.encodings) {
        parameters.encodings = [{}];
      }
      parameters.degradationPreference = 'balanced';
      parameters.encodings[0].maxBitrate = 500_000;  // 500 kbit/s -> 62.5 kB/s
      parameters.encodings[0].maxFramerate = 20; // 20 fps
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

  startStatsMonitor() {
    if (!this.pc) return;

    const monitor = async () => {
      while (this.pc && (this.pc.connectionState === 'new' || this.pc.connectionState === 'connected')) {
        const stats: RTCStatsReport = await this.pc.getStats();

        let bytesSentNow = 0;
        let bytesReceivedNow = 0;
        let fps = 0;

        stats.forEach(report => {
          if (report.type === 'outbound-rtp' && report.kind === 'video') {
            bytesSentNow = report.bytesSent || 0;
            fps = report.framesPerSecond || 0;
          } else if (report.type === 'inbound-rtp' && report.kind === 'video') {
            bytesReceivedNow = report.bytesReceived || 0;
          }
        });

        bytesReceivedNow += this.totalBytesWebSocket;
        const totalBytesNow = bytesSentNow + bytesReceivedNow;

        const now = Date.now();
        const elapsedTime = (now - this.streamStartTime!) / 1000;

        const deltaTime = elapsedTime - this.lastTime;
        const deltaBytes = totalBytesNow - this.lastTotalBytes;

        const bytesPerSecond = deltaTime > 0 ? deltaBytes / deltaTime : 0;
        const bytesPerSecondAvg = totalBytesNow / elapsedTime;

        this.lastBytesSent = bytesSentNow;
        this.lastBytesReceived = bytesReceivedNow;
        this.lastTotalBytes = totalBytesNow;
        this.lastTime = elapsedTime;

        this.stats$.next({
          ...this.stats$.getValue(),
          totalBytesSent: bytesSentNow,
          totalBytesReceived: bytesReceivedNow,
          elapsedTime: Math.round(elapsedTime),
          bytesPerSecond,
          bytesPerSecondAvg,
          fps: Math.round(fps),
        });

        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    };

    this.streamStartTime = Date.now();
    monitor();
  }

  stopTransmission(videoElement: HTMLVideoElement) {
    this.closeWebSocket();

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

  setCountOutput(countOutput: boolean) {
    if (this.outputSocket) {
      this.countOutput = countOutput;
    }
  }

  openWebSocket(clientId: string) {
    return new Promise<void>((resolve, reject) => {
      this.outputSocket = new WebSocket(`ws://localhost:8080/ws?clientId=${clientId}`);
      this.outputSocket.onopen = async () => {
        if (this.outputSocket) {
          resolve();
          this.outputSocket.onmessage = (event) => {
            if (this.countOutput) {
              this.totalBytesWebSocket += event.data.length;
            }
            const message = JSON.parse(event.data);
            this.meanColor$.next(message.mean_color);
            if (message.timestamp && message.fps) {
              const now = Date.now();
              // reduce to one decimal place
              this.stats$.next({
                ...this.stats$.getValue(),
                latencyMs: Math.max(Math.round((now - message.timestamp) * 10) / 10, 1),
                imageWidth: message.image?.width || 0,
                imageHeight: message.image?.height || 0,
                fpsAnalyzed: Math.round(message.fps * 10) / 10
              });
            }
            if (message.image) {
              this.returnedImage$.next(message.image.data);
            }
            if (message.detections) {
              this.returnedDetections$.next(
                message.detections.map((detection: any) => ({
                  ...detection,
                  id: crypto.randomUUID(),
                }))
              );
            }
          };
        }
      }
    });
  }

  closeWebSocket() {
    if (this.outputSocket) {
      this.outputSocket.close();
      this.outputSocket = null;
    }
  }
}
