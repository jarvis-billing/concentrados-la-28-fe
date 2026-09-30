import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { urlConfig } from '../../../config/config';
import {
  BulkCountRequest,
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

  /** Guarda el conteo de múltiples presentaciones de un mismo producto y actualiza el stock */
  recordBulkCount(sessionId: string, request: BulkCountRequest): Observable<InventoryCountSessionDto> {
    return this.http.post<InventoryCountSessionDto>(`${this.base}/sessions/${sessionId}/entries/bulk`, request);
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

  getValueReportData(fromDate: string, toDate: string): Observable<InventoryValueReportData> {
    return this.http.post<InventoryValueReportData>(`${this.base}/report/value-data`, { fromDate, toDate });
  }

  generateValuePdf(fromDate: string, toDate: string): Observable<Blob> {
    return this.http.post(`${this.base}/report/value-pdf`, { fromDate, toDate }, { responseType: 'blob' });
  }

  bulkUpdatePresentationCosts(updates: CostUpdateItem[]): Observable<unknown> {
    const productBase = urlConfig.baseUrl + '/api/product';
    return this.http.post(`${productBase}/presentations/bulk-price-update`, { updates });
  }

  deleteNullBarcodeRow(productId: string, piId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/report/null-barcode-row`, {
      params: { productId, piId },
    });
  }
}

export interface InventoryValueRow {
  productId: string;
  physicalInventoryId: string;
  description: string;
  presentationLabel: string;
  barcode: string;
  countDate: string;
  physicalStock: number;
  unitMeasure: string;
  fixedAmount: number | null;
  unitCost: number;
  salePrice: number;
  totalValue: number;
}

export interface CostUpdateItem {
  productId: string;
  barcode: string;
  costPrice: number;
}

export interface InventoryUncountedRow {
  description: string;
  label: string;
  barcode: string;
  unitMeasure: string;
}

export interface InventoryValueReportData {
  fromDate: string;
  toDate: string;
  generatedAt: string;
  grandTotal: number;
  rows: InventoryValueRow[];
  noCostRows: InventoryValueRow[];
  noCostZeroRows: InventoryValueRow[];
  nullBarcodeRows: InventoryValueRow[];
  uncountedProducts: InventoryUncountedRow[];
}
