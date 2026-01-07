import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { InventoryService } from '../../services/inventory.service';
import { InventoryDashboard } from '../../models/inventory-dashboard';
import { AlertLevel, AlertLevelLabels, AlertLevelColors } from '../../models/inventory-dashboard';

@Component({
  selector: 'app-inventory-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './inventory-dashboard.component.html',
  styleUrl: './inventory-dashboard.component.css'
})
export class InventoryDashboardComponent implements OnInit {
  private inventoryService = inject(InventoryService);
  
  dashboard: InventoryDashboard | null = null;
  isLoading = false;

  ngOnInit(): void {
    this.loadDashboard();
  }

  loadDashboard(): void {
    this.isLoading = true;
    this.inventoryService.getDashboard().subscribe({
      next: (data) => {
        this.dashboard = data;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading dashboard:', error);
        this.isLoading = false;
      }
    });
  }

  getAlertLabel(level: AlertLevel): string {
    return AlertLevelLabels[level];
  }

  getAlertColor(level: AlertLevel): string {
    return AlertLevelColors[level];
  }
}
