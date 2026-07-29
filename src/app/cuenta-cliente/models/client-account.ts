import { Client } from '../../cliente/cliente';
import { Billing } from '../../factura/billing';

/**
 * Representa la cuenta por cobrar de un cliente.
 * Agrupa todas las ventas a crédito pendientes de pago.
 */
export class ClientAccount {
    id: string = '';
    client: Client = new Client();
    totalDebt: number = 0;           // Deuda total acumulada
    totalPaid: number = 0;           // Total pagado a la cuenta
    currentBalance: number = 0;      // Saldo pendiente (totalDebt - totalPaid)
    creditBillings: Billing[] = [];  // Facturas a crédito asociadas
    payments: AccountPayment[] = []; // Historial de pagos
    lastPaymentDate?: string;        // Fecha del último pago
    createdAt: string = '';
    updatedAt: string = '';
}

/**
 * Representa un pago/abono a la cuenta del cliente.
 * Los pagos son a la cuenta general, no a facturas específicas.
 */
export class AccountPayment {
    id: string = '';
    clientAccountId: string = '';
    amount: number = 0;
    paymentMethod: PaymentMethod = PaymentMethod.EFECTIVO;
    bankAccountId?: string;
    bankAccountName?: string;
    reference?: string;              // Referencia de transferencia, número de cheque, etc.
    notes?: string;                  // Notas adicionales
    paymentDate: string = '';
    createdBy: string = '';          // Usuario que registró el pago
    createdAt: string = '';
}

export enum PaymentMethod {
    EFECTIVO = 'EFECTIVO',
    TRANSFERENCIA = 'TRANSFERENCIA',
    TARJETA_DEBITO = 'TARJETA_DEBITO',
    TARJETA_CREDITO = 'TARJETA_CREDITO',
    CHEQUE = 'CHEQUE',
    SALDO_FAVOR = 'SALDO_FAVOR',
    OTRO = 'OTRO'
}

/**
 * Filtros para consultar cuentas por cobrar
 */
export class AccountReportFilter {
    clientId?: string;
    fromDate?: string;
    toDate?: string;
    onlyWithBalance?: boolean;  // Solo cuentas con saldo pendiente
    onlySettled?: boolean;      // Solo cuentas saldadas (balance = 0, con historial)
    page?: number;
    size?: number;
}

/** Respuesta paginada del reporte */
export interface PagedAccountReport {
    content: AccountSummary[];
    page: number;
    size: number;
    totalElements: number;
    totalPages: number;
    /** Totales sobre TODOS los registros del filtro (no solo la página actual) */
    totalDebtGlobal?: number;
    totalPaidGlobal?: number;
    totalPendingGlobal?: number;
    pendingCountGlobal?: number;
}

/**
 * Pago con saldo antes/después — para el historial detallado
 */
export interface PaymentWithBalance {
    id: string;
    amount: number;
    paymentMethod?: string;
    reference?: string;
    notes?: string;
    paymentDate: string;
    createdBy?: string;
    balanceBefore: number;   // saldo ANTES de este pago
    balanceAfter:  number;   // saldo DESPUÉS de este pago
}

/** Detalle de ítem de una factura */
export interface SaleDetailItem {
    id?: string;
    product?: { description?: string; code?: string; barcode?: string; };
    amount?: number;
    unitPrice?: number;
    subTotal?: number;
}

/** Factura a crédito resumida para el reporte */
export interface CreditBilling {
    id: string;
    billNumber?: string;
    dateTimeRecord?: string;
    totalBilling?: number;
    saleDetails?: SaleDetailItem[];
    saleType?: string;
}

/** Transacción manual: deuda de cuaderno, ajuste, devolución */
export interface ManualTransaction {
    id: string;
    type: string;       // MANUAL_DEBT, ADJUSTMENT, RETURN_ADJUSTMENT
    amount: number;
    balanceAfter?: number;
    notes?: string;
    source?: string;    // MIGRACION_CUADERNO, etc.
    transactionDate?: string;
    createdBy?: string;
    createdAt?: string;
}

/**
 * Resumen de cuenta para reportes
 */
export class AccountSummary {
    clientId: string = '';
    clientName: string = '';
    clientIdNumber: string = '';
    totalDebt: number = 0;
    totalPaid: number = 0;
    currentBalance: number = 0;
    lastPaymentDate?: string;
    daysSinceLastPayment?: number;
    payments?: PaymentWithBalance[];          // historial con saldo previo por pago
    creditBillings?: CreditBilling[];         // facturas a crédito del cliente
    manualTransactions?: ManualTransaction[]; // deudas del cuaderno y ajustes
}

/**
 * DTO para registrar una deuda manual (migración de cuaderno)
 */
export class ManualDebtRequest {
    clientId: string = '';
    amount: number = 0;
    transactionDate: string = '';  // Fecha original del cuaderno
    notes: string = '';            // Descripción/nota de la deuda
    source: string = 'MIGRACION_CUADERNO';  // Origen de la deuda
}
