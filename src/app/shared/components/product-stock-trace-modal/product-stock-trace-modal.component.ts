import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { urlConfig } from '../../../../config/config';

interface PurchaseTrace {
  purchaseDate: string | null;
  registrationDate: string | null;
  supplier: string | null;
  quantity: number;
}

interface InventoryCountTrace {
  date: string | null;
  physicalStock: number | null;
  systemStock: number | null;
  difference: number | null;
}

interface SaleTrace {
  saleDate: string | null;
  invoiceNumber: string | null;
  quantity: number;
}

interface StockTrace {
  lastPurchases: PurchaseTrace[];
  lastInventoryCounts: InventoryCountTrace[];
  lastSales: SaleTrace[];
}

@Component({
  selector: 'app-product-stock-trace-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (show) {
      <div class="trace-overlay" (click)="onOverlayClick($event)">
        <div class="trace-card" role="dialog" aria-modal="true" aria-labelledby="trace-title">
          <div class="trace-header">
            <i class="bi bi-graph-up trace-header-icon"></i>
            <div>
              <h2 class="trace-title" id="trace-title">Trazabilidad de Stock</h2>
              <p class="trace-product">{{ productName }}</p>
            </div>
            <button class="trace-close-btn" (click)="onClose()" aria-label="Cerrar">
              <i class="bi bi-x-lg"></i>
            </button>
          </div>

          @if (loading) {
            <div class="trace-loading">
              <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Cargando...</span>
              </div>
              <p class="mt-2 text-muted">Cargando historial...</p>
            </div>
          } @else if (error) {
            <div class="trace-error">
              <i class="bi bi-exclamation-circle text-danger"></i>
              <p>No se pudo cargar el historial.</p>
            </div>
          } @else {
            <div class="trace-sections">

              <div class="trace-section">
                <div class="trace-section-header purchases">
                  <i class="bi bi-truck"></i> Últimas compras
                </div>
                @if (trace?.lastPurchases?.length) {
                  <table class="trace-table">
                    <thead>
                      <tr>
                        <th>Fecha compra</th>
                        <th>Fecha registro</th>
                        <th>Proveedor</th>
                        <th>Cantidad</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (p of trace!.lastPurchases; track $index) {
                        <tr>
                          <td>{{ formatDate(p.purchaseDate) }}</td>
                          <td>{{ formatDate(p.registrationDate) }}</td>
                          <td>{{ p.supplier ?? '—' }}</td>
                          <td class="qty">{{ p.quantity }}</td>
                        </tr>
                      }
                      <tr class="total-row">
                        <td colspan="3">Total comprado</td>
                        <td class="qty">{{ totalPurchaseQty }}</td>
                      </tr>
                    </tbody>
                  </table>
                } @else {
                  <p class="trace-empty">Sin compras registradas.</p>
                }
              </div>

              <div class="trace-section">
                <div class="trace-section-header counts">
                  <i class="bi bi-clipboard-check"></i> Últimos conteos físicos
                </div>
                @if (trace?.lastInventoryCounts?.length) {
                  <table class="trace-table">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Stock físico</th>
                        <th>Stock sistema</th>
                        <th>Diferencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (c of trace!.lastInventoryCounts; track $index) {
                        <tr>
                          <td>{{ formatDate(c.date) }}</td>
                          <td class="qty">{{ c.physicalStock ?? '—' }}</td>
                          <td class="qty">{{ c.systemStock ?? '—' }}</td>
                          <td class="qty" [class.neg]="(c.difference ?? 0) < 0">
                            {{ c.difference != null ? (c.difference > 0 ? '+' : '') + c.difference : '—' }}
                          </td>
                        </tr>
                      }
                      <tr class="total-row">
                        <td>Total contado</td>
                        <td class="qty">{{ totalPhysicalStock }}</td>
                        <td class="qty">{{ totalSystemStock }}</td>
                        <td class="qty" [class.neg]="totalCountDifference < 0">
                          {{ totalCountDifference > 0 ? '+' : '' }}{{ totalCountDifference }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                } @else {
                  <p class="trace-empty">Sin conteos físicos registrados.</p>
                }
              </div>

              <div class="trace-section">
                <div class="trace-section-header sales">
                  <i class="bi bi-receipt"></i> Últimas ventas
                </div>
                @if (trace?.lastSales?.length) {
                  <table class="trace-table">
                    <thead>
                      <tr>
                        <th>Fecha venta</th>
                        <th>No. Factura</th>
                        <th>Cantidad</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (s of trace!.lastSales; track $index) {
                        <tr>
                          <td>{{ formatDate(s.saleDate) }}</td>
                          <td>{{ s.invoiceNumber ?? '—' }}</td>
                          <td class="qty">{{ s.quantity }}</td>
                        </tr>
                      }
                      <tr class="total-row">
                        <td colspan="2">Total vendido</td>
                        <td class="qty">{{ totalSaleQty }}</td>
                      </tr>
                    </tbody>
                  </table>
                } @else {
                  <p class="trace-empty">Sin ventas registradas.</p>
                }
              </div>
            </div>
          }

          <div class="trace-footer">
            <button class="btn btn-secondary btn-sm" (click)="onClose()">Cerrar</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .trace-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.65);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      animation: fade-in 0.15s ease;
      padding: 1rem;
    }
    @keyframes fade-in {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    .trace-card {
      background: #fff;
      border-radius: 16px;
      padding: 0;
      max-width: 640px;
      width: 100%;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 8px 40px rgba(0,0,0,0.35);
      overflow: hidden;
      animation: slide-up 0.2s ease;
    }
    @keyframes slide-up {
      from { transform: translateY(24px); opacity: 0; }
      to   { transform: translateY(0);    opacity: 1; }
    }
    .trace-header {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      padding: 1.25rem 1.5rem 1rem;
      background: #1e40af;
      color: #fff;
    }
    .trace-header-icon {
      font-size: 1.75rem;
      margin-top: 2px;
      flex-shrink: 0;
    }
    .trace-title {
      font-size: 1.15rem;
      font-weight: 700;
      margin: 0 0 0.2rem;
    }
    .trace-product {
      font-size: 0.875rem;
      margin: 0;
      opacity: 0.85;
    }
    .trace-close-btn {
      margin-left: auto;
      background: none;
      border: none;
      color: #fff;
      font-size: 1.1rem;
      cursor: pointer;
      padding: 0.25rem;
      opacity: 0.8;
      flex-shrink: 0;
    }
    .trace-close-btn:hover { opacity: 1; }
    .trace-loading, .trace-error {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 3rem 1rem;
      color: #6b7280;
    }
    .trace-sections {
      overflow-y: auto;
      padding: 1rem 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      flex: 1;
    }
    .trace-section {
      border-radius: 10px;
      overflow: hidden;
      border: 1px solid #e5e7eb;
    }
    .trace-section-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.55rem 1rem;
      font-weight: 600;
      font-size: 0.9rem;
    }
    .trace-section-header.purchases { background: #eff6ff; color: #1e40af; }
    .trace-section-header.counts    { background: #f0fdf4; color: #166534; }
    .trace-section-header.sales     { background: #fef9ee; color: #92400e; }
    .trace-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
    }
    .trace-table th {
      background: #f9fafb;
      color: #6b7280;
      font-weight: 600;
      padding: 0.45rem 0.75rem;
      text-align: left;
      border-bottom: 1px solid #e5e7eb;
    }
    .trace-table td {
      padding: 0.45rem 0.75rem;
      border-bottom: 1px solid #f3f4f6;
      color: #374151;
    }
    .trace-table tbody tr:last-child td { border-bottom: none; }
    .trace-table td.qty { text-align: right; font-weight: 600; }
    .trace-table td.neg { color: #dc2626; }
    .trace-table .total-row td {
      padding: 0.5rem 0.75rem;
      font-weight: 700;
      font-size: 0.85rem;
      border-top: 2px solid #d1d5db !important;
      border-bottom: none;
      background: #f3f4f6;
      color: #111827;
    }
    .trace-table .total-row td.qty { text-align: right; }
    .trace-empty {
      padding: 0.75rem 1rem;
      font-size: 0.85rem;
      color: #9ca3af;
      margin: 0;
    }
    .trace-footer {
      padding: 0.75rem 1.25rem;
      border-top: 1px solid #e5e7eb;
      display: flex;
      justify-content: flex-end;
    }
  `],
})
export class ProductStockTraceModalComponent implements OnChanges {
  @Input() show = false;
  @Input() productId = '';
  @Input() productName = '';
  @Output() closed = new EventEmitter<void>();

  trace: StockTrace | null = null;
  loading = false;
  error = false;

  private readonly baseUrl = urlConfig.getProductServiceUrl();

  constructor(private http: HttpClient) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['show'] && this.show && this.productId) {
      this.loadTrace();
    }
    if (changes['productId'] && this.show && this.productId) {
      this.loadTrace();
    }
  }

  private loadTrace(): void {
    this.loading = true;
    this.error = false;
    this.trace = null;
    this.http.get<StockTrace>(`${this.baseUrl}/${this.productId}/stock-trace`).subscribe({
      next: data => {
        this.trace = data;
        this.loading = false;
      },
      error: () => {
        this.error = true;
        this.loading = false;
      },
    });
  }

  get totalPurchaseQty(): number {
    return (this.trace?.lastPurchases ?? []).reduce((sum, p) => sum + (Number(p.quantity) || 0), 0);
  }

  get totalSaleQty(): number {
    return (this.trace?.lastSales ?? []).reduce((sum, s) => sum + (Number(s.quantity) || 0), 0);
  }

  get totalPhysicalStock(): number {
    return (this.trace?.lastInventoryCounts ?? []).reduce((sum, c) => sum + (c.physicalStock ?? 0), 0);
  }

  get totalSystemStock(): number {
    return (this.trace?.lastInventoryCounts ?? []).reduce((sum, c) => sum + (c.systemStock ?? 0), 0);
  }

  get totalCountDifference(): number {
    return (this.trace?.lastInventoryCounts ?? []).reduce((sum, c) => sum + (c.difference ?? 0), 0);
  }

  formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('es-CO', {
        year: 'numeric', month: '2-digit', day: '2-digit',
      });
    } catch {
      return dateStr;
    }
  }

  onClose(): void {
    this.closed.emit();
  }

  onOverlayClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('trace-overlay')) {
      this.closed.emit();
    }
  }
}
