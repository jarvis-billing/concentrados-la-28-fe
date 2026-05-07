import { Supplier } from './supplier';
import { PurchaseItem } from './purchase-item';

export type PurchasePaymentType = 'CONTADO' | 'CREDITO';

export type PurchasePaymentStatus = 'PENDIENTE' | 'PARCIAL' | 'PAGADO' | 'SOBREPAGADO';

export interface LinkedPayment {
  paymentId: string;
  appliedAmount: number;
  paymentDate: string;
  method: string;
  reference?: string;
}

export interface PurchaseInvoice {
  id?: string;
  supplier: Supplier;
  invoiceNumber: string;
  emissionDate: string; // ISO date yyyy-MM-dd (fecha de la factura del proveedor)
  paymentType: PurchasePaymentType;
  items: PurchaseItem[];
  subtotal: number;    // Suma de totalCost de los ítems (sin IVA ni flete)
  totalVat: number;    // Suma de vatAmount de todos los ítems
  freightRate: number; // Tarifa de flete por unidad (se aplica solo a ítems marcados)
  freightCost: number; // Suma de freightAmount de todos los ítems = Σ(freightRate × qty) para ítems que aplican
  total: number;       // subtotal + totalVat + freightCost
  notes?: string;
  supportDocument?: string; // URL o path del documento soporte
  createdAt?: string; // Fecha de ingreso/registro en el sistema
  paymentStatus?: PurchasePaymentStatus;
  totalPaid?: number;
  linkedPayments?: LinkedPayment[];
}
