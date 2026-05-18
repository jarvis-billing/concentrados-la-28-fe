# Backend Prompt: Descuento de Stock de Lotes (ANIMALES VIVOS) al Crear Venta

## Stack Tecnológico

- **Framework**: Spring Boot 3.x
- **Base de Datos**: MongoDB
- **Java**: 17+
- **IDs**: String (MongoDB ObjectId)

---

## Contexto

Los productos de la categoría `ANIMALES VIVOS` manejan su stock a través de **lotes** (`Batch`), no directamente en el campo `stock` del producto. Cada lote tiene su propio `currentStock`, `salePrice` y fecha de expiración del precio.

Cuando el frontend crea una venta que incluye un producto de esta categoría, el `SaleDetailDto` **ya incluye el campo `batchId`** con el ID del lote seleccionado por el usuario.

El backend debe:
1. Detectar si `batchId` viene en el `SaleDetailDto`.
2. Si viene: descontar el stock del lote (`Batch.currentStock -= amount`).
3. Si NO viene (null/vacío): descontar del stock general del producto (comportamiento actual).

---

## Frontend ya implementado (referencia)

### Modelo TypeScript `SaleDetail`

```typescript
// src/app/factura/saleDetail.ts
export class SaleDetail {
    id: string = "";
    product: Product = new Product();
    amount: number = 0;
    unitPrice: number = 0;
    unitCost: number = 0;
    subTotal: number = 0;
    totalVat: number = 0;
    isBulkSale: boolean = false;
    bulkInputAmount?: number;
    batchId?: string;    // ← ID del lote para productos ANIMALES VIVOS
}
```

### Payload enviado al backend al guardar factura

`POST /api/billing` (o el endpoint de creación de ventas que esté configurado)

```json
{
  "client": { "id": "...", ... },
  "saleDetails": [
    {
      "id": "PRODUCT_ID",
      "product": { "id": "PRODUCT_ID", "category": "ANIMALES VIVOS", ... },
      "amount": 5,
      "unitPrice": 15000,
      "unitCost": 12000,
      "subTotal": 75000,
      "totalVat": 0,
      "isBulkSale": false,
      "batchId": "64abc123def456..."
    }
  ],
  "totalBilling": 75000,
  "saleType": "CONTADO",
  ...
}
```

---

## 1. Cambio en el documento Batch (colección `batches`)

No se requiere cambio de esquema. El documento ya tiene:

```java
@Document(collection = "batches")
public class Batch {
    @Id
    private String id;
    private String productId;
    private int batchNumber;
    private String entryDate;
    private double salePrice;
    private int initialStock;
    private int currentStock;        // ← este campo se decrementa
    private String unitMeasure;
    private int priceValidityDays;
    private String expirationDate;
    private String status;           // ACTIVE, DEPLETED, EXPIRED, CLOSED
    private String purchaseInvoiceId;
    private String notes;
    private Instant createdAt;
    private Instant updatedAt;
}
```

---

## 2. Cambio en `SaleDetailDto`

Agregar el campo `batchId` al DTO que recibe el backend:

```java
public class SaleDetailDto {
    private String id;               // ID del producto
    private ProductDto product;
    private int amount;
    private double unitPrice;
    private double unitCost;
    private double subTotal;
    private double totalVat;
    private boolean isBulkSale;
    private Double bulkInputAmount;
    private String batchId;          // ← NUEVO: ID del lote (null si no aplica)
    // getters y setters
}
```

---

## 3. Lógica de descuento al procesar la venta

En el servicio que procesa la creación de la venta (`BillingService` o equivalente), **dentro del método que guarda la factura**, agregar el descuento de lote:

```java
@Service
public class BillingService {

    @Autowired
    private BatchRepository batchRepository;

    // Método existente que guarda la factura — agregar lógica de lote
    public Billing createBilling(BillingRequest request) {
        
        // ... lógica existente de creación de factura ...

        // Descontar stock por cada línea de venta
        for (SaleDetailDto detail : request.getSaleDetails()) {
            if (detail.getBatchId() != null && !detail.getBatchId().isBlank()) {
                // Producto de ANIMALES VIVOS → descontar del lote
                discountBatchStock(detail.getBatchId(), detail.getAmount(), savedBilling.getId());
            }
            // Si batchId es null → el descuento del stock del producto
            // ocurre con el flujo actual (no modificar)
        }

        return savedBilling;
    }

    private void discountBatchStock(String batchId, int quantity, String billingId) {
        Batch batch = batchRepository.findById(batchId)
            .orElseThrow(() -> new ResponseStatusException(
                HttpStatus.NOT_FOUND,
                "Lote no encontrado: " + batchId));

        if (batch.getCurrentStock() < quantity) {
            throw new ResponseStatusException(
                HttpStatus.CONFLICT,
                "Stock insuficiente en el lote #" + batch.getBatchNumber() +
                ". Disponible: " + batch.getCurrentStock() + ", solicitado: " + quantity);
        }

        int newStock = batch.getCurrentStock() - quantity;
        batch.setCurrentStock(newStock);
        batch.setUpdatedAt(Instant.now());

        // Marcar como agotado si llegó a 0
        if (newStock <= 0) {
            batch.setStatus("DEPLETED");
        }

        batchRepository.save(batch);
    }
}
```

---

## 4. Validaciones de negocio

