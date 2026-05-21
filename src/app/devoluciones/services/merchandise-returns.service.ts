import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { urlConfig } from '../../../config/config';
import { MerchandiseReturnDto, ReturnFilterDto } from '../models/merchandise-return';

@Injectable({ providedIn: 'root' })
export class MerchandiseReturnsService {
  private http = inject(HttpClient);
  private baseUrl = urlConfig.getMerchandiseReturnsServiceUrl();

  createSaleReturn(dto: MerchandiseReturnDto): Observable<MerchandiseReturnDto> {
    return this.http.post<MerchandiseReturnDto>(`${this.baseUrl}/sale`, dto);
  }

  createPurchaseReturn(dto: MerchandiseReturnDto): Observable<MerchandiseReturnDto> {
    return this.http.post<MerchandiseReturnDto>(`${this.baseUrl}/purchase`, dto);
  }

  getById(id: string): Observable<MerchandiseReturnDto> {
    return this.http.get<MerchandiseReturnDto>(`${this.baseUrl}/${id}`);
  }

  getByNumber(returnNumber: string): Observable<MerchandiseReturnDto> {
    return this.http.get<MerchandiseReturnDto>(`${this.baseUrl}/number/${returnNumber}`);
  }

  list(filter: ReturnFilterDto = {}): Observable<MerchandiseReturnDto[]> {
    return this.http.post<MerchandiseReturnDto[]>(`${this.baseUrl}/list`, filter);
  }

  cancel(id: string, cancelReason: string): Observable<MerchandiseReturnDto> {
    return this.http.patch<MerchandiseReturnDto>(`${this.baseUrl}/${id}/cancel`, { cancelReason });
  }
}
