import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { urlConfig } from '../../../config/config';
import { 
    CashCountSession, 
    CashCountFilter, 
    CreateCashCountRequest,
    DailyCashSummary,
    CashTransaction,
    PaymentMethodSummary
} from '../models/cash-register';

@Injectable({
    providedIn: 'root'
})
export class CashRegisterService {

    private url: string = urlConfig.baseUrl + '/api/cash-register';

    constructor(private http: HttpClient) { }

    /**
     * Obtiene el resumen de transacciones del día para el arqueo
     */
    getDailySummary(date: string): Observable<{
        transactions: CashTransaction[];
        paymentMethodSummaries: PaymentMethodSummary[];
        totalIncome: number;
        totalExpense: number;
        expectedCashAmount: number;
        expectedTransferAmount: number;
        expectedOtherAmount: number;
    }> {
        return this.http.get<any>(`${this.url}/daily-summary`, {
            params: { date }
        });
    }

    /**
     * Crea o actualiza un arqueo de caja
     */
    createOrUpdate(request: CreateCashCountRequest): Observable<CashCountSession> {
        return this.http.post<CashCountSession>(`${this.url}`, request);
    }

    /**
     * Obtiene un arqueo por ID
     */
    getById(id: string): Observable<CashCountSession> {
        return this.http.get<CashCountSession>(`${this.url}/${id}`);
    }

    /**
     * Obtiene el arqueo de una fecha específica
     */
    getByDate(date: string): Observable<CashCountSession | null> {
        return this.http.get<CashCountSession | null>(`${this.url}/by-date`, {
            params: { date }
        });
    }

    /**
     * Cierra un arqueo de caja
     */
    closeSession(id: string, notes?: string): Observable<CashCountSession> {
        return this.http.post<CashCountSession>(`${this.url}/${id}/close`, { notes });
    }

    /**
     * Anula un arqueo de caja
     */
    cancelSession(id: string, reason: string): Observable<CashCountSession> {
        return this.http.post<CashCountSession>(`${this.url}/${id}/cancel`, { reason });
    }

    /**
     * Lista arqueos con filtros
     */
    list(filter: CashCountFilter): Observable<DailyCashSummary[]> {
        let params = new HttpParams();
        if (filter.fromDate) params = params.set('fromDate', filter.fromDate);
        if (filter.toDate) params = params.set('toDate', filter.toDate);
        if (filter.status) params = params.set('status', filter.status);

        return this.http.get<DailyCashSummary[]>(`${this.url}`, { params });
    }

    /**
     * Obtiene el saldo de apertura sugerido (cierre del día anterior)
     */
    getSuggestedOpeningBalance(): Observable<{ balance: number; lastCloseDate?: string }> {
        return this.http.get<{ balance: number; lastCloseDate?: string }>(`${this.url}/suggested-opening`);
    }

    /**
     * Exporta el arqueo a PDF
     */
    exportToPdf(id: string): Observable<Blob> {
        return this.http.get(`${this.url}/${id}/export-pdf`, {
            responseType: 'blob'
        });
    }
}
