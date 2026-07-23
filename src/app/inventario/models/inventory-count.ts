export type InventoryCountStatus = 'IN_PROGRESS' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';

export interface InventoryCountEntryDto {
  barcode: string;
  productId: string;
  description: string;
  presentationLabel?: string;
  systemStock: number;
  countedQty: number;
  difference: number;
  countedAt: string;
  countedBy: string;
}

export interface InventoryCountSessionDto {
  id: string;
  sessionNumber: string;
  status: InventoryCountStatus;
  notes?: string;
  startedAt: string;
  startedBy: string;
  pausedAt?: string;
  completedAt?: string;
  completedBy?: string;
  entries: InventoryCountEntryDto[];
  totalCounted: number;
}

export interface RecordCountRequest {
  barcode: string;
  productId: string;
  description: string;
  presentationLabel?: string;
  countedQty: number;
}

/** Conteo de múltiples presentaciones de un mismo producto en una sola llamada */
export interface BulkCountRequest {
  entries: RecordCountRequest[];
}

export interface UncountedProductDto {
  barcode: string;
  productId: string;
  presentationId?: string;
  description: string;
  presentationLabel?: string;
  systemStock: number;
  /** false = marcada como inactiva/oculta */
  active?: boolean;
}

export interface HideUncountedResultDto {
  hidden: number;
  message: string;
}

export interface InventoryCountReportDto {
  session: InventoryCountSessionDto;
  counted: InventoryCountEntryDto[];
  uncounted: UncountedProductDto[];
  totalPresentations: number;
  totalCounted: number;
  totalUncounted: number;
  coveragePercent: number;
}
