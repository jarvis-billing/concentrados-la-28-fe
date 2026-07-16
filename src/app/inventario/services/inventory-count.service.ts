import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { urlConfig } from '../../../config/config';
import {
  HideUncountedResultDto,
  InventoryCountReportDto,
  InventoryCountSessionDto,
  RecordCountRequest,
} from '../models/inventory-count';

@Injectable({ providedIn: 'root' })
export class InventoryCountService {
  private base = urlConfig.baseUrl + '/api/inventory/count';

  constructor(private http: HttpClient) {}

  createSession(): Observable<InventoryCountSessionDto> {
    return this.http.post<InventoryCountSessionDto>(`${this.base}/sessions`, {});
  }

  getActiveSession(): Observable<InventoryCountSessionDto | null> {
    return this.http.get<InventoryCountSessionDto>(`${this.base}/sessions/active`);
  }

  getById(id: string): Observable<InventoryCountSessionDto> {
    return this.http.get<InventoryCountSessionDto>(`${this.base}/sessions/${id}`);
  }

  listSessions(fromDate?: string, toDate?: string): Observable<InventoryCountSessionDto[]> {
    let params = new HttpParams();
    if (fromDate) params = params.set('fromDate', fromDate);
    if (toDate) params = params.set('toDate', toDate);
    return this.http.get<InventoryCountSessionDto[]>(`${this.base}/sessions`, { params });
  }

  recordCount(sessionId: string, request: RecordCountRequest): Observable<InventoryCountSessionDto> {
    return this.http.post<InventoryCountSessionDto>(`${this.base}/sessions/${sessionId}/entries`, request);
  }

  pauseSession(sessionId: string): Observable<InventoryCountSessionDto> {
    return this.http.patch<InventoryCountSessionDto>(`${this.base}/sessions/${sessionId}/pause`, {});
  }

  completeSession(sessionId: string): Observable<InventoryCountSessionDto> {
    return this.http.patch<InventoryCountSessionDto>(`${this.base}/sessions/${sessionId}/complete`, {});
  }

  getReport(sessionId: string): Observable<InventoryCountReportDto> {
    return this.http.get<InventoryCountReportDto>(`${this.base}/sessions/${sessionId}/report`);
  }

  hideUncounted(sessionId: string): Observable<HideUncountedResultDto> {
    return this.http.post<HideUncountedResultDto>(`${this.base}/sessions/${sessionId}/hide-uncounted`, {});
  }
}
