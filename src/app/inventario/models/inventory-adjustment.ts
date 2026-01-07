import { Product } from '../../producto/producto';
import { User } from '../../auth/user';
import { AdjustmentReason } from './physical-inventory';

export interface InventoryAdjustment {
  id: string;
  date: Date | string;
  productId: string;
  product?: Product;
  presentationBarcode: string;
  adjustmentType: AdjustmentType;
  quantity: number;
  previousStock: number;
  newStock: number;
  reason: AdjustmentReason;
  notes: string;
  userId: string;
  user?: User;
  evidenceUrl?: string;
  requiresAuthorization: boolean;
  authorizedBy?: string;
  authorizedAt?: Date | string;
  createdAt: Date | string;
}

export enum AdjustmentType {
  INCREMENT = 'INCREMENT',
  DECREMENT = 'DECREMENT'
}

export const AdjustmentTypeLabels: { [key in AdjustmentType]: string } = {
  [AdjustmentType.INCREMENT]: 'Incremento',
  [AdjustmentType.DECREMENT]: 'Decremento'
};

export interface InventoryAdjustmentFilter {
  startDate?: string;
  endDate?: string;
  productId?: string;
  adjustmentType?: AdjustmentType;
  reason?: AdjustmentReason;
}
