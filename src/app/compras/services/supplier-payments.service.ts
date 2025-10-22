import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { urlConfig } from '../../../config/config';
import { SupplierPayment } from '../models/supplier-payment';

@Injectable({ providedIn: 'root' })
export class SupplierPaymentsService {
  private baseUrl = urlConfig.microservicioPagoProveedorUrl();
  constructor(private http: HttpClient) {}

  create(payment: SupplierPayment, file?: File): Observable<void> {
    const form = new FormData();
    const metadata = new Blob([JSON.stringify(payment)], { type: 'application/json' });
    form.append('metadata', metadata);
    if (file) form.append('support', file, file.name);
    return this.http.post<void>(this.baseUrl, form);
  }

  list(params?: { supplierId?: string; from?: string; to?: string }): Observable<SupplierPayment[]> {
    return this.http.get<SupplierPayment[]>(this.baseUrl, { params: (params as any) || {} });
  }

  downloadSupport(id: string): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/${id}/support`, { responseType: 'blob' });
  }
}
