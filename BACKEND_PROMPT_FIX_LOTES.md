# Prompt de Corrección de Bugs — Sistema de Lotes (Batches)

## Stack
- Spring Boot 3.x / MongoDB / Java 17+

---

## Bug 1 — Unificación de stock al actualizar precio

### Descripción del problema

El endpoint `POST /api/batches/update-price` fue implementado con la lógica de:
1. Obtener **todos** los lotes ACTIVE/EXPIRED del producto
2. Sumar el stock de **todos** ellos
3. Cerrar todos los lotes anteriores
4. Crear un nuevo lote con el stock combinado

Esto es incorrecto. El sistema de lotes existe precisamente para manejar **stock independiente por lote**. Si un producto tiene 3 lotes activos con 10 unidades cada uno, actualizar el precio de uno NO debe afectar a los otros dos.

### Causa raíz

El frontend ahora envía `batchId` en el request (campo que no existía antes). El backend debe usar ese `batchId` para operar **exclusivamente** sobre ese lote.

### Cambio requerido en el DTO

```java
// ANTES (incorrecto - no tenía batchId)
public class UpdateBatchPriceRequest {
    private String productId;
    private BigDecimal newSalePrice;
    private Integer priceValidityDays;
    private String notes;
}

// DESPUÉS (correcto - agrega batchId)
public class UpdateBatchPriceRequest {
    private String batchId;       // NUEVO - ID del lote específico a actualizar
    private String productId;
    private BigDecimal newSalePrice;
    private Integer priceValidityDays;
    private String notes;
}
```

### Nueva lógica de negocio para `POST /api/batches/update-price`

```
REEMPLAZAR la lógica actual por:

1. Obtener el lote por batchId (lanzar 404 si no existe)
2. Validar que batch.productId == request.productId (seguridad)
3. Validar que el lote NO tenga status CLOSED o DEPLETED
4. Cerrar (status = CLOSED) ÚNICAMENTE ese lote (batch.status = CLOSED)
5. Crear un nuevo lote con:
   - productId = batch.productId
   - salePrice = request.newSalePrice
   - priceValidityDays = request.priceValidityDays ?? batch.priceValidityDays
   - initialStock = batch.currentStock   ← stock del lote cerrado, NO suma de todos
   - currentStock = batch.currentStock   ← ídem
   - entryDate = LocalDate.now()
   - expirationDate = LocalDate.now() + priceValidityDays
   - status = ACTIVE
   - batchNumber = obtener último batchNumber del producto + 1
   - unitMeasure = batch.unitMeasure
   - notes = request.notes

6. Guardar el lote cerrado y el nuevo lote
7. Retornar el nuevo lote
```

### Regla crítica

> **Nunca** sumar el stock de múltiples lotes ni cerrar lotes que no correspondan al `batchId` enviado. Cada lote es completamente independiente.

---

## Bug 2 — Descripción del producto aparece como N/A en alertas de expiración

### Descripción del problema

El endpoint `GET /api/batches/expiring-soon` devuelve objetos `BatchExpirationAlert` donde el campo `productDescription` puede estar vacío/nulo. El frontend intenta mostrar `batch.product?.description` (que tampoco viene populado) y `alert.productDescription`, y cuando ambos son nulos muestra "N/A".

### Cambio requerido

El campo `productDescription` en `BatchExpirationAlert` debe **siempre** estar populado. No es opcional.

```java
// BatchExpirationAlert DTO
public class BatchExpirationAlert {
    private Batch batch;
    private Integer daysUntilExpiration;
    private Boolean requiresAction;
    private String productDescription;   // DEBE siempre tener valor - nunca null/vacío
}
```

### Lógica de construcción en el servicio

Cuando se construya el objeto `BatchExpirationAlert`, obtener siempre la descripción del producto:

```java
// En el método que construye las alertas de expiración:
Product product = productRepository.findById(batch.getProductId()).orElse(null);
String productDescription = (product != null && product.getDescription() != null)
    ? product.getDescription()
    : "Producto " + batch.getProductId();  // fallback descriptivo, nunca null

BatchExpirationAlert alert = new BatchExpirationAlert();
alert.setBatch(batch);
alert.setDaysUntilExpiration(daysUntilExpiration);
alert.setRequiresAction(true);
alert.setProductDescription(productDescription);  // siempre con valor
```

### Notas adicionales

- Si el campo `batch.product` (objeto `Product` embebido en la respuesta del lote) también se puede popular, sería ideal hacerlo también para que el fallback `batch.product?.description` funcione desde el frontend.
- La prioridad mínima es que `productDescription` en el DTO de alerta siempre tenga un valor no vacío.

---

## Resumen de cambios en el backend

| Archivo | Cambio |
|---|---|
| `UpdateBatchPriceRequest.java` | Agregar campo `batchId: String` |
| `BatchServiceImpl.java` → `updatePrice()` | Reemplazar lógica de merge/unificación de todos los lotes por lógica de lote único usando `batchId` |
| `BatchServiceImpl.java` → `getExpiringSoon()` | Siempre poblar `productDescription` en cada `BatchExpirationAlert` |

---

## Prueba de regresión

Para verificar que el Bug 1 está corregido:
1. Crear producto de categoría "ANIMALES VIVOS"
2. Crear Lote A: 10 unidades, precio $15.000
3. Crear Lote B: 5 unidades, precio $20.000
4. Llamar `POST /api/batches/update-price` con `batchId = ID del Lote A`, `newSalePrice = 18.000`
5. **Resultado esperado**:
   - Se crea Lote C con 10 unidades (solo el stock del Lote A) y precio $18.000
   - El Lote B **sigue activo con sus 5 unidades y precio $20.000** (NO se toca)
   - El Lote A queda cerrado (CLOSED)
6. **Resultado incorrecto (bug actual)**:
   - Se crea Lote C con 15 unidades (suma de A + B)
   - El Lote B queda cerrado también

Para verificar que el Bug 2 está corregido:
1. Llamar `GET /api/batches/expiring-soon`
2. Verificar que cada elemento en el array tiene `productDescription` con un valor no vacío/nulo
