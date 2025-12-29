import { Supplier } from './supplier';
import { PurchaseItem } from './purchase-item';

export type PurchasePaymentType = 'CONTADO' | 'CREDITO';

export interface PurchaseInvoice {
  id?: string;
  supplier: Supplier;
  invoiceNumber: string;
  emissionDate: string; // ISO date yyyy-MM-dd (fecha de la factura del proveedor)
  paymentType: PurchasePaymentType;
  items: PurchaseItem[];
  total: number;
  notes?: string;
  supportDocument?: string; // URL o path del documento soporte
  createdAt?: string; // Fecha de ingreso/registro en el sistema
}
