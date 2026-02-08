# Prompt para Implementación de Sistema de Lotes en Backend

## Stack Tecnológico
- **Framework**: Spring Boot 3.x
- **Base de Datos**: MongoDB
- **Java**: 17+

---

## Contexto del Negocio

Se requiere implementar un sistema de gestión de **lotes (batches)** para productos de la categoría **"ANIMALES VIVOS"**. Este sistema permite:

1. **Crear lotes automáticamente** al registrar una compra de productos de esta categoría
2. **Numeración consecutiva** de lotes por producto, reiniciando cuando el stock llega a cero
3. **Vigencia de precio CONFIGURABLE por lote** - cada producto puede tener diferentes días de validez (ej: algunos 2 días, otros 8 días)
4. **Notificaciones 2 días antes** de que expire el precio de un lote
5. **Selección de lote específico** al momento de realizar una venta
6. **Actualización de precio** que genera un nuevo lote con nueva numeración

---

## Modelo de Datos (MongoDB Document)

### Colección: `batches`

```java
@Document(collection = "batches")
public class Batch {
    @Id
    private String id;
    
    private Integer batchNumber;           // Numeración consecutiva del lote (1, 2, 3...)
    private String productId;              // ID del producto asociado
    private LocalDate entryDate;           // Fecha de ingreso al almacén
    private BigDecimal salePrice;          // Precio de venta del lote
    private Integer initialStock;          // Stock inicial del lote
    private Integer currentStock;          // Stock actual disponible
    private String unitMeasure;            // Unidad de medida (UNIDAD para animales vivos)
    private Integer priceValidityDays;     // Días de validez del precio (CONFIGURABLE por lote)
    private LocalDate expirationDate;      // Fecha de expiración del precio (entryDate + priceValidityDays)
    private BatchStatus status;            // Estado del lote: ACTIVE, DEPLETED, EXPIRED, CLOSED
    private String purchaseInvoiceId;      // ID de la factura de compra que generó el lote (opcional)
    private String notes;                  // Notas adicionales
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}

public enum BatchStatus {
    ACTIVE,      // Lote activo con stock disponible
    DEPLETED,    // Lote agotado (stock = 0)
    EXPIRED,     // Lote con precio expirado (requiere actualización)
    CLOSED       // Lote cerrado manualmente
}
```

---

## Endpoints REST Requeridos

Base URL: `/api/batches`

### 1. Obtener lotes activos de un producto
```
GET /api/batches/product/{productId}/active
```
**Response**: `List<Batch>` - Lotes con status ACTIVE y currentStock > 0

### 2. Obtener un lote por ID
```
GET /api/batches/{batchId}
```
**Response**: `Batch`

### 3. Filtrar lotes
```
POST /api/batches/filter
```
**Request Body**:
```json
{
    "productId": "string (opcional)",
    "status": "ACTIVE|DEPLETED|EXPIRED|CLOSED (opcional)",
    "fromDate": "yyyy-MM-dd (opcional)",
    "toDate": "yyyy-MM-dd (opcional)",
    "onlyActive": true,
    "onlyExpiringSoon": false
}
```
**Response**: `List<Batch>`

### 4. Crear nuevo lote
```
POST /api/batches
```
**Request Body**:
```json
{
    "productId": "string",
    "salePrice": 15000,
    "initialStock": 50,
    "priceValidityDays": 8,
    "unitMeasure": "UNIDAD",
    "purchaseInvoiceId": "string (opcional)",
    "notes": "string (opcional)"
}
```
**Lógica de negocio**:
- Calcular `batchNumber`: Obtener el último lote del producto y sumar 1. Si no hay lotes activos (todos con stock 0), reiniciar a 1.
- Establecer `entryDate` = fecha actual
- Guardar `priceValidityDays` del request (días de validez configurables)
- Calcular `expirationDate` = entryDate + priceValidityDays
- Establecer `currentStock` = `initialStock`
- Establecer `status` = ACTIVE

**Response**: `Batch` creado

### 5. Actualizar precio (genera nuevo lote)
```
POST /api/batches/update-price
```
**Request Body**:
```json
{
    "productId": "string",
    "newSalePrice": 18000,
    "priceValidityDays": 8,
    "notes": "string (opcional)"
}
```
**Lógica de negocio**:
- Obtener todos los lotes ACTIVE del producto
- Sumar el `currentStock` de todos los lotes activos
- Cerrar (status = CLOSED) todos los lotes activos anteriores
- Crear un nuevo lote con:
  - `batchNumber` = último número + 1
  - `salePrice` = newSalePrice
  - `priceValidityDays` = del request (o heredar del lote anterior si no se envía)
  - `initialStock` y `currentStock` = suma de stocks anteriores
  - `entryDate` = fecha actual
  - `expirationDate` = fecha actual + priceValidityDays

