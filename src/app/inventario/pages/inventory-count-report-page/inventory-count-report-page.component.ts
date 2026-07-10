import { Component, inject, OnInit } from '@angular/core';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InventoryCountService } from '../../services/inventory-count.service';
import {
  InventoryCountReportDto,
  InventoryCountSessionDto,
} from '../../models/inventory-count';
import { toast } from 'ngx-sonner';

type Tab = 'counted' | 'uncounted';

@Component({
  selector: 'app-inventory-count-report-page',
  standalone: true,
  imports: [CommonModule, FormsModule, DecimalPipe, DatePipe],
  templateUrl: './inventory-count-report-page.component.html',
  styleUrl: './inventory-count-report-page.component.css',
})
export class InventoryCountReportPageComponent implements OnInit {
  private countService = inject(InventoryCountService);

  sessions: InventoryCountSessionDto[] = [];
  isLoadingSessions = false;

  selectedSession: InventoryCountSessionDto | null = null;
  report: InventoryCountReportDto | null = null;
  isLoadingReport = false;

  activeTab: Tab = 'counted';

  // Filtros
  fromDate = '';
  toDate = '';

  // Filtro texto dentro del reporte
  countedFilter = '';
  uncountedFilter = '';

  ngOnInit(): void {
    this.loadSessions();
  }

  loadSessions(): void {
    this.isLoadingSessions = true;
    this.countService.listSessions(this.fromDate || undefined, this.toDate || undefined).subscribe({
      next: (s) => {
        this.sessions = s;
        this.isLoadingSessions = false;
      },
      error: () => {
        this.isLoadingSessions = false;
        toast.error('Error al cargar las sesiones');
      },
    });
  }

  selectSession(session: InventoryCountSessionDto): void {
    this.selectedSession = session;
    this.report = null;
    this.activeTab = 'counted';
    this.countedFilter = '';
    this.uncountedFilter = '';

    this.isLoadingReport = true;
    this.countService.getReport(session.id).subscribe({
      next: (r) => {
        this.report = r;
        this.isLoadingReport = false;
      },
      error: () => {
        this.isLoadingReport = false;
        toast.error('Error al cargar el reporte');
      },
    });
  }

  clearSelection(): void {
    this.selectedSession = null;
    this.report = null;
  }

  statusLabel(status: string): string {
    const map: Record<string, string> = {
      IN_PROGRESS: 'En progreso',
      PAUSED: 'Pausada',
      COMPLETED: 'Completada',
      CANCELLED: 'Cancelada',
    };
    return map[status] ?? status;
  }

  statusBadgeClass(status: string): string {
    return {
      IN_PROGRESS: 'bg-primary',
      PAUSED: 'bg-warning text-dark',
      COMPLETED: 'bg-success',
      CANCELLED: 'bg-secondary',
    }[status] ?? 'bg-secondary';
  }

  coverageClass(pct: number): string {
    if (pct >= 80) return 'text-success';
    if (pct >= 50) return 'text-warning';
    return 'text-danger';
  }

  differenceClass(diff: number): string {
    if (diff > 0) return 'text-success';
    if (diff < 0) return 'text-danger';
    return 'text-muted';
  }

  get filteredCounted() {
    if (!this.report) return [];
    const q = this.countedFilter.toLowerCase();
    if (!q) return this.report.counted;
    return this.report.counted.filter(
      e => e.description.toLowerCase().includes(q) || e.barcode.toLowerCase().includes(q)
    );
  }

  get filteredUncounted() {
    if (!this.report) return [];
    const q = this.uncountedFilter.toLowerCase();
    if (!q) return this.report.uncounted;
    return this.report.uncounted.filter(
      e => e.description.toLowerCase().includes(q) || e.barcode.toLowerCase().includes(q)
    );
  }
}
