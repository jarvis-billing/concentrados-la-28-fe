export interface PurchaseItem {
  productId: string;
  presentationBarcode: string;
  presentationId: string;
  description: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  vatRate: number;       // % IVA aplicado al ítem (0, 5, 19)
  vatAmount: number;     // Valor del IVA = unitCost * quantity * (vatRate/100)
  applyFreight: boolean; // Si este ítem aplica flete
  freightAmount: number; // Flete asignado = freightRate × quantity (si applyFreight)
  unitTotalCost?: number; // Costo total por unidad = unitCost + (IVA/u) + (flete/u). Para trazabilidad histórica.
}
