import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { urlConfig } from '../../../config/config';
import {
    CashToBankTransferRequest,
    InternalTransfer,
    InternalTransferType,
    InternalTransferStatus
} from '../models/internal-transfer.model';

@Injectable({ providedIn: 'root' })
export class InternalTransferService {

    private readonly baseUrl = urlConfig.baseUrl + '/api/v1/transfers';

    constructor(private http: HttpClient) { }

    transferCashToBank(request: CashToBankTransferRequest): Observable<InternalTransfer> {
        const formData = new FormData();

        // 1. Separamos el archivo del resto de los datos
        const { supportFile, ...dtoData } = request;

        // 2. Empaquetamos todo el DTO en un único Blob JSON
        // Esto es lo que Spring recibirá como @RequestPart("request")
        const jsonBlob = new Blob([JSON.stringify(dtoData)], {
            type: 'application/json'
        });

        formData.append('request', jsonBlob);

        // 3. Añadimos el archivo (si existe) con el nombre 'supportFile'
        if (supportFile) {
            formData.append('supportFile', supportFile);
        }

        // Importante: No configures cabeceras de Content-Type manualmente aquí.
        // El navegador detectará el FormData y pondrá el boundary correcto.
        return this.http.post<InternalTransfer>(`${this.baseUrl}/cash-to-bank`, formData);
    }

    getById(id: string): Observable<InternalTransfer> {
        return this.http.get<InternalTransfer>(`${this.baseUrl}/${id}`);
    }

    cancel(id: string, reason?: string): Observable<InternalTransfer> {
        return this.http.post<InternalTransfer>(`${this.baseUrl}/${id}/cancel`, { reason });
    }

    list(filters: {
        fromDate?: string;
        toDate?: string;
        type?: InternalTransferType;
        status?: InternalTransferStatus;
    } = {}): Observable<InternalTransfer[]> {
        let params = new HttpParams();
        if (filters.fromDate) params = params.set('fromDate', filters.fromDate);
        if (filters.toDate) params = params.set('toDate', filters.toDate);
        if (filters.type) params = params.set('type', filters.type);
        if (filters.status) params = params.set('status', filters.status);
        return this.http.get<InternalTransfer[]>(this.baseUrl, { params });
    }
}
