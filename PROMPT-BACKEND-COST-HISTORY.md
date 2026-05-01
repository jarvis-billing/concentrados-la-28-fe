# Prompt Backend: Trazabilidad de Costos de Compra (Historial de Costos)

## Contexto
Se requiere que el usuario de compras pueda ver, al momento de ingresar una nueva factura de compra, cuánto le costó la última vez que compró un producto (misma presentación). Esto se resuelve con nuevos endpoints en el módulo de compras (`PurchaseInvoice` / `PurchaseItem`) que permitan consultar el último costo histórico y un historial completo por presentación.

## Cambios en Modelo de Datos

### `PurchaseItem` (entidad/ítem de factura de compra)
Agregar campo nuevo:
```java
@Column(nullable = true)
private BigDecimal unitTotalCost;  // Costo total por unidad = unitCost + ivaPorUnidad + fletePorUnidad
```

Cuando se crea o se agregan ítems a una factura, calcular y persistir:
```
unitTotalCost = unitCost
              + (vatAmount / quantity)       // IVA por unidad
              + (freightAmount / quantity) // flete por unidad
```
Si `quantity == 0`, usar `0` para las divisiones.

## Nuevos Endpoints

### 1. GET /api/purchases/last-cost
**Descripción:** Devuelve el costo de la última compra registrada para una presentación de producto dada, antes de la factura actual. Es decir, la compra más reciente con `unitTotalCost != null`.

**Query params:**
- `presentationId` (String, required) — valor del `presentationId` o `presentationBarcode` del ítem.

**Respuesta exitosa (200):**
```json
{
  "presentationId": "770123456789",
  "presentationBarcode": "770123456789",
  "productDescription": "Concentrado pollos 40kg",
  "lastUnitCost": 45000,
  "lastVatRate": 19,
  "lastVatPerUnit": 8550,
  "lastFreightPerUnit": 500,
  "lastUnitTotalCost": 54050,
  "lastInvoiceId": "uuid-de-la-factura",
  "lastInvoiceNumber": "FAC-2025-001",
  "lastInvoiceDate": "2025-03-15",
  "lastSupplierId": "uuid-proveedor",
  "lastSupplierName": "Proveedor ABC S.A.S."
}
```

**Respuesta si nunca ha sido comprado (200):**
```json
null
```

**Lógica de negocio:**
1. Buscar todas las `PurchaseInvoice` cuyos `PurchaseItem` tengan `presentationId` igual al parámetro.
2. Filtrar solo ítems donde `unitTotalCost IS NOT NULL`.
3. Ordenar por `invoiceDate` (o `createdAt`) descendente.
4. Tomar el primer resultado (la compra más reciente).
5. Extraer los campos del ítem y de su factura padre para poblar `PurchaseLastCostInfo`.

**DTO / Response class sugerido:** `PurchaseLastCostInfo`

---

### 2. GET /api/purchases/cost-history
**Descripción:** Devuelve el historial completo de compras de una presentación, con los costos desglosados por unidad, para que el usuario pueda ver la evolución de precios en el tiempo.

**Query params:**
- `presentationId` (String, required)
- `fromDate` (String, opcional, formato `yyyy-MM-dd`) — filtra facturas con `invoiceDate >= fromDate`
- `toDate` (String, opcional, formato `yyyy-MM-dd`) — filtra facturas con `invoiceDate <= toDate`

**Respuesta exitosa (200):**
```json
[
  {
    "invoiceId": "uuid-factura-2",
    "invoiceNumber": "FAC-2025-002",
    "invoiceDate": "2025-04-28",
    "createdAt": "2025-04-28T14:30:00",
    "supplierId": "uuid-proveedor",
    "supplierName": "Proveedor ABC S.A.S.",
    "presentationId": "770123456789",
    "presentationBarcode": "770123456789",
    "productDescription": "Concentrado pollos 40kg",
    "quantity": 10,
    "unitCost": 46000,
    "vatRate": 19,
    "vatAmount": 87400,
    "freightAmount": 5000,
    "unitTotalCost": 60740
  },
  {
    "invoiceId": "uuid-factura-1",
    "invoiceNumber": "FAC-2025-001",
    "invoiceDate": "2025-03-15",
    "createdAt": "2025-03-15T09:15:00",
    "supplierId": "uuid-proveedor",
    "supplierName": "Proveedor ABC S.A.S.",
    "presentationId": "770123456789",
    "presentationBarcode": "770123456789",
    "productDescription": "Concentrado pollos 40kg",
    "quantity": 8,
    "unitCost": 45000,
    "vatRate": 19,
    "vatAmount": 68400,
    "freightAmount": 4000,
    "unitTotalCost": 54050
  }
]
```

**Orden:** Más reciente primero (`invoiceDate DESC`, `createdAt DESC`).

**Lógica de negocio:**
1. Buscar todos los `PurchaseItem` donde `presentationId` coincida y `unitTotalCost IS NOT NULL`.
2. Traer la factura padre (`PurchaseInvoice`) con su proveedor.
3. Aplicar filtros de fecha sobre `invoice.emissionDate` (o `invoiceDate`).
4. Mapear cada ítem a `CostHistoryEntry`.
5. Ordenar descendente por fecha de factura.

**DTO / Response class sugerido:** `CostHistoryEntry`

---

## Cambios en Persistencia (Create / Update Invoice)

### Al crear una factura nueva (`POST /api/purchases`)
El payload que envía el FE ahora incluye `unitTotalCost` en cada ítem. Validar y persistir este campo.

```json
{
  "supplier": { "id": "..." },
  "invoiceNumber": "FAC-2025-003",
  "emissionDate": "2025-04-30",
  "paymentType": "CONTADO",
  "freightRate": 500,
  "items": [
    {
      "productId": "uuid-producto",
      "presentationId": "770123456789",
      "presentationBarcode": "770123456789",
      "description": "Concentrado pollos 40kg",
      "quantity": 10,
      "unitCost": 47000,
      "vatRate": 19,
      "vatAmount": 89300,
      "totalCost": 470000,
      "applyFreight": true,
      "freightAmount": 5000,
      "unitTotalCost": 61730
    }
  ]
}
```

Nota: el `unitTotalCost` que envía el FE ya viene calculado, pero el backend puede validarlo o recalcularlo por seguridad:
```
unitTotalCost = unitCost
              + (vatAmount / quantity)
              + (freightAmount / quantity)
```

### Al agregar ítems a factura existente (`POST /api/purchases/{id}/items`)
Idem: persistir `unitTotalCost` en cada nuevo `PurchaseItem`.

## Notas Técnicas
- Usar `BigDecimal` en Java para todos los campos monetarios. Redondear a 2 decimales al persistir.
- `presentationId` en el modelo actual corresponde al `barcode` de la presentación. Se usa como clave natural para buscar históricos.
- Si la factura no tiene `emissionDate`, usar `createdAt` como fallback para ordenamiento y filtros.
- El endpoint `last-cost` debe excluir la factura que se está editando actualmente (si aplica en modo edición). El FE enviará solo el `presentationId`; el backend puede optar por devolver el costo más reciente sin excepciones, dado que en modo edición no se modifica el ítem existente.

## Modelos de respuesta (referencia FE)
Ver `src/app/compras/models/purchase-cost-history.ts`:
- `PurchaseLastCostInfo`
- `CostHistoryEntry`

Y `src/app/compras/models/purchase-item.ts`:
- Campo `unitTotalCost?: number` agregado a `PurchaseItem`