**Response**: `Batch` nuevo creado

### 6. Registrar venta de lote
```
POST /api/batches/sale
```
**Request Body**:
```json
{
    "batchId": "string",
    "quantity": 5,
    "billingId": "string (opcional)"
}
```
**Lógica de negocio**:
- Validar que el lote existe y está ACTIVE
- Validar que `quantity` <= `currentStock`
- Restar `quantity` del `currentStock`
- Si `currentStock` llega a 0, cambiar `status` a DEPLETED
- **IMPORTANTE**: Verificar si TODOS los lotes del producto tienen stock 0. Si es así, el próximo lote debe reiniciar numeración a 1.

**Response**: `Batch` actualizado

### 7. Obtener lotes próximos a expirar
```
GET /api/batches/expiring-soon
```
**Lógica de negocio**:
- Buscar lotes con `status` = ACTIVE
- Donde `expirationDate` <= fecha actual + 2 días
- O donde `expirationDate` < fecha actual (ya expirados)

**Response**:
```json
[
    {
        "batch": { ... },
        "daysUntilExpiration": 2,
        "requiresAction": true
    }
]
```

### 8. Obtener resumen de lotes
```
GET /api/batches/summary
```
**Response**:
```json
[
    {
        "productId": "string",
        "productDescription": "string",
        "activeBatches": 3,
        "totalStock": 150,
        "oldestBatchDate": "2025-01-15",
        "newestBatchDate": "2025-02-01",
        "priceRange": {
            "min": 12000,
            "max": 15000
        }
    }
]
```

### 9. Cerrar lote manualmente
```
POST /api/batches/{batchId}/close
```
**Request Body**:
```json
{
    "notes": "string (opcional)"
}
```
**Lógica de negocio**:
- Cambiar `status` a CLOSED
- Agregar nota si se proporciona

**Response**: `Batch` actualizado

---

## Scheduled Tasks (Tareas Programadas)

### 1. Verificar lotes expirados (ejecutar diariamente a las 6:00 AM)

```java
@Scheduled(cron = "0 0 6 * * *")
public void checkExpiredBatches() {
    // Buscar lotes ACTIVE donde expirationDate < fecha actual
    // Cambiar status a EXPIRED
    // Opcionalmente: enviar notificación/log
}
```

### 2. Verificar lotes próximos a expirar (ejecutar diariamente a las 8:00 AM)

```java
@Scheduled(cron = "0 0 8 * * *")
public void checkExpiringSoonBatches() {
    // Buscar lotes ACTIVE donde expirationDate <= fecha actual + 2 días
    // Registrar en log o sistema de notificaciones
    // Esta información se expone vía endpoint GET /api/batches/expiring-soon
}
```

---

## Constantes de Configuración

```java
public class BatchConstants {
    public static final String BATCH_REQUIRED_CATEGORY = "ANIMALES VIVOS";
    public static final int BATCH_DEFAULT_PRICE_VALIDITY_DAYS = 8; // Valor por defecto si no se especifica
    public static final int BATCH_EXPIRATION_ALERT_DAYS = 2;
}
```

---

## Validaciones Importantes

1. **Al crear lote**: Verificar que el producto existe y pertenece a la categoría "ANIMALES VIVOS"
2. **Al vender**: Validar stock suficiente en el lote seleccionado
3. **Al actualizar precio**: Solo se puede si hay al menos un lote ACTIVE
4. **Numeración**: 
   - Incrementar secuencialmente por producto
   - Reiniciar a 1 cuando TODOS los lotes del producto tienen stock = 0

---

## Índices MongoDB Recomendados

```javascript
// Índice compuesto para búsquedas frecuentes
db.batches.createIndex({ "productId": 1, "status": 1 })

// Índice para búsqueda de lotes por expiración
db.batches.createIndex({ "expirationDate": 1, "status": 1 })

// Índice para obtener último número de lote
db.batches.createIndex({ "productId": 1, "batchNumber": -1 })
```

---

## DTOs Requeridos

