import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { PurchaseInvoice, LinkedPayment } from '../models/purchase-invoice';
import { BulkLastCostItem, CostHistoryEntry, PurchaseLastCostInfo } from '../models/purchase-cost-history';
import { urlConfig } from '../../../config/config';

export interface PurchasePaymentDetailResponse {
  purchaseId: string;
  purchaseTotal: number;
  totalPaid: number;
  paymentStatus: string;
  payments: Array<LinkedPayment & { bankAccountName?: string; originalAmount?: number }>;
}

@Injectable({ providedIn: 'root' })
export class PurchasesService {
  private http = inject(HttpClient);
  private baseUrl = urlConfig.getPurchaseServiceUrl();

  list(params?: any): Observable<PurchaseInvoice[]> {
    return this.http.get<PurchaseInvoice[]>(this.baseUrl, { params });
  }

  getById(id: string): Observable<PurchaseInvoice> {
    return this.http.get<PurchaseInvoice>(`${this.baseUrl}/${id}`);
  }

  create(payload: PurchaseInvoice): Observable<PurchaseInvoice> {
    return this.http.post<PurchaseInvoice>(this.baseUrl, payload);
  }

  update(id: string, payload: PurchaseInvoice): Observable<PurchaseInvoice> {
    return this.http.put<PurchaseInvoice>(`${this.baseUrl}/${id}`, payload);
  }

  addItems(id: string, items: any[]): Observable<PurchaseInvoice> {
    return this.http.post<PurchaseInvoice>(`${this.baseUrl}/${id}/items`, { items });
  }

  /**
   * Obtiene el último costo total por unidad registrado para una presentación.
   * Retorna null si la presentación nunca ha sido comprada (primera vez).
   */
  getLastCost(presentationId: string): Observable<PurchaseLastCostInfo | null> {
    const params = new HttpParams().set('presentationId', presentationId);
    return this.http.get<PurchaseLastCostInfo | null>(`${this.baseUrl}/last-cost`, { params });
  }

  /**
   * Obtiene en una sola llamada el último costo para una lista de barcodes.
   * El backend aplica fallback: si no hay historial de compras usa presentation.costPrice.
   * Barcodes sin datos en ninguna fuente son omitidos del resultado.
   */
  bulkGetLastCost(barcodes: string[]): Observable<BulkLastCostItem[]> {
    return this.http.post<BulkLastCostItem[]>(`${this.baseUrl}/last-cost/bulk`, { barcodes });
  }

  /**
   * Historial de costos de una presentación, ordenado de más reciente a más antiguo.
   */
  getCostHistory(presentationId: string, params?: { fromDate?: string; toDate?: string }): Observable<CostHistoryEntry[]> {
    let httpParams = new HttpParams().set('presentationId', presentationId);
    if (params?.fromDate) httpParams = httpParams.set('fromDate', params.fromDate);
    if (params?.toDate) httpParams = httpParams.set('toDate', params.toDate);
    return this.http.get<CostHistoryEntry[]>(`${this.baseUrl}/cost-history`, { params: httpParams });
  }

  linkPayments(purchaseInvoiceId: string, paymentIds: string[]): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/${purchaseInvoiceId}/link-payments`, { paymentIds });
  }

  getLinkedPayments(purchaseInvoiceId: string): Observable<PurchasePaymentDetailResponse> {
    return this.http.get<PurchasePaymentDetailResponse>(`${this.baseUrl}/${purchaseInvoiceId}/payments`);
  }
}
