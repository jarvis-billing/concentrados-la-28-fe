import { Component, inject, OnInit } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { toast } from 'ngx-sonner';
import { PreSaleService } from '../../services/pre-sale.service';
import { PreSaleDto, PreSaleFilterDto, PreSaleStatus } from '../../models/pre-sale';

@Component({
  selector: 'app-preventa-list',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyPipe, DatePipe, RouterLink],
  templateUrl: './preventa-list.component.html',
})
export class PreventaListComponent implements OnInit {
  private preSaleService = inject(PreSaleService);

  preventas: PreSaleDto[] = [];
  isLoading = false;

  filterStatus: PreSaleStatus | '' = '';
  filterFromDate = '';
  filterToDate = '';

  selectedItem: PreSaleDto | null = null;

  private today(): string {
    return new Date().toISOString().split('T')[0];
  }

  // ── Totales ──────────────────────────────
  get totalAmount(): number {
    return this.preventas.reduce((s, p) => s + p.totalAmount, 0);
  }
  get countPending(): number {
    return this.preventas.filter(p => p.status === 'PENDING').length;
  }
  get countBilled(): number {
    return this.preventas.filter(p => p.status === 'BILLED').length;
  }
  get countCancelled(): number {
    return this.preventas.filter(p => p.status === 'CANCELLED').length;
  }
  get totalBilledAmount(): number {
    return this.preventas.filter(p => p.status === 'BILLED').reduce((s, p) => s + p.totalAmount, 0);
  }

  ngOnInit(): void {
    this.filterFromDate = this.today();
    this.filterToDate = this.today();
    this.loadList();
  }

  loadList(): void {
    this.isLoading = true;
    const filter: PreSaleFilterDto = {};
    if (this.filterStatus) filter.status = this.filterStatus;
    if (this.filterFromDate) filter.fromDate = this.filterFromDate;
    if (this.filterToDate) filter.toDate = this.filterToDate;
    this.preSaleService.list(filter).subscribe({
      next: (data) => {
        this.preventas = data;
        this.isLoading = false;
      },
      error: () => {
        toast.error('Error al cargar las preventas');
        this.isLoading = false;
      },
    });
  }

  clearFilters(): void {
    this.filterStatus = '';
    this.filterFromDate = this.today();
    this.filterToDate = this.today();
    this.loadList();
  }

  cancelPreventa(preventa: PreSaleDto): void {
    toast.warning(`¿Cancelar ${preventa.preSaleNumber}?`, {
      description: 'Esta acción no se puede deshacer.',
      action: {
        label: 'Sí, cancelar',
        onClick: () => {
          this.preSaleService.cancel(preventa.id).subscribe({
            next: () => {
              toast.success(`Preventa ${preventa.preSaleNumber} cancelada`);
              this.loadList();
            },
            error: () => toast.error('Error al cancelar la preventa'),
          });
        },
      },
    });
  }

  viewDetail(preventa: PreSaleDto): void {
    this.selectedItem = preventa;
  }

  closeDetail(): void {
    this.selectedItem = null;
  }

  statusLabel(status: PreSaleStatus): string {
    const map: Record<PreSaleStatus, string> = {
      PENDING: 'Pendiente',
      BILLED: 'Facturada',
      CANCELLED: 'Cancelada',
    };
    return map[status] ?? status;
  }

  statusClass(status: PreSaleStatus): string {
    const map: Record<PreSaleStatus, string> = {
      PENDING: 'bg-warning text-dark',
      BILLED: 'bg-success',
      CANCELLED: 'bg-danger',
    };
    return map[status] ?? 'bg-secondary';
  }
}
