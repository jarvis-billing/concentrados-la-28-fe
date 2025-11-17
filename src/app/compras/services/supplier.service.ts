import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Supplier } from '../models/supplier';
import { urlConfig } from '../../../config/config';

@Injectable({ providedIn: 'root' })
export class SupplierService {
  private http = inject(HttpClient);
  private baseUrl = urlConfig.getSupplierServiceUrl();

  list(params?: any): Observable<Supplier[]> {
    return this.http.get<Supplier[]>(this.baseUrl, { params });
  }

  create(payload: Supplier): Observable<Supplier> {
    return this.http.post<Supplier>(this.baseUrl, payload);
  }

  update(id: string, payload: Supplier): Observable<Supplier> {
    return this.http.put<Supplier>(`${this.baseUrl}/${id}`, payload);
  }

  updateStatus(id: string, status: 'ACTIVE' | 'INACTIVE'): Observable<void> {
    return this.http.patch<void>(`${this.baseUrl}/${id}/status`, { status });
  }
}
