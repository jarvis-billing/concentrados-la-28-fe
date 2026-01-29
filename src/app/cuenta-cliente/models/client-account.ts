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
    OTRO = 'OTRO'
}

/**
 * Filtros para consultar cuentas por cobrar
 */
export class AccountReportFilter {
    clientId?: string;
    fromDate?: string;
    toDate?: string;
    onlyWithBalance?: boolean;       // Solo cuentas con saldo pendiente
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
}
