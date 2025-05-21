export interface Stats {
    latencyMs: number;
    totalBytesSent: number;
    totalBytesReceived: number;
    elapsedTime: number;
    bytesPerSecond: number;
    bytesPerSecondAvg: number;
    imageWidth: number;
    imageHeight: number;
    fps: number;
    fpsAnalyzed: number;
}