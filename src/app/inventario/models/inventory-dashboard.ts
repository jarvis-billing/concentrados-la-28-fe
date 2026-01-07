export interface InventoryDashboard {
  totalProducts: number;
  totalInventoryValue: number;
  lowStockProducts: number;
  criticalStockProducts: number;
  outOfStockProducts: number;
  topSellingProducts: ProductSummary[];
  lowRotationProducts: ProductSummary[];
  stockAlerts: StockAlert[];
}

export interface ProductSummary {
  productId: string;
  productName: string;
  barcode: string;
  currentStock: number;
  unitMeasure: string;
  salesCount?: number;
  lastSaleDate?: Date | string;
  inventoryValue?: number;
}

export interface StockAlert {
  productId: string;
  productName: string;
  barcode: string;
  currentStock: number;
  minimumStock: number;
  criticalStock: number;
  unitMeasure: string;
  alertLevel: AlertLevel;
}

export enum AlertLevel {
  NORMAL = 'NORMAL',
  LOW = 'LOW',
  CRITICAL = 'CRITICAL',
  OUT_OF_STOCK = 'OUT_OF_STOCK'
}

export const AlertLevelLabels: { [key in AlertLevel]: string } = {
  [AlertLevel.NORMAL]: 'Normal',
  [AlertLevel.LOW]: 'Stock Bajo',
  [AlertLevel.CRITICAL]: 'Stock Crítico',
  [AlertLevel.OUT_OF_STOCK]: 'Sin Stock'
};

export const AlertLevelColors: { [key in AlertLevel]: string } = {
  [AlertLevel.NORMAL]: 'success',
  [AlertLevel.LOW]: 'warning',
  [AlertLevel.CRITICAL]: 'danger',
  [AlertLevel.OUT_OF_STOCK]: 'dark'
};
