import { Component, EventEmitter, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupplierPayment, PaymentMethod } from '../../models/supplier-payment';
import { PurchasePaymentType } from '../../models/purchase-invoice';
import { BankAccountService } from '../../../bank-accounts/services/bank-account.service';
import { BankAccountDto } from '../../../bank-accounts/models/bank-account.model';
import { CurrencyFormatDirective } from '../../../directive/currency-format.directive';
import { toast } from 'ngx-sonner';

export interface PurchasePaymentModalData {
  supplierName: string;
  invoiceNumber: string;
  paymentType: PurchasePaymentType;
  total: number;
  advances: SupplierPayment[]; // anticipos disponibles del proveedor, más antiguos primero
}

export interface PurchasePaymentResult {
  newPayment?: SupplierPayment;
  advancePaymentIds: string[];
}

/**
 * Registro del pago al guardar una factura de compra.
 * - CONTADO: obligatorio; anticipos + pago nuevo deben cubrir el total.
 * - CREDITO: opcional; permite aplicar anticipos (pagos por adelantado) o registrar un abono.
 */
@Component({
  selector: 'app-purchase-payment-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyFormatDirective],
  templateUrl: './purchase-payment-modal.component.html'
})
export class PurchasePaymentModalComponent {
  private bankAccountService = inject(BankAccountService);

  @Output() confirmed = new EventEmitter<PurchasePaymentResult>();
  @Output() cancelled = new EventEmitter<void>();

  isOpen = false;
  data: PurchasePaymentModalData | null = null;
  bankAccounts: BankAccountDto[] = [];

  selectedAdvanceIds = new Set<string>();
  registerNewPayment = false;
  method: PaymentMethod = 'EFECTIVO';
  bankAccountId = '';
  reference = '';
  paymentDate = this.todayIso();
  amount = 0;

  open(data: PurchasePaymentModalData) {
    this.data = data;
    this.method = 'EFECTIVO';
    this.bankAccountId = '';
    this.reference = '';
    this.paymentDate = this.todayIso();

    // Preseleccionar anticipos (más antiguos primero) hasta cubrir el total
    this.selectedAdvanceIds = new Set();
    let covered = 0;
    for (const adv of data.advances) {
      if (covered >= data.total) break;
      this.selectedAdvanceIds.add(adv.id!);
      covered += this.availableOf(adv);
    }

    this.registerNewPayment = this.isCash && this.remainingAfterAdvances > 0;
    this.amount = this.remainingAfterAdvances;
    this.isOpen = true;

    if (this.bankAccounts.length === 0) {
      this.bankAccountService.listActive().subscribe({
        next: (accounts) => this.bankAccounts = accounts,
        error: () => {}
      });
    }
  }

  close() {
    this.isOpen = false;
    this.data = null;
  }

  cancel() {
    this.close();
    this.cancelled.emit();
  }

  get isCash(): boolean {
    return this.data?.paymentType === 'CONTADO';
  }

  get total(): number {
    return this.data?.total ?? 0;
  }

  availableOf(p: SupplierPayment): number {
    return Number(p.remainingAmount ?? p.amount) || 0;
  }

  isAdvanceSelected(p: SupplierPayment): boolean {
    return this.selectedAdvanceIds.has(p.id!);
  }

  toggleAdvance(p: SupplierPayment) {
    if (this.selectedAdvanceIds.has(p.id!)) {
      this.selectedAdvanceIds.delete(p.id!);
    } else {
      this.selectedAdvanceIds.add(p.id!);
    }
    // Ajustar el pago nuevo a lo que falte
    if (this.registerNewPayment || this.isCash) {
      this.amount = this.remainingAfterAdvances;
      this.registerNewPayment = this.isCash ? this.amount > 0 : this.registerNewPayment;
    }
  }

  /** Lo que se toma de los anticipos (nunca más que el total de la factura) */
  get advancesApplied(): number {
    const sum = (this.data?.advances ?? [])
      .filter(a => this.selectedAdvanceIds.has(a.id!))
      .reduce((s, a) => s + this.availableOf(a), 0);
    return Math.min(sum, this.total);
  }

  get remainingAfterAdvances(): number {
    return Math.max(this.total - this.advancesApplied, 0);
  }

  get newPaymentAmount(): number {
    return this.registerNewPayment ? (Number(this.amount) || 0) : 0;
  }

  get totalCovered(): number {
    return this.advancesApplied + this.newPaymentAmount;
  }

  /** Falta por cubrir (solo relevante en contado) */
  get missing(): number {
    return Math.max(this.total - this.totalCovered, 0);
  }

  /** Parte del pago nuevo que excede la factura y queda como anticipo */
  get excess(): number {
    return Math.max(this.totalCovered - this.total, 0);
  }

  get isBankMethod(): boolean {
    return this.method !== 'EFECTIVO';
  }

  toggleNewPayment() {
    this.registerNewPayment = !this.registerNewPayment;
    if (this.registerNewPayment && !this.amount) {
      this.amount = this.remainingAfterAdvances;
    }
  }

  confirm() {
    if (!this.data) return;
    if (this.registerNewPayment) {
      if (this.newPaymentAmount <= 0) {
        toast.warning('El valor del pago debe ser mayor a 0');
        return;
      }
      if (this.isBankMethod && !this.bankAccountId) {
        toast.warning('Seleccione la cuenta bancaria del pago');
        return;
      }
    }
    if (this.isCash && this.missing > 1) {
      toast.warning(`La factura de contado debe quedar pagada. Faltan ${this.formatMoney(this.missing)}`);
      return;
    }

    const account = this.bankAccounts.find(a => a.id === this.bankAccountId);
    const result: PurchasePaymentResult = {
      advancePaymentIds: this.data.advances.filter(a => this.selectedAdvanceIds.has(a.id!)).map(a => a.id!),
      newPayment: this.registerNewPayment ? {
        supplierId: '', // lo completa el backend con el proveedor de la factura
        paymentDate: this.paymentDate,
        amount: this.newPaymentAmount,
        method: this.method,
        bankAccountId: this.isBankMethod ? this.bankAccountId : undefined,
        bankAccountName: this.isBankMethod ? account?.name : undefined,
        reference: this.reference || undefined
      } : undefined
    };
    this.close();
    this.confirmed.emit(result);
  }

  formatMoney(value: number | null | undefined): string {
    return '$ ' + new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Number(value) || 0);
  }

  private todayIso(): string {
    const d = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
}
