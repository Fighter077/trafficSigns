import { AfterViewInit, Component, ElementRef, ViewChild } from '@angular/core';
import { WebrtcService } from '../services/webrtc.service';
import { BehaviorSubject } from 'rxjs';
import { CommonModule } from '@angular/common';
import { Stats } from '../interfaces/stats.interface';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-capture',
  imports: [
    CommonModule,
    FormsModule
  ],
  templateUrl: './capture.component.html',
  styleUrl: './capture.component.scss'
})
export class CaptureComponent implements AfterViewInit {
  @ViewChild('video')
  videoElement!: ElementRef<HTMLVideoElement>;
  @ViewChild('image')
  imageElement!: ElementRef<HTMLImageElement>;

  connectionState$: BehaviorSubject<string> = new BehaviorSubject<string>('not connected');
  iceConnectionState$ = new BehaviorSubject<string>('not connected');

  countOutput: boolean = false;

  meanColor$ = new BehaviorSubject<{ r: number, g: number, b: number }>({ r: 0, g: 0, b: 0 });
  stats$ = new BehaviorSubject<Stats>({
    latencyMs: 0,
    totalBytesSent: 0,
    totalBytesReceived: 0,
    elapsedTime: 0,
    bytesPerSecond: 0,
    bytesPerSecondAvg: 0,
    imageWidth: 0,
    imageHeight: 0,
    fps: 0
  });

  transmitting = false;

  constructor(private webrtcService: WebrtcService) {
    this.connectionState$ = this.webrtcService.connectionState$;
    this.iceConnectionState$ = this.webrtcService.iceConnectionState$;
    this.meanColor$ = this.webrtcService.meanColor$;
    this.stats$ = this.webrtcService.stats$;
  }

  ngAfterViewInit() {
    this.webrtcService.returnedImage$.subscribe((image) => {
      if (image) {
        this.imageElement.nativeElement.src = 'data:image/jpeg;base64,' + image;
      }
    });
  }

  async toggleTransmission() {
    if (this.transmitting) {
      this.webrtcService.stopTransmission(this.videoElement.nativeElement);
      this.transmitting = false;
    } else {
      await this.webrtcService.startWebRTC(this.videoElement.nativeElement);
      this.transmitting = true;
    }
  }

  toggleCountOutput() {
    this.countOutput = !this.countOutput;
    this.webrtcService.setCountOutput(this.countOutput);
  }

}
