import { Client } from '../../cliente/cliente';

/**
 * Representa el saldo a favor (anticipo) de un cliente.
 * El cliente puede tener dinero depositado para futuras compras.
 */
export class ClientCredit {
    id: string = '';
    client: Client = new Client();
    currentBalance: number = 0;      // Saldo a favor actual
    totalDeposited: number = 0;      // Total depositado históricamente
    totalUsed: number = 0;           // Total usado en compras
    transactions: CreditTransaction[] = [];
    lastTransactionDate?: string;
    createdAt: string = '';
    updatedAt: string = '';
}

/**
 * Representa una transacción de crédito/anticipo.
 * Puede ser un depósito (anticipo) o un consumo (uso en factura).
 */
export class CreditTransaction {
    id: string = '';
    clientCreditId: string = '';
    type: CreditTransactionType = CreditTransactionType.DEPOSIT;
    amount: number = 0;
    balanceAfter: number = 0;        // Saldo después de la transacción
    paymentMethod?: PaymentMethodCredit;
    reference?: string;              // Referencia de pago o número de factura
    billingId?: string;              // ID de factura si es un consumo
    notes?: string;
    transactionDate: string = '';
    createdBy: string = '';
    createdAt: string = '';
}

export enum CreditTransactionType {
    DEPOSIT = 'DEPOSIT',             // Anticipo/depósito
    CONSUMPTION = 'CONSUMPTION',     // Uso en factura
    REFUND = 'REFUND',               // Devolución al cliente
    ADJUSTMENT = 'ADJUSTMENT'        // Ajuste manual
}

export enum PaymentMethodCredit {
    EFECTIVO = 'EFECTIVO',
    TRANSFERENCIA = 'TRANSFERENCIA',
    TARJETA_DEBITO = 'TARJETA_DEBITO',
    TARJETA_CREDITO = 'TARJETA_CREDITO',
    CHEQUE = 'CHEQUE',
    OTRO = 'OTRO'
}

/**
 * DTO para registrar un nuevo anticipo
 */
export class DepositCreditRequest {
    clientId: string = '';
    amount: number = 0;
    paymentMethod: PaymentMethodCredit = PaymentMethodCredit.EFECTIVO;
    reference?: string;
    notes?: string;
}

/**
 * DTO para usar saldo a favor en una factura
 */
export class UseCreditRequest {
    clientId: string = '';
    amount: number = 0;
    billingId?: string;
    notes?: string;
}

/**
 * Filtros para consultar anticipos
 */
export class CreditReportFilter {
    clientId?: string;
    fromDate?: string;
    toDate?: string;
    transactionType?: CreditTransactionType;
    onlyWithBalance?: boolean;
}

/**
 * Resumen de crédito para reportes
 */
export class CreditSummary {
    clientId: string = '';
    clientName: string = '';
    clientIdNumber: string = '';
    currentBalance: number = 0;
    totalDeposited: number = 0;
    totalUsed: number = 0;
    lastTransactionDate?: string;
}
