import { Product } from '../../producto/producto';
import { User } from '../../auth/user';

export interface InventoryMovement {
  id: string;
  date: Date | string;
  productId: string;
  product?: Product;
  presentationBarcode: string;
  movementType: MovementType;
  quantity: number;
  previousStock: number;
  newStock: number;
  unitMeasure: string;
  reference: string;
  userId: string;
  user?: User;
  notes: string;
  createdAt: Date | string;
}

export enum MovementType {
  COMPRA = 'COMPRA',
  VENTA = 'VENTA',
  AJUSTE_FISICO = 'AJUSTE_FISICO',
  AJUSTE_MANUAL = 'AJUSTE_MANUAL',
  DEVOLUCION_COMPRA = 'DEVOLUCION_COMPRA',
  DEVOLUCION_VENTA = 'DEVOLUCION_VENTA'
}

export const MovementTypeLabels: { [key in MovementType]: string } = {
  [MovementType.COMPRA]: 'Compra',
  [MovementType.VENTA]: 'Venta',
  [MovementType.AJUSTE_FISICO]: 'Ajuste Físico',
  [MovementType.AJUSTE_MANUAL]: 'Ajuste Manual',
  [MovementType.DEVOLUCION_COMPRA]: 'Devolución Compra',
  [MovementType.DEVOLUCION_VENTA]: 'Devolución Venta'
};

export const MovementTypeColors: { [key in MovementType]: string } = {
  [MovementType.COMPRA]: 'success',
  [MovementType.VENTA]: 'primary',
  [MovementType.AJUSTE_FISICO]: 'warning',
  [MovementType.AJUSTE_MANUAL]: 'info',
  [MovementType.DEVOLUCION_COMPRA]: 'danger',
  [MovementType.DEVOLUCION_VENTA]: 'secondary'
};

export interface InventoryMovementFilter {
  startDate?: string;
  endDate?: string;
  productId?: string;
  movementType?: MovementType;
  userId?: string;
}
