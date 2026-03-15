import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { urlConfig } from '../../../config/config';
import {
    CashLoan,
    CashLoanFilter,
    CreateCashLoanRequest,
    ReturnCashLoanRequest
} from '../models/cash-loan';

@Injectable({
    providedIn: 'root'
})
export class CashLoanService {

    private url: string = urlConfig.baseUrl + '/api/cash-loans';

    constructor(private http: HttpClient) { }

    create(request: CreateCashLoanRequest): Observable<CashLoan> {
        return this.http.post<CashLoan>(this.url, request);
    }

    returnLoan(id: string, request: ReturnCashLoanRequest): Observable<CashLoan> {
        return this.http.post<CashLoan>(`${this.url}/${id}/return`, request);
    }

    cancel(id: string): Observable<CashLoan> {
        return this.http.post<CashLoan>(`${this.url}/${id}/cancel`, {});
    }

    getById(id: string): Observable<CashLoan> {
        return this.http.get<CashLoan>(`${this.url}/${id}`);
    }

    list(filter: CashLoanFilter): Observable<CashLoan[]> {
        let params = new HttpParams();
        if (filter.fromDate) params = params.set('fromDate', filter.fromDate);
        if (filter.toDate) params = params.set('toDate', filter.toDate);
        if (filter.status) params = params.set('status', filter.status);
        return this.http.get<CashLoan[]>(this.url, { params });
    }
}
