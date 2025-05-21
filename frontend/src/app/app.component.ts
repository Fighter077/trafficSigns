import { Component } from '@angular/core';
import { CaptureComponent } from "./capture/capture.component";

@Component({
  selector: 'app-root',
  imports: [CaptureComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'traffic-signs-ang';
}
