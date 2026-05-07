import { Component, EventEmitter, inject, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupplierPayment } from '../../models/supplier-payment';
import { PurchaseInvoice } from '../../models/purchase-invoice';
import { SupplierPaymentsService } from '../../services/supplier-payments.service';
import { PurchasesService } from '../../services/purchases.service';
import { toast } from 'ngx-sonner';

@Component({
  selector: 'app-link-payments-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './link-payments-modal.component.html'
})
export class LinkPaymentsModalComponent {
  private supplierPaymentsService = inject(SupplierPaymentsService);
  private purchasesService = inject(PurchasesService);

  @Output() linked = new EventEmitter<void>();

  isOpen = false;
  loading = false;
  saving = false;

  invoice: PurchaseInvoice | null = null;
  availablePayments: SupplierPayment[] = [];
  selectedPaymentIds: Set<string> = new Set();

  open(invoice: PurchaseInvoice) {
    this.invoice = invoice;
    this.selectedPaymentIds = new Set();
    this.availablePayments = [];
    this.isOpen = true;
    this.loadUnlinkedPayments();
  }

  close() {
    this.isOpen = false;
    this.invoice = null;
    this.availablePayments = [];
    this.selectedPaymentIds = new Set();
  }

  private loadUnlinkedPayments() {
    if (!this.invoice?.supplier?.id) return;
    this.loading = true;
    this.supplierPaymentsService.listUnlinked(this.invoice.supplier.id).subscribe({
      next: (payments) => {
        this.availablePayments = payments;
        this.loading = false;
      },
      error: () => {
        toast.error('Error al cargar pagos disponibles');
        this.loading = false;
      }
    });
  }

  togglePayment(paymentId: string) {
    if (this.selectedPaymentIds.has(paymentId)) {
      this.selectedPaymentIds.delete(paymentId);
    } else {
      this.selectedPaymentIds.add(paymentId);
    }
  }

  isSelected(paymentId: string): boolean {
    return this.selectedPaymentIds.has(paymentId);
  }

  get selectedPayments(): SupplierPayment[] {
    return this.availablePayments.filter(p => p.id && this.selectedPaymentIds.has(p.id));
  }

  get totalSelected(): number {
    return this.selectedPayments.reduce((sum, p) => sum + (p.remainingAmount ?? p.amount ?? 0), 0);
  }

  get totalInvoice(): number {
    return this.invoice?.total ?? 0;
  }

  get alreadyPaid(): number {
    return this.invoice?.totalPaid ?? 0;
  }

  get remainingToPay(): number {
    return this.totalInvoice - this.alreadyPaid;
  }

  get resultingPaid(): number {
    return this.alreadyPaid + this.totalSelected;
  }

  get resultingStatus(): string {
    if (this.resultingPaid === 0) return 'PENDIENTE';
    const diff = Math.abs(this.totalInvoice - this.resultingPaid);
    if (diff <= 1) return 'PAGADO';
    if (this.resultingPaid > this.totalInvoice) return 'SOBREPAGADO';
    return 'PARCIAL';
  }

  confirm() {
    if (!this.invoice?.id || this.selectedPaymentIds.size === 0) return;
    this.saving = true;
    const paymentIds = Array.from(this.selectedPaymentIds);
    this.purchasesService.linkPayments(this.invoice.id, paymentIds).subscribe({
      next: () => {
        toast.success('Pagos vinculados exitosamente');
        this.saving = false;
        this.linked.emit();
        this.close();
      },
      error: (err) => {
        const msg = err?.error?.message || 'Error al vincular pagos';
        toast.error(msg);
        this.saving = false;
      }
    });
  }

  formatCurrency(value: number | undefined | null): string {
    const numValue = Number(value) || 0;
    if (!isFinite(numValue)) return '$ 0';
    return '$ ' + new Intl.NumberFormat('es-CO', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(numValue);
  }

  getMethodLabel(method: string): string {
    const labels: Record<string, string> = {
      'EFECTIVO': 'Efectivo',
      'TRANSFERENCIA': 'Transferencia',
      'TARJETA_CREDITO': 'T. Crédito',
      'TARJETA_DEBITO': 'T. Débito',
      'CHEQUE': 'Cheque'
    };
    return labels[method] || method;
  }

  getStatusBadgeClass(): string {
    switch (this.resultingStatus) {
      case 'PAGADO': return 'badge bg-success';
      case 'SOBREPAGADO': return 'badge bg-danger';
      case 'PARCIAL': return 'badge bg-warning text-dark';
      default: return 'badge bg-secondary';
    }
  }

  getStatusLabel(): string {
    const labels: Record<string, string> = {
      'PENDIENTE': 'Pendiente',
      'PARCIAL': 'Parcial',
      'PAGADO': 'Pagado',
      'SOBREPAGADO': 'Sobrepagado'
    };
    return labels[this.resultingStatus] || this.resultingStatus;
  }
}
