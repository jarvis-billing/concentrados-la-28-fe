/**
 * Payload para la actualización masiva de precios a nivel de presentación.
 * Permite enviar múltiples cambios en un solo request y que el backend
 * los aplique de forma atómica.
 */
export interface BulkPresentationPriceUpdateRequest {
    updates: PresentationPriceUpdate[];
}

export interface PresentationPriceUpdate {
    productId: string;
    barcode: string;
    salePrice?: number;   // Si viene, actualiza el precio de venta
    costPrice?: number;   // Si viene, actualiza el costo unitario
}

export interface BulkPresentationPriceUpdateResponse {
    updated: number;
    failed: number;
    errors?: BulkUpdateError[];
}

export interface BulkUpdateError {
    productId: string;
    barcode: string;
    message: string;
}
