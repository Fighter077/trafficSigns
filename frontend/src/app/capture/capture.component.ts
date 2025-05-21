import { AfterViewInit, Component, ElementRef, ViewChild } from '@angular/core';
import { WebrtcService } from '../services/webrtc.service';
import { BehaviorSubject } from 'rxjs';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-capture',
  imports: [
    CommonModule
  ],
  templateUrl: './capture.component.html',
  styleUrl: './capture.component.scss'
})
export class CaptureComponent implements AfterViewInit {
  @ViewChild('video')
  videoElement!: ElementRef<HTMLVideoElement>;

  connectionState$: BehaviorSubject<string> = new BehaviorSubject<string>('not connected');
  iceConnectionState$ = new BehaviorSubject<string>('not connected');

  meanColor$ = new BehaviorSubject<{ r: number, g: number, b: number }>({ r: 0, g: 0, b: 0 });
  latencyMs$ = new BehaviorSubject<number>(0);
  sentBytes$ = new BehaviorSubject<number>(0);
  byteRate$ = new BehaviorSubject<number>(0);
  byteRateAvg$ = new BehaviorSubject<number>(0);
  streamDuration$ = new BehaviorSubject<number>(0);

  transmitting = false;

  constructor(private webrtcService: WebrtcService) {
    this.connectionState$ = this.webrtcService.connectionState$;
    this.iceConnectionState$ = this.webrtcService.iceConnectionState$;
    this.meanColor$ = this.webrtcService.meanColor$;
    this.latencyMs$ = this.webrtcService.latencyMs$;
    this.sentBytes$ = this.webrtcService.sentBytes$;
    this.byteRate$ = this.webrtcService.byteRate$;
    this.byteRateAvg$ = this.webrtcService.byteRateAvg$;
    this.streamDuration$ = this.webrtcService.streamDuration$;
  }

  ngAfterViewInit() {
    //this.webrtcService.startWebRTC(this.videoElement.nativeElement);
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

}