| Regla | HTTP Status | Mensaje |
|-------|-------------|---------|
| `batchId` válido pero lote no existe | 404 | `Lote no encontrado: {batchId}` |
| Stock del lote < cantidad vendida | 409 | `Stock insuficiente en el lote #N. Disponible: X, solicitado: Y` |
| Lote con `status = DEPLETED` o `CLOSED` | 400 | `El lote #N no está disponible para ventas` |
| Lote con precio expirado (`expirationDate < hoy`) | 400 | `El precio del lote #N está expirado. Actualice el precio antes de vender.` |

Agregar la validación de estado antes de descontar:

```java
private void discountBatchStock(String batchId, int quantity, String billingId) {
    Batch batch = batchRepository.findById(batchId)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
            "Lote no encontrado: " + batchId));

    // Validar estado
    if ("DEPLETED".equals(batch.getStatus()) || "CLOSED".equals(batch.getStatus())) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
            "El lote #" + batch.getBatchNumber() + " no está disponible para ventas");
    }

    // Validar precio no expirado
    LocalDate expiration = LocalDate.parse(batch.getExpirationDate());
    if (expiration.isBefore(LocalDate.now(ZoneId.of("America/Bogota")))) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
            "El precio del lote #" + batch.getBatchNumber() + " está expirado. Actualice el precio antes de vender.");
    }

    // Validar stock suficiente
    if (batch.getCurrentStock() < quantity) {
        throw new ResponseStatusException(HttpStatus.CONFLICT,
            "Stock insuficiente en el lote #" + batch.getBatchNumber() +
            ". Disponible: " + batch.getCurrentStock() + ", solicitado: " + quantity);
    }

    int newStock = batch.getCurrentStock() - quantity;
    batch.setCurrentStock(newStock);
    batch.setStatus(newStock <= 0 ? "DEPLETED" : batch.getStatus());
    batch.setUpdatedAt(Instant.now());

    batchRepository.save(batch);
}
```

---

## 5. Endpoint de consulta de lotes por producto (si no existe)

El frontend ya consume:

```
GET /api/v1/batches/product/{productId}/active
```

Este endpoint debe retornar todos los lotes con `status = ACTIVE` y `currentStock > 0` para un producto dado.

Si aún no existe, implementarlo:

```java
@GetMapping("/product/{productId}/active")
public ResponseEntity<List<Batch>> getActiveByProductId(@PathVariable String productId) {
    Query query = new Query();
    query.addCriteria(Criteria.where("productId").is(productId));
    query.addCriteria(Criteria.where("status").is("ACTIVE"));
    query.addCriteria(Criteria.where("currentStock").gt(0));
    query.with(Sort.by(Sort.Direction.ASC, "entryDate"));
    List<Batch> batches = mongoTemplate.find(query, Batch.class);
    return ResponseEntity.ok(batches);
}
```

---

## 6. Atomicidad (opcional pero recomendado)

Para evitar condiciones de carrera cuando se venden múltiples unidades simultáneamente, usar **update atómico** en MongoDB en lugar de read-modify-write:

```java
private void discountBatchStock(String batchId, int quantity) {
    Query query = Query.query(
        Criteria.where("id").is(batchId)
            .and("currentStock").gte(quantity)
            .and("status").is("ACTIVE")
    );

    Update update = new Update()
        .inc("currentStock", -quantity)
        .set("updatedAt", Instant.now());

    UpdateResult result = mongoTemplate.updateFirst(query, update, Batch.class);

    if (result.getMatchedCount() == 0) {
        // No se encontró o no había stock suficiente — hacer fetch para diagnóstico
        Batch batch = batchRepository.findById(batchId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                "Lote no encontrado: " + batchId));
        throw new ResponseStatusException(HttpStatus.CONFLICT,
            "Stock insuficiente en el lote #" + batch.getBatchNumber());
    }

    // Marcar como DEPLETED si currentStock llegó a 0
    Query depletedCheck = Query.query(
        Criteria.where("id").is(batchId).and("currentStock").lte(0));
    mongoTemplate.updateFirst(depletedCheck,
        Update.update("status", "DEPLETED"), Batch.class);
}
```

---

## 7. Índices MongoDB

```javascript
db.batches.createIndex({ "productId": 1, "status": 1 });
db.batches.createIndex({ "productId": 1, "currentStock": 1 });
db.batches.createIndex({ "expirationDate": 1 });
```

---

## 8. Checklist de Implementación

- [ ] Agregar campo `batchId` a `SaleDetailDto.java`
- [ ] En `BillingService.createBilling()`: iterar `saleDetails` y llamar `discountBatchStock` si `batchId != null`
- [ ] Implementar `discountBatchStock()` con validaciones de estado, expiración y stock
- [ ] Retornar error 409 si stock insuficiente **antes** de guardar la factura (validar primero, luego guardar)
- [ ] Marcar lote como `DEPLETED` cuando `currentStock <= 0`
- [ ] Verificar que `GET /api/v1/batches/product/{productId}/active` existe y retorna lotes activos
- [ ] Crear índices MongoDB
- [ ] Test: venta de producto ANIMALES VIVOS con `batchId` válido → `currentStock` se decrementa
- [ ] Test: venta con stock insuficiente → error 409, la factura NO se guarda
- [ ] Test: venta de producto sin `batchId` → comportamiento actual sin cambios
