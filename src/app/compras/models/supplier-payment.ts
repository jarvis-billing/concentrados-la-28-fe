export type PaymentMethod = 'EFECTIVO' | 'TRANSFERENCIA' | 'TARJETA_CREDITO' | 'TARJETA_DEBITO' | 'CHEQUE';

export type SupplierPaymentStatus = 'ADELANTO' | 'VINCULADO' | 'PARCIAL' | 'ANULADO';

export interface SupplierPayment {
  id?: string;
  supplierId: string;
  supplierName?: string;
  paymentDate: string; // yyyy-MM-dd
  amount: number;
  method: PaymentMethod;
  bankAccountId?: string;
  bankAccountName?: string;
  reference?: string;
  notes?: string;
  supportUrl?: string; // URL pública o endpoint de descarga
  status?: SupplierPaymentStatus;
  linkedPurchaseId?: string;
  linkedAt?: string;
  linkedBy?: string;
  appliedAmount?: number;
  remainingAmount?: number;
}
