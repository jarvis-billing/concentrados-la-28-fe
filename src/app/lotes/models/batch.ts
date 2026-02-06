import { Product } from '../../producto/producto';

/**
 * Representa un lote de productos de la categoría ANIMALES VIVOS.
 * Los lotes tienen numeración consecutiva, precio de venta y stock independiente.
 * Los días de validez del precio son configurables por lote.
 */
export interface Batch {
    id?: string;
    batchNumber: number;              // Numeración consecutiva del lote (1, 2, 3...)
    productId: string;                // ID del producto asociado
    product?: Product;                // Producto completo (opcional, para display)
    entryDate: string;                // Fecha de ingreso al almacén (ISO date)
    salePrice: number;                // Precio de venta del lote
    initialStock: number;             // Stock inicial del lote
    currentStock: number;             // Stock actual disponible
    unitMeasure: string;              // Unidad de medida (UNIDAD para animales vivos)
    priceValidityDays: number;        // Días de validez del precio (configurable por lote)
    expirationDate: string;           // Fecha de expiración del precio (entryDate + priceValidityDays)
    status: BatchStatus;              // Estado del lote
    purchaseInvoiceId?: string;       // ID de la factura de compra que generó el lote
    notes?: string;                   // Notas adicionales
    createdAt?: string;
    updatedAt?: string;
}

export enum BatchStatus {
    ACTIVE = 'ACTIVE',                // Lote activo con stock disponible
    DEPLETED = 'DEPLETED',            // Lote agotado (stock = 0)
    EXPIRED = 'EXPIRED',              // Lote con precio expirado (requiere actualización)
    CLOSED = 'CLOSED'                 // Lote cerrado manualmente
}

/**
 * DTO para crear un nuevo lote
 */
export interface CreateBatchRequest {
    productId: string;
    salePrice: number;
    initialStock: number;
    priceValidityDays: number;        // Días de validez del precio (configurable)
    unitMeasure?: string;
    purchaseInvoiceId?: string;
    notes?: string;
}

/**
 * DTO para actualizar precio de un lote (genera nuevo lote)
 */
export interface UpdateBatchPriceRequest {
    productId: string;
    newSalePrice: number;
    priceValidityDays?: number;       // Opcional: nuevos días de validez (si no se envía, usa el anterior)
    notes?: string;
}

/**
 * DTO para registrar venta de un lote
 */
export interface BatchSaleRequest {
    batchId: string;
    quantity: number;
    billingId?: string;
}

/**
 * Resumen de lotes para reportes
 */
export interface BatchSummary {
    productId: string;
    productDescription: string;
    activeBatches: number;
    totalStock: number;
    oldestBatchDate: string;
    newestBatchDate: string;
    priceRange: {
        min: number;
        max: number;
    };
}

/**
 * Notificación de lotes próximos a expirar
 */
export interface BatchExpirationAlert {
    batch: Batch;
    daysUntilExpiration: number;
    requiresAction: boolean;
}

/**
 * Filtros para consultar lotes
 */
export interface BatchFilter {
    productId?: string;
    status?: BatchStatus;
    fromDate?: string;
    toDate?: string;
    onlyActive?: boolean;
    onlyExpiringSoon?: boolean;       // Lotes que expiran en los próximos 2 días
}

/**
 * Categoría especial que requiere manejo de lotes
 */
export const BATCH_REQUIRED_CATEGORY = 'ANIMALES VIVOS';

/**
 * Días de vigencia del precio por defecto (valor sugerido)
 */
export const BATCH_DEFAULT_PRICE_VALIDITY_DAYS = 8;

/**
 * Días de anticipación para notificar expiración
 */
export const BATCH_EXPIRATION_ALERT_DAYS = 2;
