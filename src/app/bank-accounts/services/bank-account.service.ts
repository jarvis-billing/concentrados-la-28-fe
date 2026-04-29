import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { urlConfig } from '../../../config/config';
import { BankAccountDto, CreateBankAccountRequest } from '../models/bank-account.model';

@Injectable({ providedIn: 'root' })
export class BankAccountService {

    private readonly url = urlConfig.baseUrl + '/api/bank-accounts';

    constructor(private http: HttpClient) { }

    /** Lista cuentas activas */
    listActive(): Observable<BankAccountDto[]> {
        return this.http.get<BankAccountDto[]>(this.url);
    }

    /** Lista todas (activas e inactivas) */
    listAll(): Observable<BankAccountDto[]> {
        return this.http.get<BankAccountDto[]>(`${this.url}/all`);
    }

    /** Obtener por ID */
    getById(id: string): Observable<BankAccountDto> {
        return this.http.get<BankAccountDto>(`${this.url}/${id}`);
    }

    /** Crear cuenta */
    create(request: CreateBankAccountRequest): Observable<BankAccountDto> {
        return this.http.post<BankAccountDto>(this.url, request);
    }

    /** Actualizar cuenta */
    update(id: string, request: CreateBankAccountRequest): Observable<BankAccountDto> {
        return this.http.put<BankAccountDto>(`${this.url}/${id}`, request);
    }

    /** Desactivar (soft delete) */
    deactivate(id: string): Observable<void> {
        return this.http.delete<void>(`${this.url}/${id}`);
    }
}
