// ============ UTILIDAD POR VENTAS ============

export interface ProfitReportRow {
  billNumber: string;
  dateTimeRecord: string;
  clientName: string;
  productDescription: string;
  presentationLabel: string;
  barcode: string;
  category: string;
  brand: string;
  amount: number;
  unitPrice: number;
  unitCost: number;
  subtotal: number;
  totalCost: number;
  grossProfit: number;
  profitMargin: number; // porcentaje
  saleType: string;
  userId: string;
}

export interface ProfitReportSummary {
  totalSales: number;
  totalCost: number;
  totalGrossProfit: number;
  averageMargin: number;
  invoiceCount: number;
  itemCount: number;
}

export interface ProfitReportResponse {
  rows: ProfitReportRow[];
  summary: ProfitReportSummary;
}

// ============ MOVIMIENTOS DE PRODUCTOS ============

export type MovementType = 'VENTA' | 'COMPRA' | 'AJUSTE_ENTRADA' | 'AJUSTE_SALIDA' | 'TRASLADO';

export interface ProductMovementRow {
  date: string;
  movementType: MovementType;
  reference: string;       // billNumber, purchaseInvoice, adjustmentId
  productDescription: string;
  presentationLabel: string;
  barcode: string;
  category: string;
  brand: string;
  quantityIn: number;
  quantityOut: number;
  unitMeasure: string;
  unitPrice: number;
  total: number;
  notes: string;
}

export interface ProductMovementsSummary {
  totalIn: number;
  totalOut: number;
  netMovement: number;
  totalValueIn: number;
  totalValueOut: number;
  movementCount: number;
}

export interface ProductMovementsResponse {
  rows: ProductMovementRow[];
  summary: ProductMovementsSummary;
}

// ============ FLUJO DE CAJA (CONTABLE) ============

export type FlowType = 'INGRESO' | 'EGRESO';

export interface CashFlowRow {
  date: string;
  flowType: FlowType;
  category: string;        // Ventas contado, Cobro cartera, Compras, Gastos, etc.
  subcategory: string;     // Detalle más específico
  description: string;
  reference: string;
  paymentMethod: string;
  bankAccount?: string;
  amount: number;
  balance: number;         // Saldo acumulado
}

export interface CashFlowSummary {
  totalIngresos: number;
  totalEgresos: number;
  netFlow: number;
  ingresosCount: number;
  egresosCount: number;
  byCategory: CashFlowCategoryTotal[];
  byPaymentMethod: CashFlowMethodTotal[];
}

export interface CashFlowCategoryTotal {
  category: string;
  flowType: FlowType;
  total: number;
  count: number;
}

export interface CashFlowMethodTotal {
  method: string;
  totalIngresos: number;
  totalEgresos: number;
}

export interface CashFlowResponse {
  rows: CashFlowRow[];
  summary: CashFlowSummary;
}
