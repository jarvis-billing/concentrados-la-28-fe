import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { urlConfig } from '../../../config/config';
import { SupplierPayment, SupplierPaymentStatus } from '../models/supplier-payment';

@Injectable({ providedIn: 'root' })
export class SupplierPaymentsService {
  private baseUrl = urlConfig.getSupplierPaymentsServiceUrl();
  constructor(private http: HttpClient) {}

  create(payment: SupplierPayment, file?: File): Observable<SupplierPayment> {
    const form = new FormData();
    const metadata = new Blob([JSON.stringify(payment)], { type: 'application/json' });
    form.append('metadata', metadata);
    if (file) form.append('support', file, file.name);
    return this.http.post<SupplierPayment>(this.baseUrl, form);
  }

  list(params?: { supplierId?: string; bankAccountId?: string; from?: string; to?: string; status?: SupplierPaymentStatus | 'CORTE'; unlinkedOnly?: boolean }): Observable<SupplierPayment[]> {
    // Quitar parámetros vacíos: HttpParams envía undefined como el texto "undefined"
    const clean: Record<string, string> = {};
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') clean[k] = String(v);
    });
    return this.http.get<SupplierPayment[]>(this.baseUrl, { params: clean });
  }

  listUnlinked(supplierId: string): Observable<SupplierPayment[]> {
    return this.http.get<SupplierPayment[]>(`${this.baseUrl}/unlinked`, { params: { supplierId } });
  }

  unlink(paymentId: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/${paymentId}/unlink`, {});
  }

  downloadSupport(id: string): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/${id}/support`, { responseType: 'blob' });
  }
}
