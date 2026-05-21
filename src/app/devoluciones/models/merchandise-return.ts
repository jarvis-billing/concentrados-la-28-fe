export type EReturnType = 'DEVOLUCION_VENTA' | 'DEVOLUCION_COMPRA';
export type EReturnStatus = 'PROCESADA' | 'ANULADA';
export type EReturnResolution =
  | 'NOTA_CREDITO'
  | 'REEMBOLSO_EFECTIVO'
  | 'REEMBOLSO_TRANSFERENCIA'
  | 'CAMBIO_PRODUCTO'
  | 'ABONO_PROVEEDOR'
  | 'REEMBOLSO_PROVEEDOR';

export interface MerchandiseReturnItemDto {
  productId: string;
  productCode?: string;
  presentationBarcode?: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  vatRate?: number;
  vatAmount?: number;
  totalAmount?: number;
}

export interface UserDto {
  id?: string;
  name?: string;
  username?: string;
}

export interface MerchandiseReturnDto {
  id?: string;
  returnNumber?: string;
  returnType: EReturnType;
  originalDocumentId?: string;
  originalDocumentNumber?: string;
  returnDate?: string;
  items: MerchandiseReturnItemDto[];
  status?: EReturnStatus;
  resolution: EReturnResolution;
  clientId?: string;
  clientName?: string;
  supplierId?: string;
  supplierName?: string;
  refundMethod?: string;
  bankAccountId?: string;
  bankAccountName?: string;
  subtotal?: number;
  totalVat?: number;
  totalAmount?: number;
  notes?: string;
  cancelReason?: string;
  createdBy?: UserDto;
  createdAt?: string;
  processedAt?: string;
  cancelledAt?: string;
}

export interface ReturnFilterDto {
  returnType?: EReturnType;
  status?: EReturnStatus;
  fromDate?: string;
  toDate?: string;
  originalDocumentNumber?: string;
  clientId?: string;
  supplierId?: string;
}
