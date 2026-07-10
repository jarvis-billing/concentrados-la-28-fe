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

export interface PurchasePagedResponse {
  content: PurchaseInvoice[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
}

export interface PurchaseListFilter {
  createdAtFrom?: string;
  createdAtTo?: string;
  supplierId?: string;
  productBarcode?: string;
  invoiceNumber?: string;
  page?: number;
  size?: number;
}

@Injectable({ providedIn: 'root' })
export class PurchasesService {
  private http = inject(HttpClient);
  private baseUrl = urlConfig.getPurchaseServiceUrl();

  /** @deprecated Usa listPaged() */
  list(params?: any): Observable<PurchaseInvoice[]> {
    return this.http.get<PurchaseInvoice[]>(this.baseUrl, { params });
  }

  listPaged(filter: PurchaseListFilter = {}): Observable<PurchasePagedResponse> {
    let params = new HttpParams();
    if (filter.createdAtFrom)  params = params.set('createdAtFrom',  filter.createdAtFrom);
    if (filter.createdAtTo)    params = params.set('createdAtTo',    filter.createdAtTo);
    if (filter.supplierId)     params = params.set('supplierId',     filter.supplierId);
    if (filter.productBarcode) params = params.set('productBarcode', filter.productBarcode);
    if (filter.invoiceNumber)  params = params.set('invoiceNumber',  filter.invoiceNumber);
    params = params.set('page', String(filter.page ?? 0));
    params = params.set('size', String(filter.size ?? 20));
    return this.http.get<PurchasePagedResponse>(this.baseUrl, { params });
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
