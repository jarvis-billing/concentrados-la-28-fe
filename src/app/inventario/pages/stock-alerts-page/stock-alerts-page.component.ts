import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { InventoryService } from '../../services/inventory.service';
import { StockAlert, AlertLevel, AlertLevelLabels, AlertLevelColors } from '../../models/inventory-dashboard';
import { toast } from 'ngx-sonner';

@Component({
  selector: 'app-stock-alerts-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './stock-alerts-page.component.html',
  styleUrl: './stock-alerts-page.component.css'
})
export class StockAlertsPageComponent implements OnInit {
  private inventoryService = inject(InventoryService);

  alerts: StockAlert[] = [];
  isLoading = false;
  alertLevelLabels = AlertLevelLabels;
  alertLevelColors = AlertLevelColors;

  ngOnInit(): void {
    this.loadAlerts();
  }

  loadAlerts(): void {
    this.isLoading = true;
    this.inventoryService.getStockAlerts().subscribe({
      next: (data) => {
        this.alerts = data;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading alerts:', error);
        toast.error('Error al cargar alertas de stock');
        this.isLoading = false;
      }
    });
  }

  getAlertLabel(level: AlertLevel): string {
    return this.alertLevelLabels[level];
  }

  getAlertColor(level: AlertLevel): string {
    return this.alertLevelColors[level];
  }

  getAlertsByLevel(level: AlertLevel): StockAlert[] {
    return this.alerts.filter(a => a.alertLevel === level);
  }
}
