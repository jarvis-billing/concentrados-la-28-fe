/**
 * Denominaciones de billetes y monedas colombianas
 */
export interface CashDenomination {
    value: number;           // Valor de la denominación (ej: 100000, 50000, 1000, 500, etc.)
    type: 'BILLETE' | 'MONEDA';
    label: string;           // Etiqueta para mostrar (ej: "$100.000", "$500")
    imagePath: string;       // Ruta a la imagen de la denominación
    quantity: number;        // Cantidad contada
    subtotal: number;        // value * quantity
}

/**
 * Resumen de movimientos por método de pago
 */
export interface PaymentMethodSummary {
    paymentMethod: string;
    totalIncome: number;     // Total ingresos
    totalExpense: number;    // Total egresos
    netAmount: number;       // Diferencia (ingresos - egresos)
    transactionCount: number;
}

/**
 * Detalle de transacción para el arqueo
 */
export interface CashTransaction {
    id: string;
    type: 'INGRESO' | 'EGRESO';
    category: TransactionCategory;
    description: string;
    amount: number;
    paymentMethod: string;
    reference?: string;
    transactionDate: string;
    relatedDocumentId?: string;  // ID de factura, pago, gasto, etc.
}

export enum TransactionCategory {
    VENTA = 'VENTA',
    PAGO_CREDITO = 'PAGO_CREDITO',
    DEPOSITO_ANTICIPO = 'DEPOSITO_ANTICIPO',
    GASTO = 'GASTO',
    PAGO_PROVEEDOR = 'PAGO_PROVEEDOR',
    AJUSTE = 'AJUSTE'
}

/**
 * Sesión de arqueo de caja
 */
export interface CashCountSession {
    id?: string;
    sessionDate: string;           // Fecha del arqueo
    openingBalance: number;        // Saldo inicial (base de caja)
    
    // Conteo físico de efectivo
    cashDenominations: CashDenomination[];
    totalCashCounted: number;      // Total contado en efectivo
    
    // Resumen por método de pago
    paymentMethodSummaries: PaymentMethodSummary[];
    
    // Totales calculados del sistema
    expectedCashAmount: number;    // Efectivo esperado según sistema
    expectedTransferAmount: number; // Transferencias esperadas
    expectedOtherAmount: number;   // Otros métodos esperados
    
    // Diferencias
    cashDifference: number;        // Diferencia en efectivo (contado - esperado)
    
    // Transacciones del día
    transactions: CashTransaction[];
    
    // Totales generales
    totalIncome: number;           // Total ingresos del día
    totalExpense: number;          // Total egresos del día
    netCashFlow: number;           // Flujo neto (ingresos - egresos)
    
    // Metadata
    status: CashCountStatus;
    notes?: string;
    closedBy?: string;
    closedAt?: string;
    createdBy: string;
    createdAt: string;
}

export enum CashCountStatus {
    EN_PROGRESO = 'EN_PROGRESO',
    CERRADO = 'CERRADO',
    ANULADO = 'ANULADO'
}

/**
 * Resumen diario para el reporte
 */
export interface DailyCashSummary {
    date: string;
    openingBalance: number;
    totalIncome: number;
    totalExpense: number;
    expectedCash: number;
    countedCash: number;
    difference: number;
    status: CashCountStatus;
    closedBy?: string;
}

/**
 * Filtros para consultar arqueos
 */
export interface CashCountFilter {
    fromDate?: string;
    toDate?: string;
    status?: CashCountStatus;
}

/**
 * Request para crear/actualizar arqueo
 */
export interface CreateCashCountRequest {
    sessionDate: string;
    openingBalance: number;
    cashDenominations: { value: number; quantity: number }[];
    notes?: string;
}

/**
 * Denominaciones colombianas predefinidas
 */
export const COLOMBIAN_DENOMINATIONS: Omit<CashDenomination, 'quantity' | 'subtotal'>[] = [
    // Billetes (imágenes oficiales JPG)
    { value: 100000, type: 'BILLETE', label: '$100.000', imagePath: 'assets/denominations/billete_10000.jpeg' },
    { value: 50000, type: 'BILLETE', label: '$50.000', imagePath: 'assets/denominations/billete_50000.jpg' },
    { value: 20000, type: 'BILLETE', label: '$20.000', imagePath: 'assets/denominations/billete_20000.jpg' },
    { value: 10000, type: 'BILLETE', label: '$10.000', imagePath: 'assets/denominations/billete_10000.jpg' },
    { value: 5000, type: 'BILLETE', label: '$5.000', imagePath: 'assets/denominations/billete_5000.webp' },
    { value: 2000, type: 'BILLETE', label: '$2.000', imagePath: 'assets/denominations/billete_2000.jpg' },
    { value: 1000, type: 'BILLETE', label: '$1.000', imagePath: 'assets/denominations/billete_1000.jpg' },
    // Monedas (imágenes oficiales JPG)
    { value: 1000, type: 'MONEDA', label: '$1.000', imagePath: 'assets/denominations/moneda_1000.jpg' },
    { value: 500, type: 'MONEDA', label: '$500', imagePath: 'assets/denominations/moneda_500.jpg' },
    { value: 200, type: 'MONEDA', label: '$200', imagePath: 'assets/denominations/moneda_200.jpg' },
    { value: 100, type: 'MONEDA', label: '$100', imagePath: 'assets/denominations/moneda_100.jpg' },
    { value: 50, type: 'MONEDA', label: '$50', imagePath: 'assets/denominations/moneda_50.jpg' },
];
