import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-stock-warning-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (show) {
      <div class="stock-warning-overlay" (click)="onOverlayClick($event)">
        <div class="stock-warning-card" role="alertdialog" aria-modal="true" aria-labelledby="swm-title">
          <div class="swm-icon-wrap">
            <i class="bi bi-exclamation-triangle-fill swm-icon"></i>
          </div>
          <h2 class="swm-title" id="swm-title">¡Sin Stock Disponible!</h2>
          <p class="swm-product">{{ productName }}</p>
          <div class="swm-stock-badge">
            <i class="bi bi-box-seam me-1"></i>
            Stock actual: <strong>{{ stockQty }} {{ stockUnit }}</strong>
          </div>
          <p class="swm-message">
            Este producto no tiene unidades en inventario.<br>
            ¿Desea agregarlo a la venta de todas formas?
          </p>
          <div class="swm-actions">
            <button class="swm-btn swm-btn-cancel" (click)="onCancel()">
              <i class="bi bi-x-circle me-1"></i>No, cancelar
            </button>
            <button class="swm-btn swm-btn-confirm" (click)="onConfirm()">
              <i class="bi bi-check-circle me-1"></i>Sí, continuar
            </button>
          </div>
          @if (productId) {
            <button class="swm-trace-btn" (click)="onViewTrace()">
              <i class="bi bi-graph-up me-1"></i>Ver historial de stock
            </button>
          }
        </div>
      </div>
    }
  `,
  styles: [`
    .stock-warning-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.65);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      animation: swm-fade-in 0.15s ease;
    }
    @keyframes swm-fade-in {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    .stock-warning-card {
      background: #fff;
      border-radius: 16px;
      padding: 2rem 2.5rem;
      max-width: 420px;
      width: 90%;
      text-align: center;
      box-shadow: 0 8px 40px rgba(0,0,0,0.35);
      animation: swm-slide-up 0.2s ease;
      border-top: 6px solid #f59e0b;
    }
    @keyframes swm-slide-up {
      from { transform: translateY(24px); opacity: 0; }
      to   { transform: translateY(0);    opacity: 1; }
    }
    .swm-icon-wrap {
      margin-bottom: 0.75rem;
    }
    .swm-icon {
      font-size: 3.5rem;
      color: #f59e0b;
    }
    .swm-title {
      font-size: 1.5rem;
      font-weight: 700;
      color: #92400e;
      margin: 0 0 0.5rem;
    }
    .swm-product {
      font-size: 1.05rem;
      font-weight: 600;
      color: #1f2937;
      margin: 0 0 0.75rem;
      background: #fef3c7;
      border-radius: 8px;
      padding: 0.5rem 1rem;
    }
    .swm-stock-badge {
      display: inline-block;
      background: #fee2e2;
      color: #991b1b;
      border-radius: 20px;
      padding: 0.35rem 1rem;
      font-size: 0.95rem;
      margin-bottom: 1rem;
    }
    .swm-message {
      color: #374151;
      font-size: 0.95rem;
      line-height: 1.6;
      margin-bottom: 1.5rem;
    }
    .swm-actions {
      display: flex;
      gap: 0.75rem;
      justify-content: center;
    }
    .swm-btn {
      flex: 1;
      border: none;
      border-radius: 8px;
      padding: 0.65rem 1rem;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.15s;
    }
    .swm-btn:hover { opacity: 0.88; }
    .swm-btn-cancel {
      background: #e5e7eb;
      color: #374151;
    }
    .swm-btn-confirm {
      background: #f59e0b;
      color: #fff;
    }
    .swm-trace-btn {
      display: block;
      width: 100%;
      margin-top: 0.75rem;
      border: none;
      border-radius: 8px;
      padding: 0.5rem 1rem;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      background: #eff6ff;
      color: #1e40af;
      transition: background 0.15s;
    }
    .swm-trace-btn:hover { background: #dbeafe; }
  `],
})
export class StockWarningModalComponent {
  @Input() show = false;
  @Input() productName = '';
  @Input() stockQty = 0;
  @Input() stockUnit = '';
  @Input() productId = '';

  @Output() confirmed = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();
  @Output() viewTrace = new EventEmitter<void>();

  onConfirm(): void {
    this.confirmed.emit();
  }

  onCancel(): void {
    this.cancelled.emit();
  }

  onViewTrace(): void {
    this.viewTrace.emit();
  }

  onOverlayClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('stock-warning-overlay')) {
      this.cancelled.emit();
    }
  }
}
