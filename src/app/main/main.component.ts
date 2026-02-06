import { Component } from '@angular/core';
import { Router, RouterOutlet, NavigationStart, NavigationEnd, NavigationCancel, NavigationError } from '@angular/router';
import { MenuComponent } from '../menu/menu.component';
import { LoadingOverlayComponent } from '../loading/loading-overlay.component';
import { LoadingService } from '../loading/loading.service';
import { BatchExpirationAlertComponent } from '../lotes/components/batch-expiration-alert/batch-expiration-alert.component';

@Component({
  selector: 'app-main',
  standalone: true,
  imports: [RouterOutlet, MenuComponent, LoadingOverlayComponent, BatchExpirationAlertComponent],
  templateUrl: './main.component.html'
})
export class MainComponent {
  constructor(private router: Router, private loading: LoadingService) {
    this.router.events.subscribe(evt => {
      if (evt instanceof NavigationStart) {
        this.loading.start();
      }
      if (evt instanceof NavigationEnd || evt instanceof NavigationCancel || evt instanceof NavigationError) {
        this.loading.stop();
      }
    });
  }
}
