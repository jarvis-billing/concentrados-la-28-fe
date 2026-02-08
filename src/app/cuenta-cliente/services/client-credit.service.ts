import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { urlConfig } from '../../../config/config';
import { 
    ClientCredit, 
    CreditTransaction, 
    DepositCreditRequest, 
    UseCreditRequest,
    CreditReportFilter,
    CreditSummary,
    ManualCreditRequest
} from '../models/client-credit';

@Injectable({
    providedIn: 'root'
})
export class ClientCreditService {

    private url: string = urlConfig.getClientCreditsServiceUrl();

    constructor(private http: HttpClient) { }

    /**
     * Obtiene el crédito/anticipo de un cliente por su ID
     */
    getByClientId(clientId: string): Observable<ClientCredit> {
        return this.http.get<ClientCredit>(`${this.url}/client/${clientId}`);
    }

    /**
     * Obtiene el saldo a favor de un cliente
     */
    getClientCreditBalance(clientId: string): Observable<{ balance: number }> {
        return this.http.get<{ balance: number }>(`${this.url}/client/${clientId}/balance`);
    }

    /**
     * Registra un nuevo anticipo/depósito
     */
    registerDeposit(request: DepositCreditRequest): Observable<CreditTransaction> {
        return this.http.post<CreditTransaction>(`${this.url}/deposit`, request);
    }

    /**
     * Usa saldo a favor en una factura
     */
    useCredit(request: UseCreditRequest): Observable<CreditTransaction> {
        return this.http.post<CreditTransaction>(`${this.url}/use`, request);
    }

    /**
     * Obtiene el historial de transacciones de un cliente
     */
    getTransactionHistory(clientId: string): Observable<CreditTransaction[]> {
        return this.http.get<CreditTransaction[]>(`${this.url}/client/${clientId}/transactions`);
    }

    /**
     * Genera reporte de anticipos/saldos a favor
     */
    getCreditsReport(filter: CreditReportFilter): Observable<CreditSummary[]> {
        return this.http.post<CreditSummary[]>(`${this.url}/report`, filter);
    }

    /**
     * Obtiene todos los clientes con saldo a favor
     */
    getAllWithBalance(): Observable<ClientCredit[]> {
        return this.http.get<ClientCredit[]>(`${this.url}/with-balance`);
    }

    /**
     * Realiza un ajuste manual al saldo
     */
    adjustBalance(clientId: string, amount: number, notes: string): Observable<CreditTransaction> {
        return this.http.post<CreditTransaction>(`${this.url}/adjust`, {
            clientId,
            amount,
            notes
        });
    }

    /**
     * Registra un crédito manual (migración de cuaderno)
     */
    registerManualCredit(request: ManualCreditRequest): Observable<CreditTransaction> {
        return this.http.post<CreditTransaction>(`${this.url}/manual`, request);
    }
}
