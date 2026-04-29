export type PaymentMethod = 'EFECTIVO' | 'TRANSFERENCIA' | 'TARJETA_CREDITO' | 'TARJETA_DEBITO' | 'CHEQUE';

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
}
