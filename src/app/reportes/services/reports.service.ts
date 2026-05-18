import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { urlConfig } from '../../../config/config';
import { ProfitReportFilter, ProductMovementsFilter, CashFlowFilter } from '../models/report-filters';
import { ProfitReportResponse, ProductMovementsResponse, CashFlowResponse } from '../models/report-responses';

@Injectable({ providedIn: 'root' })
export class ReportsService {
  private url = urlConfig.getReportsServiceUrl();

  constructor(private http: HttpClient) {}

  getProfitReport(filter: ProfitReportFilter): Observable<ProfitReportResponse> {
    return this.http.post<ProfitReportResponse>(`${this.url}/profit`, filter);
  }

  getProductMovements(filter: ProductMovementsFilter): Observable<ProductMovementsResponse> {
    return this.http.post<ProductMovementsResponse>(`${this.url}/product-movements`, filter);
  }

  getCashFlow(filter: CashFlowFilter): Observable<CashFlowResponse> {
    return this.http.post<CashFlowResponse>(`${this.url}/cash-flow`, filter);
  }
}
