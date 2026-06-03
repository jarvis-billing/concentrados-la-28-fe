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
}

export interface PreSaleDto {
  id: string;
  preSaleNumber: string;
  status: PreSaleStatus;
  sellerName: string;
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
