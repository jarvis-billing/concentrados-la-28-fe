# Backend Prompt — Endpoint Bulk: Último Costo de Compra por Presentación

## Stack
- Spring Boot 3.x · MongoDB · Java 17+
- IDs como `String` (ObjectId de MongoDB)
- Controlador base de facturas de compra: `GET /api/purchases/invoices/last-cost?presentationId=xxx`

---

## Objetivo

Crear un endpoint **POST /api/purchases/invoices/last-cost/bulk** que reciba una lista de barcodes
de presentaciones y devuelva, para cada una, el último costo de compra registrado en las facturas.

**Lógica de fallback (todo en el backend):**
- Si la presentación **tiene historial de compras** → devolver datos del último costo facturado
  (unitCost, vatRate, vatPerUnit, freightPerUnit, unitTotalCost + metadatos de la factura).
- Si la presentación **NO tiene historial de compras** → buscar la entidad `Product` cuya presentación
  tenga ese barcode y devolver `presentation.costPrice` como `lastUnitTotalCost`
  (con `source: "PRODUCT_ENTITY"` para que el frontend distinga el origen).
- Si el barcode no existe en ninguna parte → **omitir** esa entrada del resultado (no incluirla).

---

## Request

```
POST /api/purchases/invoices/last-cost/bulk
Content-Type: application/json

{
  "barcodes": ["7700123456789", "7700987654321", ...]
}
```

| Campo     | Tipo         | Descripción                          |
|-----------|--------------|--------------------------------------|
| `barcodes`| `List<String>` | Lista de barcodes de presentaciones. Máximo 500 por request. |

---

## Response

```json
[
  {
    "barcode": "7700123456789",
    "presentationId": "barcode-or-internal-id",
    "productDescription": "CONCENTRADO LECHERO 40KG",
    "lastUnitCost": 85000,
    "lastVatRate": 0,
    "lastVatPerUnit": 0,
    "lastFreightPerUnit": 1250,
    "lastUnitTotalCost": 86250,
    "lastInvoiceId": "abc123",
    "lastInvoiceNumber": "FC-2024-001",
    "lastInvoiceDate": "2024-11-15",
    "lastSupplierId": "sup001",
    "lastSupplierName": "Proveedor XYZ",
    "source": "PURCHASE_INVOICE"
  },
  {
    "barcode": "7700987654321",
    "presentationId": "7700987654321",
    "productDescription": "SAL MINERAL 25KG",
    "lastUnitCost": 42000,
    "lastVatRate": 0,
    "lastVatPerUnit": 0,
    "lastFreightPerUnit": 0,
    "lastUnitTotalCost": 42000,
    "lastInvoiceId": null,
    "lastInvoiceNumber": null,
    "lastInvoiceDate": null,
    "lastSupplierId": null,
    "lastSupplierName": null,
    "source": "PRODUCT_ENTITY"
  }
]
```

### Campo `source`
| Valor              | Significado                                               |
|--------------------|-----------------------------------------------------------|
| `PURCHASE_INVOICE` | El costo viene del último registro en facturas de compra  |
| `PRODUCT_ENTITY`   | No hay historial; se usa `presentation.costPrice` como fallback |

---

## Lógica de implementación

### Paso 1 — Consulta en facturas de compra
Para cada barcode en la lista, buscar en la colección `purchase_invoices` (o como se llame) los items
que tengan `presentationBarcode = barcode` (o `presentationId`), ordenados por `invoiceDate DESC`,
y tomar el primero (el más reciente).

**Optimización obligatoria:** usar una sola consulta agregada (`$match` + `$unwind items` + `$group by barcode` + `$sort`) en lugar de N consultas individuales. El pipeline debe:
1. `$match`: `{ "items.presentationBarcode": { $in: [...barcodes] } }`
2. `$unwind`: `"$items"`
3. `$match`: filtrar solo los items con barcode en la lista
4. `$sort`: `{ invoiceDate: -1, createdAt: -1 }`
5. `$group`: `_id: "$items.presentationBarcode"`, acumular el primer hit (más reciente) con `$first`
6. `$project`: mapear los campos necesarios

### Paso 2 — Fallback para barcodes sin historial
Para los barcodes que no tuvieron resultado en el paso 1, buscar en la colección `products`:
`{ "presentations.barcode": { $in: [...barcodesWithoutHistory] } }`

Iterar las presentaciones de cada producto encontrado, localizar la que coincida con el barcode y
tomar `presentation.costPrice`. Si `costPrice` es 0 o null, igualmente incluir la entrada con `lastUnitTotalCost: 0`.

### Paso 3 — Construir respuesta
Unir resultados de pasos 1 y 2. Omitir barcodes que no existan en ninguna parte.

---

## DTO — Java

```java
// Request
public record BulkLastCostRequest(
    @NotNull @Size(min = 1, max = 500)
    List<String> barcodes
) {}

// Enum source
public enum CostSource {
    PURCHASE_INVOICE,
    PRODUCT_ENTITY
}

// Response item
public record BulkLastCostItem(
    String barcode,
    String presentationId,
    String productDescription,
    double lastUnitCost,
    double lastVatRate,
    double lastVatPerUnit,
    double lastFreightPerUnit,
    double lastUnitTotalCost,
    String lastInvoiceId,       // null si source = PRODUCT_ENTITY
    String lastInvoiceNumber,   // null si source = PRODUCT_ENTITY
    String lastInvoiceDate,     // null si source = PRODUCT_ENTITY (ISO yyyy-MM-dd)
    String lastSupplierId,      // null si source = PRODUCT_ENTITY
    String lastSupplierName,    // null si source = PRODUCT_ENTITY
    CostSource source
) {}
```

---

## Controlador

```java
@PostMapping("/last-cost/bulk")
public ResponseEntity<List<BulkLastCostItem>> bulkLastCost(
    @Valid @RequestBody BulkLastCostRequest request
) {
    return ResponseEntity.ok(purchaseInvoiceService.bulkGetLastCost(request.barcodes()));
}
```

---

## Índices recomendados (si no existen)

```javascript
// En la colección de facturas de compra:
db.purchase_invoices.createIndex({ "items.presentationBarcode": 1, "invoiceDate": -1 })

// En productos:
db.products.createIndex({ "presentations.barcode": 1 })
```

---

## Notas importantes

1. **No modificar** el endpoint individual existente `GET /last-cost?presentationId=xxx`.
   Este nuevo endpoint es adicional y complementario.

2. El campo `lastUnitTotalCost` para `PRODUCT_ENTITY` debe calcularse como:
   `presentation.costPrice` (sin IVA ni flete ya que esos no se conocen sin factura).
   `lastVatRate`, `lastVatPerUnit`, `lastFreightPerUnit` deben ser `0`.

3. Si `presentation.costPrice` es `null` o `0` en la entidad producto, devolver el item igualmente
   con `lastUnitTotalCost: 0` y `source: PRODUCT_ENTITY` para que el frontend pueda mostrar
   la advertencia de "sin precio registrado".

4. El response es una `List`, no un `Map`, para facilitar la serialización y paginación futura.
