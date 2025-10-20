import { Supplier } from './supplier';
import { PurchaseItem } from './purchase-item';

export type PurchasePaymentType = 'CONTADO' | 'CREDITO';

export interface PurchaseInvoice {
  id?: string;
  supplier: Supplier;
  invoiceNumber: string;
  emissionDate: string; // ISO date yyyy-MM-dd
  paymentType: PurchasePaymentType;
  items: PurchaseItem[];
  total: number;
  notes?: string;
}
