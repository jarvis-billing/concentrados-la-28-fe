/**
 * Última información de costo registrada para una presentación de producto.
 * Devuelta por GET /api/purchases/last-cost?presentationId=xxx
 */
export interface PurchaseLastCostInfo {
  presentationId: string;
  presentationBarcode?: string;
  productDescription?: string;
  lastUnitCost: number;          // Costo unitario base (sin IVA ni flete)
  lastVatRate: number;           // % IVA aplicado
  lastVatPerUnit: number;        // IVA por unidad
  lastFreightPerUnit: number;    // Flete por unidad (0 si no aplicaba)
  lastUnitTotalCost: number;     // Costo TOTAL por unidad = unitCost + IVA/u + flete/u
  lastInvoiceId?: string;
  lastInvoiceNumber?: string;
  lastInvoiceDate?: string;      // ISO yyyy-MM-dd
  lastSupplierId?: string;
  lastSupplierName?: string;
}

/**
 * Una entrada del historial de costos de una presentación.
 * Devuelta por GET /api/purchases/cost-history?presentationId=xxx
 */
export interface CostHistoryEntry {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;          // ISO yyyy-MM-dd (fecha de emisión)
  createdAt?: string;           // Fecha de registro en el sistema
  supplierId?: string;
  supplierName?: string;
  presentationId: string;
  presentationBarcode?: string;
  productDescription?: string;
  quantity: number;
  unitCost: number;
  vatRate: number;
  vatAmount: number;            // total
  freightAmount: number;        // total
  unitTotalCost: number;        // unitCost + IVA/u + flete/u
}
