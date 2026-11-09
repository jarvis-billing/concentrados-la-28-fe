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
  applications?: PaymentApplication[];
  /** true si el pago fue cerrado por el script de corte (sin factura asociada) */
  legacyClosed?: boolean;
  /** Solo entrada: facturas a las que se aplica el pago al registrarlo */
  allocations?: PaymentAllocation[];
}

/** Monto de un pago aplicado a una factura de compra */
export interface PaymentApplication {
  purchaseId: string;
  invoiceNumber?: string;
  amount: number;
  appliedAt?: string;
  appliedBy?: string;
  /** Solo lectura: estado de pago actual de la factura */
  invoicePaymentStatus?: string;
}

export interface PaymentAllocation {
  purchaseId: string;
  amount: number;
}
