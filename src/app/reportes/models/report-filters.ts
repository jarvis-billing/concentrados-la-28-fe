export interface ReportDateFilter {
  fromDate: string;  // yyyy-MM-dd
  toDate: string;    // yyyy-MM-dd
}

export interface ProfitReportFilter extends ReportDateFilter {
  productId?: string;
  category?: string;
  brand?: string;
  clientId?: string;
  userId?: string;
  saleType?: string;
  paymentMethod?: string;
}

export interface ProductMovementsFilter extends ReportDateFilter {
  productId?: string;
  category?: string;
  brand?: string;
  movementType?: 'VENTA' | 'COMPRA' | 'AJUSTE' | 'TRASLADO' | '';
}

export interface CashFlowFilter extends ReportDateFilter {
  category?: string;
  paymentMethod?: string;
  flowType?: 'INGRESO' | 'EGRESO' | '';
}
