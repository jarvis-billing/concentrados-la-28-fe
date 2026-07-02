import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { toast } from 'ngx-sonner';
import { PreSaleService } from '../../services/pre-sale.service';
import { PreSaleWebSocketService } from '../../services/pre-sale-websocket.service';
import { PreSaleDto, PreSaleFilterDto, PreSaleStatus } from '../../models/pre-sale';
import { LoginUserService } from '../../../auth/login/loginUser.service';

@Component({
  selector: 'app-preventa-list',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyPipe, DatePipe, RouterLink],
  templateUrl: './preventa-list.component.html',
  styleUrl: './preventa-list.component.css',
})
export class PreventaListComponent implements OnInit, OnDestroy {
  private preSaleService      = inject(PreSaleService);
  private preSaleWs           = inject(PreSaleWebSocketService);
  private loginUserService    = inject(LoginUserService);
  private router              = inject(Router);

  preventas: PreSaleDto[] = [];
  isLoading    = false;
  isMobileView = false;

  filterStatus:   PreSaleStatus | '' = '';
  filterFromDate  = '';
  filterToDate    = '';

  selectedItem: PreSaleDto | null = null;
  sortOrder: 'desc' | 'asc' = 'desc';
  canCancel = false;

  private wsSub: Subscription | null = null;

  private today(): string {
    return new Date().toISOString().split('T')[0];
  }

  // ── Totales ──────────────────────────────────────────────────────────────
  get totalAmount():        number { return this.preventas.reduce((s, p) => s + p.totalAmount, 0); }
  get countPending():       number { return this.preventas.filter(p => p.status === 'PENDING').length; }
  get countBilled():        number { return this.preventas.filter(p => p.status === 'BILLED').length; }
  get countCancelled():     number { return this.preventas.filter(p => p.status === 'CANCELLED').length; }
  get totalBilledAmount():  number { return this.preventas.filter(p => p.status === 'BILLED').reduce((s, p) => s + p.totalAmount, 0); }

  /** % de preventas facturadas sobre el total (incluyendo canceladas y pendientes) */
  get billedPercentage(): number {
    if (this.preventas.length === 0) return 0;
    return parseFloat(((this.countBilled / this.preventas.length) * 100).toFixed(2));
  }

  get billedPercentageVariant(): string {
    const pct = this.billedPercentage;
    debugger
    if (pct >= 70) return 'success';
    if (pct >= 40) return 'warning';
    return 'danger';
  }

  ngOnInit(): void {
    this.isMobileView = this.router.url.startsWith('/preventa/lista');

    const user = this.loginUserService.getUserFromToken();
    if (user) {
      const rol: string = user.rol || '';
      this.canCancel = rol.includes('ADMIN') || rol.includes('FACTURADOR');
    }

    this.filterFromDate = this.today();
    this.filterToDate   = this.today();
    this.loadList();

    // Conectar WS (si ya estaba conectado por factura.component, reutiliza la conexión)
    const token = window.localStorage.getItem('authToken');
    if (token) {
      this.preSaleWs.connect(token);
      this.wsSub = this.preSaleWs.events$.subscribe(event => {
        const { type, payload } = event;

        if (type === 'PREVENTA_CANCELLED' || type === 'PREVENTA_BILLED') {
          const newStatus: PreSaleStatus = type === 'PREVENTA_CANCELLED' ? 'CANCELLED' : 'BILLED';
          const idx = this.preventas.findIndex(p => p.id === payload.preSaleId);
          if (idx >= 0) {
            // Actualizar el estado en la lista sin recargar desde el servidor
            this.preventas[idx] = { ...this.preventas[idx], status: newStatus };
            // Actualizar también el detalle si está abierto
            if (this.selectedItem?.id === payload.preSaleId) {
              this.selectedItem = { ...this.selectedItem, status: newStatus };
            }
          }
          // Si la preventa llegó durante esta sesión y aún no está en la lista
          // (ocurre cuando el filtro de estado no la incluiría), no forzamos reload.
        } else if (type === 'PREVENTA_READY') {
          // Nueva preventa creada — agregarla si cae dentro del rango de fechas activo
          const createdDate = payload.createdAt?.substring(0, 10) ?? '';
          const inRange = (!this.filterFromDate || createdDate >= this.filterFromDate)
                       && (!this.filterToDate   || createdDate <= this.filterToDate);
          const statusMatch = !this.filterStatus || this.filterStatus === 'PENDING';
          if (inRange && statusMatch && !this.preventas.find(p => p.id === payload.preSaleId)) {
            const newEntry: PreSaleDto = {
              id:            payload.preSaleId,
              preSaleNumber: payload.preSaleNumber,
              status:        'PENDING',
              sellerName:    payload.sellerName,
              clientName:    payload.clientName,
              items:         [],
              totalAmount:   payload.totalAmount,
              createdAt:     payload.createdAt as string,
            };
            this.preventas = [newEntry, ...this.preventas];
          }
        }
      });
    }
  }

  ngOnDestroy(): void {
    this.wsSub?.unsubscribe();
  }

  goBack(): void {
    this.router.navigate(['/preventa']);
  }

  loadList(): void {
    this.isLoading = true;
    const filter: PreSaleFilterDto = {};
    if (this.filterStatus)   filter.status   = this.filterStatus;
    if (this.filterFromDate) filter.fromDate  = this.filterFromDate;
    if (this.filterToDate)   filter.toDate    = this.filterToDate;
    this.preSaleService.list(filter).subscribe({
      next: (data) => {
        this.preventas = data;
        this.sortList();
        this.isLoading = false;
      },
      error: () => {
        toast.error('Error al cargar las preventas');
        this.isLoading = false;
      },
    });
  }

  sortList(): void {
    this.preventas.sort((a, b) => {
      const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return this.sortOrder === 'desc' ? -diff : diff;
    });
  }

  toggleSort(): void {
    this.sortOrder = this.sortOrder === 'desc' ? 'asc' : 'desc';
    this.sortList();
  }

  clearFilters(): void {
    this.filterStatus   = '';
    this.filterFromDate = this.today();
    this.filterToDate   = this.today();
    this.loadList();
  }

  cancelPreventa(preventa: PreSaleDto): void {
    const label = preventa.clientName
      ? `${preventa.preSaleNumber} · ${preventa.clientName}`
      : preventa.preSaleNumber;

    toast.warning(`¿Cancelar ${label}?`, {
      description: 'Esta acción no se puede deshacer.',
      action: {
        label: 'Sí, cancelar',
        onClick: () => {
          this.preSaleService.cancel(preventa.id).subscribe({
            next: () => {
              toast.success(`Preventa ${preventa.preSaleNumber} cancelada`);
              // El WS actualizará el estado localmente; también forzamos reload para consistencia
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
      PENDING:   'Pendiente',
      BILLED:    'Facturada',
      CANCELLED: 'Cancelada',
    };
    return map[status] ?? status;
  }

  statusClass(status: PreSaleStatus): string {
    const map: Record<PreSaleStatus, string> = {
      PENDING:   'bg-warning text-dark',
      BILLED:    'bg-success',
      CANCELLED: 'bg-danger',
    };
    return map[status] ?? 'bg-secondary';
  }
}
