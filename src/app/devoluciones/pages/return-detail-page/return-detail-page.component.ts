import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MerchandiseReturnsService } from '../../services/merchandise-returns.service';
import { MerchandiseReturnDto, EReturnResolution } from '../../models/merchandise-return';
import { toast } from 'ngx-sonner';

@Component({
  selector: 'app-return-detail-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './return-detail-page.component.html'
})
export class ReturnDetailPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private returnsService = inject(MerchandiseReturnsService);

  returnData: MerchandiseReturnDto | null = null;
  isLoading = true;
  showCancelModal = false;
  cancelReason = '';
  isCancelling = false;

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.router.navigate(['/main/devoluciones']); return; }
    this.returnsService.getById(id).subscribe({
      next: (r) => { this.returnData = r; this.isLoading = false; },
      error: () => {
        toast.error('No se encontró la devolución');
        this.isLoading = false;
        this.router.navigate(['/main/devoluciones']);
      }
    });
  }

  openCancelModal(): void {
    this.cancelReason = '';
    this.showCancelModal = true;
  }

  closeCancelModal(): void {
    this.showCancelModal = false;
  }

  confirmCancel(): void {
    if (!this.cancelReason.trim()) {
      toast.warning('Ingresa la razón de anulación');
      return;
    }
    if (!this.returnData?.id) return;
    this.isCancelling = true;
    this.returnsService.cancel(this.returnData.id, this.cancelReason.trim()).subscribe({
      next: (updated) => {
        this.returnData = updated;
        this.isCancelling = false;
        this.showCancelModal = false;
        toast.success('Devolución anulada. El stock fue revertido automáticamente.');
      },
      error: (err) => {
        toast.error(err?.error?.message || 'Error al anular la devolución');
        this.isCancelling = false;
      }
    });
  }

  get isProcessed(): boolean {
    return this.returnData?.status === 'PROCESADA';
  }

  get isSaleReturn(): boolean {
    return this.returnData?.returnType === 'DEVOLUCION_VENTA';
  }

  getResolutionLabel(val: EReturnResolution | undefined): string {
    const map: Record<string, string> = {
      NOTA_CREDITO: 'Nota Crédito',
      REEMBOLSO_EFECTIVO: 'Reembolso Efectivo',
      REEMBOLSO_TRANSFERENCIA: 'Reembolso Transferencia',
      CAMBIO_PRODUCTO: 'Cambio de Producto',
      ABONO_PROVEEDOR: 'Abono Proveedor',
      REEMBOLSO_PROVEEDOR: 'Reembolso Proveedor'
    };
    return map[val || ''] || val || '';
  }

  getStatusBadge(status: string | undefined): string {
    switch (status) {
      case 'PROCESADA': return 'badge bg-success fs-6';
      case 'ANULADA':   return 'badge bg-danger fs-6';
      default:          return 'badge bg-secondary fs-6';
    }
  }

  getTypeBadge(): string {
    return this.isSaleReturn ? 'badge bg-primary' : 'badge bg-warning text-dark';
  }

  getTypeLabel(): string {
    return this.isSaleReturn ? 'Devolución de Venta' : 'Devolución de Compra';
  }

  formatCurrency(value: number | undefined): string {
    const n = Number(value) || 0;
    return '$ ' + new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
  }

  formatDate(dateStr: string | undefined): string {
    if (!dateStr) return '-';
    const part = dateStr.split('T')[0];
    const [y, m, d] = part.split('-');
    return new Date(+y, +m - 1, +d).toLocaleDateString('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }

  formatDateTime(dateStr: string | undefined): string {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('es-ES', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  }
}
