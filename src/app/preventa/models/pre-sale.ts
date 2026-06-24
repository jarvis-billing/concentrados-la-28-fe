export type PreSaleStatus = 'PENDING' | 'BILLED' | 'CANCELLED';

export interface PreSaleItemDto {
  barcode: string;
  productId: string;
  description: string;
  saleType: string;
  unitMeasure: string;
  presentationLabel: string;
  price: number;
  amount: number;
  isBulk: boolean;
  bulkInputAmount?: number;
  subTotal: number;
}

export interface CreatePreSaleRequest {
  sellerName: string;
  items: PreSaleItemDto[];
  totalAmount: number;
  notes?: string;
  clientName?: string;   // nombre del cliente para identificar la preventa
}

/** Draft de una preventa activa en local (multi-preventa) */
export interface PreventaDraft {
  id: string;            // UUID local, ej. 'draft-1716000000000'
  clientName: string;    // 'Cliente A' o '' si no se ingresó
  items: PreSaleItemDto[];
  totalAmount: number;
  savedAt: string;       // ISO timestamp
  tabIndex: number;      // orden de creación (para mostrar #1, #2…)
}

export interface PreSaleDto {
  id: string;
  preSaleNumber: string;
  status: PreSaleStatus;
  sellerName: string;
  clientName?: string;
  items: PreSaleItemDto[];
  totalAmount: number;
  notes?: string;
  createdAt: string;
  createdBy?: string;
  finalizedAt?: string;
  billedAt?: string;
  billingId?: string;
  billNumber?: string;  // número legible de la factura que facturó esta preventa
  billedBy?: string;
  cancelledAt?: string;
  cancelledBy?: string;
}

export interface PreSaleNotification {
  preSaleId: string;
  preSaleNumber: string;
  sellerName: string;
  clientName?: string;
  totalAmount: number;
  itemCount: number;
  createdAt: string;
}

export interface PreSaleFilterDto {
  status?: PreSaleStatus;
  sellerName?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  size?: number;
}
