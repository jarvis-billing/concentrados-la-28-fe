import { Product } from '../../producto/producto';
import { User } from '../../auth/user';

export interface PhysicalInventory {
  id: string;
  date: Date | string;
  productId: string;
  product?: Product;
  presentationBarcode: string;
  systemStock: number;
  physicalStock: number;
  difference: number;
  adjustmentReason: AdjustmentReason;
  notes: string;
  userId: string;
  user?: User;
  createdAt: Date | string;
}

export enum AdjustmentReason {
  CONTEO_FISICO = 'CONTEO_FISICO',
  MERMA = 'MERMA',
  DANO = 'DANO',
  ROBO = 'ROBO',
  CORRECCION = 'CORRECCION',
  VENCIMIENTO = 'VENCIMIENTO',
  DONACION = 'DONACION',
  MUESTRA = 'MUESTRA'
}

export const AdjustmentReasonLabels: { [key in AdjustmentReason]: string } = {
  [AdjustmentReason.CONTEO_FISICO]: 'Conteo Físico',
  [AdjustmentReason.MERMA]: 'Merma',
  [AdjustmentReason.DANO]: 'Daño',
  [AdjustmentReason.ROBO]: 'Robo',
  [AdjustmentReason.CORRECCION]: 'Corrección',
  [AdjustmentReason.VENCIMIENTO]: 'Vencimiento',
  [AdjustmentReason.DONACION]: 'Donación',
  [AdjustmentReason.MUESTRA]: 'Muestra Gratis'
};

export interface PhysicalInventoryFilter {
  startDate?: string;
  endDate?: string;
  productId?: string;
  adjustmentReason?: AdjustmentReason;
}
