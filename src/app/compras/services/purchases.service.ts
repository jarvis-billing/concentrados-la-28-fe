import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { PurchaseInvoice } from '../models/purchase-invoice';
import { urlConfig } from '../../../config/config';

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
}
