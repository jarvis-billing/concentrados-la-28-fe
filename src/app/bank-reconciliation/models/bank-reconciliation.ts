/**
 * Modelos y DTOs para el Arqueo Bancario / Conciliación Bancaria
 * Reutiliza estados y estructuras del arqueo de caja cuando es posible.
 */

import { CashCountStatus, AuditTrailEntry, SessionSnapshot } from '../../arqueo-caja/models/cash-register';

export { AuditTrailEntry, SessionSnapshot };
export type ReconciliationStatus = CashCountStatus;

/**
 * Resumen de movimientos por método de pago no-efectivo
 */
export interface BankPaymentMethodSummary {
    paymentMethod: string;
    totalIncome: number;
    totalExpense: number;
    netAmount: number;
    transactionCount: number;
}

/**
 * Transacción bancaria individual
 */
export interface BankTransaction {
    id: string;
    type: 'INGRESO' | 'EGRESO';
    category: string;
    description: string;
    amount: number;
    paymentMethod: string;
    reference?: string | null;
    transactionDate: string;
    relatedDocumentId?: string;
}

/**
 * Resumen diario calculado por el sistema para el arqueo bancario
 */
export interface DailyBankSummaryResponse {
    transactions: BankTransaction[];
    paymentMethodSummaries: BankPaymentMethodSummary[];
    totalIncome: number;
    totalExpense: number;
    totalTransfers: number;
    openingBalance: number;
    expectedBankAmount: number;
    expectedBankTotal: number;
}

/**
 * Request para crear/actualizar conciliación bancaria
 */
export interface CreateBankReconciliationRequest {
    bankAccountId: string;
    sessionDate: string;
    openingBalance: number;
    totalBankCounted: number;
    notes?: string;
}

/**
 * Request para cerrar conciliación bancaria
 */
export interface CloseBankReconciliationRequest {
    notes?: string;
}

/**
 * Request para anular conciliación bancaria
 */
export interface CancelBankReconciliationRequest {
    reason: string;
}

/**
 * DTO de conciliación bancaria (respuesta completa)
 */
export interface BankReconciliationDto {
    id?: string;
    bankAccountId?: string;
    sessionDate: string;
    openingBalance: number;
    totalBankCounted: number;
    expectedBankAmount: number;
    expectedBankTotal: number;
    difference: number;
    totalIncome: number;
    totalExpense: number;
    totalTransfers: number;
    netBankFlow: number;
    status: ReconciliationStatus;
    notes?: string;
    cancelReason?: string | null;
    auditTrail: AuditTrailEntry[];
    snapshots: SessionSnapshot[];
}

/**
 * Respuesta de saldo de apertura sugerido
 */
export interface SuggestedOpeningResponse {
    balance: number;
    lastCloseDate?: string;
}

/**
 * Filtros para consultar conciliaciones bancarias
 */
export interface BankReconciliationFilter {
    bankAccountId: string;
    fromDate?: string;
    toDate?: string;
    status?: ReconciliationStatus;
}

/**
 * Resumen diario para el reporte/listado
 */
export interface DailyBankSummary {
    date: string;
    openingBalance: number;
    totalIncome: number;
    totalExpense: number;
    expectedBankAmount: number;
    expectedBankTotal: number;
    totalBankCounted: number;
    difference: number;
    status: ReconciliationStatus;
    auditTrail: AuditTrailEntry[];
    snapshots: SessionSnapshot[];
}
