import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LoadingService } from './loading.service';
import { LoginUserService } from '../auth/login/loginUser.service';

@Component({
  selector: 'app-loading-overlay',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './loading-overlay.component.html',
  styleUrls: ['./loading-overlay.component.css']
})
export class LoadingOverlayComponent {
  isLoading$ = this.loadingService.isLoading$;

  private loginUserService = inject(LoginUserService);

  get userName(): string {
    const user = this.loginUserService.getUserFromToken();
    return user?.fullName || user?.name || user?.username || '';
  }

  constructor(private loadingService: LoadingService) {}
}