### CreateBatchRequest
```java
public class CreateBatchRequest {
    private String productId;
    private BigDecimal salePrice;
    private Integer initialStock;
    private Integer priceValidityDays;    // Días de validez del precio (REQUERIDO)
    private String unitMeasure;
    private String purchaseInvoiceId;
    private String notes;
}
```

### UpdateBatchPriceRequest
```java
public class UpdateBatchPriceRequest {
    private String productId;
    private BigDecimal newSalePrice;
    private Integer priceValidityDays;    // Opcional: nuevos días de validez (si no se envía, hereda del lote anterior)
    private String notes;
}
```

### BatchSaleRequest
```java
public class BatchSaleRequest {
    private String batchId;
    private Integer quantity;
    private String billingId;
}
```

### BatchFilter
```java
public class BatchFilter {
    private String productId;
    private BatchStatus status;
    private LocalDate fromDate;
    private LocalDate toDate;
    private Boolean onlyActive;
    private Boolean onlyExpiringSoon;
}
```

### BatchExpirationAlert
```java
public class BatchExpirationAlert {
    private Batch batch;
    private Integer daysUntilExpiration;
    private Boolean requiresAction;
    private String productDescription;  // Descripción del producto (para mostrar en alertas del frontend)
}
```

### BatchSummary
```java
public class BatchSummary {
    private String productId;
    private String productDescription;
    private Integer activeBatches;
    private Integer totalStock;
    private LocalDate oldestBatchDate;
    private LocalDate newestBatchDate;
    private PriceRange priceRange;
    
    public static class PriceRange {
        private BigDecimal min;
        private BigDecimal max;
    }
}
```

---

## Estructura de Paquetes Sugerida

```
com.concentrados.la28.batch/
├── controller/
│   └── BatchController.java
├── service/
│   ├── BatchService.java
│   └── BatchServiceImpl.java
├── repository/
│   └── BatchRepository.java
├── model/
│   ├── Batch.java
│   └── BatchStatus.java
├── dto/
│   ├── CreateBatchRequest.java
│   ├── UpdateBatchPriceRequest.java
│   ├── BatchSaleRequest.java
│   ├── BatchFilter.java
│   ├── BatchExpirationAlert.java
│   └── BatchSummary.java
├── scheduler/
│   └── BatchScheduler.java
└── constants/
    └── BatchConstants.java
```

---

## Integración con Módulo de Compras Existente

Cuando se registra una compra (`PurchaseInvoice`) que contiene productos de la categoría "ANIMALES VIVOS":

1. Después de guardar la factura de compra exitosamente
2. Para cada item de la compra que sea de categoría "ANIMALES VIVOS":
   - Llamar al servicio de lotes para crear un nuevo lote
   - Pasar: productId, initialStock (cantidad comprada), purchaseInvoiceId
   - El precio de venta se define por el usuario (no viene de la compra)

**Nota**: En el frontend actual, después de guardar la compra se muestra un modal para que el usuario defina el precio de venta de cada lote. El backend debe soportar la creación del lote con el precio proporcionado.

---

## Integración con Módulo de Ventas (Billing)

Cuando se vende un producto de la categoría "ANIMALES VIVOS":

1. El frontend muestra los lotes disponibles (GET /api/batches/product/{productId}/active)
2. El usuario selecciona el lote y la cantidad
3. Al confirmar la venta, se debe:
   - Registrar la venta del lote (POST /api/batches/sale)
   - Incluir el batchId en el detalle de la venta (SaleDetail)

**Consideración**: El modelo `SaleDetail` existente podría necesitar un campo adicional `batchId` para productos que manejan lotes.

---

## Notas Adicionales

1. **Timezone**: Usar timezone de Colombia (America/Bogota) para cálculos de fechas
2. **Auditoría**: Los campos `createdAt` y `updatedAt` deben actualizarse automáticamente
3. **Logs**: Registrar todas las operaciones de lotes para auditoría
4. **Transacciones**: Las operaciones de actualización de precio y venta deben ser atómicas

---

## Frontend ya implementado

El frontend Angular ya tiene implementados:
- Modelo `Batch` y DTOs en `/src/app/lotes/models/batch.ts`
- Servicio `BatchService` en `/src/app/lotes/services/batch.service.ts`
- Componente de alertas `BatchExpirationAlertComponent`
- Componente selector de lotes `BatchSelectorModalComponent`
- Página de gestión `BatchManagementPageComponent`
- Integración en compras y facturación

Los endpoints del backend deben coincidir exactamente con los definidos en el servicio del frontend.
