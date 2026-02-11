import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { urlConfig } from '../../../config/config';
import { 
    ClientAccount, 
    AccountPayment, 
    AccountReportFilter, 
    AccountSummary,
    ManualDebtRequest
} from '../models/client-account';

@Injectable({
    providedIn: 'root'
})
export class ClientAccountService {

    private url: string = urlConfig.getClientAccountsServiceUrl();

    constructor(private http: HttpClient) { }

    /**
     * Obtiene la cuenta de un cliente por su ID
     */
    getByClientId(clientId: string): Observable<ClientAccount> {
        return this.http.get<ClientAccount>(`${this.url}/client/${clientId}`);
    }

    /**
     * Obtiene todas las cuentas con saldo pendiente
     */
    getAllWithBalance(): Observable<ClientAccount[]> {
        return this.http.get<ClientAccount[]>(`${this.url}/with-balance`);
    }

    /**
     * Registra un pago/abono a la cuenta del cliente
     */
    registerPayment(payment: AccountPayment): Observable<AccountPayment> {
        return this.http.post<AccountPayment>(`${this.url}/payments`, payment);
    }

    /**
     * Obtiene el historial de pagos de una cuenta
     */
    getPaymentHistory(clientAccountId: string): Observable<AccountPayment[]> {
        return this.http.get<AccountPayment[]>(`${this.url}/${clientAccountId}/payments`);
    }

    /**
     * Obtiene el historial de pagos de un cliente por su ID
     */
    getPaymentHistoryByClientId(clientId: string): Observable<AccountPayment[]> {
        return this.http.get<AccountPayment[]>(`${this.url}/client/${clientId}/payments`);
    }

    /**
     * Genera reporte de cuentas por cobrar
     */
    getAccountsReport(filter: AccountReportFilter): Observable<AccountSummary[]> {
        return this.http.post<AccountSummary[]>(`${this.url}/report`, filter);
    }

    /**
     * Obtiene el saldo pendiente de un cliente
     */
    getClientBalance(clientId: string): Observable<{ balance: number }> {
        return this.http.get<{ balance: number }>(`${this.url}/client/${clientId}/balance`);
    }

    /**
     * Obtiene las facturas a crédito pendientes de un cliente
     */
    getCreditBillings(clientId: string): Observable<any[]> {
        return this.http.get<any[]>(`${this.url}/client/${clientId}/credit-billings`);
    }

    /**
     * Registra una deuda manual (migración de cuaderno)
     */
    registerManualDebt(request: ManualDebtRequest): Observable<any> {
        return this.http.post<any>(`${this.url}/manual-debt`, request);
    }
}
