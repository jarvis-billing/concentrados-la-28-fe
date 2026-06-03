import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { urlConfig } from '../../../config/config';
import { CreatePreSaleRequest, PreSaleDto, PreSaleFilterDto } from '../models/pre-sale';

@Injectable({ providedIn: 'root' })
export class PreSaleService {
  private url = urlConfig.getPreSaleServiceUrl();

  constructor(private http: HttpClient) {}

  create(request: CreatePreSaleRequest): Observable<PreSaleDto> {
    return this.http.post<PreSaleDto>(this.url, request);
  }

  getById(id: string): Observable<PreSaleDto> {
    return this.http.get<PreSaleDto>(`${this.url}/${id}`);
  }

  list(filter: PreSaleFilterDto): Observable<PreSaleDto[]> {
    return this.http.post<PreSaleDto[]>(`${this.url}/list`, filter);
  }

  cancel(id: string): Observable<PreSaleDto> {
    return this.http.patch<PreSaleDto>(`${this.url}/${id}/cancel`, {});
  }

  markAsBilled(id: string, billingId: string, billNumber?: string): Observable<PreSaleDto> {
    return this.http.patch<PreSaleDto>(`${this.url}/${id}/billed`, { billingId, billNumber });
  }

  resendNotification(id: string): Observable<PreSaleDto> {
    return this.http.patch<PreSaleDto>(`${this.url}/${id}/resend`, {});
  }
}
