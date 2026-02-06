import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DashboardService, DashboardData } from './dashboard.service';
import { LoginUserService } from '../auth/login/loginUser.service';
import { AlertLevelColors, AlertLevelLabels } from '../inventario/models/inventory-dashboard';
import { BatchExpirationAlertComponent } from '../lotes/components/batch-expiration-alert/batch-expiration-alert.component';

@Component({
  selector: 'app-inicio',
  standalone: true,
  imports: [CommonModule, RouterLink, BatchExpirationAlertComponent],
  templateUrl: './inicio.component.html',
  styleUrls: ['./inicio.component.css']
})
export class InicioComponent implements OnInit {
  private dashboardService = inject(DashboardService);
  private loginUserService = inject(LoginUserService);

  dashboardData: DashboardData | null = null;
  isLoading = true;
  currentDate = new Date();
  userName = '';
  alertLevelColors = AlertLevelColors;
  alertLevelLabels = AlertLevelLabels;
  showAmounts = true;

  ngOnInit(): void {
    this.loadUserName();
    this.loadDashboardData();
  }

  private loadUserName(): void {
    const user = this.loginUserService.getUserFromToken();
    this.userName = user?.fullName || user?.username || 'Usuario';
  }

  private loadDashboardData(): void {
    this.isLoading = true;
    this.dashboardService.getDashboardData().subscribe({
      next: (data) => {
        this.dashboardData = data;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading dashboard:', error);
        this.isLoading = false;
      }
    });
  }

  refreshData(): void {
    this.loadDashboardData();
  }

  toggleAmounts(): void {
    this.showAmounts = !this.showAmounts;
  }

  getGreeting(): string {
    const hour = this.currentDate.getHours();
    if (hour < 12) return 'Buenos días';
    if (hour < 18) return 'Buenas tardes';
    return 'Buenas noches';
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  }

  formatDate(date: string | Date): string {
    return new Date(date).toLocaleString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  formatShortDate(date: Date): string {
    return date.toLocaleDateString('es-CO', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }
}
