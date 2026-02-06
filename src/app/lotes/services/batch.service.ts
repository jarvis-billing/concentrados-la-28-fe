import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { urlConfig } from '../../../config/config';
import {
    Batch,
    BatchFilter,
    BatchSummary,
    BatchExpirationAlert,
    CreateBatchRequest,
    UpdateBatchPriceRequest,
    BatchSaleRequest
} from '../models/batch';

@Injectable({
    providedIn: 'root'
})
export class BatchService {

    private url: string = urlConfig.getBatchServiceUrl();

    constructor(private http: HttpClient) { }

    /**
     * Obtiene todos los lotes activos de un producto
     */
    getActiveByProductId(productId: string): Observable<Batch[]> {
        return this.http.get<Batch[]>(`${this.url}/product/${productId}/active`);
    }

    /**
     * Obtiene un lote por su ID
     */
    getById(batchId: string): Observable<Batch> {
        return this.http.get<Batch>(`${this.url}/${batchId}`);
    }

    /**
     * Obtiene todos los lotes según filtros
     */
    getAll(filter: BatchFilter): Observable<Batch[]> {
        return this.http.post<Batch[]>(`${this.url}/filter`, filter);
    }

    /**
     * Crea un nuevo lote (generalmente automático al registrar compra)
     */
    create(request: CreateBatchRequest): Observable<Batch> {
        return this.http.post<Batch>(`${this.url}`, request);
    }

    /**
     * Actualiza el precio de un lote (genera nuevo lote automáticamente)
     */
    updatePrice(request: UpdateBatchPriceRequest): Observable<Batch> {
        return this.http.post<Batch>(`${this.url}/update-price`, request);
    }

    /**
     * Registra una venta del lote (reduce stock)
     */
    registerSale(request: BatchSaleRequest): Observable<Batch> {
        return this.http.post<Batch>(`${this.url}/sale`, request);
    }

    /**
     * Obtiene lotes próximos a expirar (para notificaciones)
     */
    getExpiringSoon(): Observable<BatchExpirationAlert[]> {
        return this.http.get<BatchExpirationAlert[]>(`${this.url}/expiring-soon`);
    }

    /**
     * Obtiene resumen de lotes por producto
     */
    getSummary(): Observable<BatchSummary[]> {
        return this.http.get<BatchSummary[]>(`${this.url}/summary`);
    }

    /**
     * Cierra un lote manualmente
     */
    closeBatch(batchId: string, notes?: string): Observable<Batch> {
        return this.http.post<Batch>(`${this.url}/${batchId}/close`, { notes });
    }

    /**
     * Verifica si un producto requiere manejo de lotes
     */
    requiresBatchManagement(category: string): boolean {
        return category?.toUpperCase() === 'ANIMALES VIVOS';
    }
}
