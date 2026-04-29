import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { urlConfig } from '../../../config/config';
import {
    DailyBankSummaryResponse,
    CreateBankReconciliationRequest,
    BankReconciliationDto,
    CloseBankReconciliationRequest,
    CancelBankReconciliationRequest,
    SuggestedOpeningResponse,
    BankReconciliationFilter,
    DailyBankSummary
} from '../models/bank-reconciliation';

@Injectable({
    providedIn: 'root'
})
export class BankReconciliationService {

    private url: string = urlConfig.baseUrl + '/api/bank-reconciliation';

    constructor(private http: HttpClient) { }

    /**
     * Obtiene el resumen diario de movimientos no-efectivo
     */
    getDailySummary(date: string, bankAccountId: string): Observable<DailyBankSummaryResponse> {
        return this.http.get<DailyBankSummaryResponse>(`${this.url}/daily-summary`, {
            params: { date, bankAccountId }
        });
    }

    /**
     * Crea o actualiza una conciliación bancaria
     */
    createOrUpdate(request: CreateBankReconciliationRequest): Observable<BankReconciliationDto> {
        return this.http.post<BankReconciliationDto>(`${this.url}`, request, {
            params: { bankAccountId: request.bankAccountId }
        });
    }

    /**
     * Obtiene una conciliación por ID
     */
    getById(id: string, bankAccountId: string): Observable<BankReconciliationDto> {
        return this.http.get<BankReconciliationDto>(`${this.url}/${id}`, {
            params: { bankAccountId }
        });
    }

    /**
     * Obtiene la conciliación de una fecha específica
     */
    getByDate(date: string, bankAccountId: string): Observable<BankReconciliationDto | null> {
        return this.http.get<BankReconciliationDto | null>(`${this.url}/by-date`, {
            params: { date, bankAccountId }
        });
    }

    /**
     * Cierra una conciliación bancaria
     */
    closeSession(id: string, bankAccountId: string, notes?: string): Observable<BankReconciliationDto> {
        const body: CloseBankReconciliationRequest = { notes };
        return this.http.post<BankReconciliationDto>(`${this.url}/${id}/close`, body, {
            params: { bankAccountId }
        });
    }

    /**
     * Anula una conciliación bancaria (solo si está EN_PROGRESO)
     */
    cancelSession(id: string, bankAccountId: string, reason: string): Observable<BankReconciliationDto> {
        const body: CancelBankReconciliationRequest = { reason };
        return this.http.post<BankReconciliationDto>(`${this.url}/${id}/cancel`, body, {
            params: { bankAccountId }
        });
    }

    /**
     * Lista conciliaciones bancarias con filtros
     */
    list(filter: BankReconciliationFilter): Observable<DailyBankSummary[]> {
        let params = new HttpParams();
        params = params.set('bankAccountId', filter.bankAccountId);
        if (filter.fromDate) params = params.set('fromDate', filter.fromDate);
        if (filter.toDate) params = params.set('toDate', filter.toDate);
        if (filter.status) params = params.set('status', filter.status);

        return this.http.get<DailyBankSummary[]>(`${this.url}`, { params });
    }

    /**
     * Reabre una conciliación bancaria cerrada
     */
    reopenSession(id: string, bankAccountId: string, reason?: string): Observable<BankReconciliationDto> {
        return this.http.post<BankReconciliationDto>(`${this.url}/${id}/reopen`, { reason }, {
            params: { bankAccountId }
        });
    }

    /**
     * Obtiene el saldo de apertura sugerido (cierre del último conciliación)
     */
    getSuggestedOpeningBalance(bankAccountId: string): Observable<SuggestedOpeningResponse> {
        return this.http.get<SuggestedOpeningResponse>(`${this.url}/suggested-opening`, {
            params: { bankAccountId }
        });
    }
}
