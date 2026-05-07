# Backend Prompt: Vincular Pagos a Proveedor con Compras

## Stack Tecnológico

- **Framework**: Spring Boot 3.x
- **Base de Datos**: MongoDB
- **Java**: 17+
- **IDs**: String (MongoDB ObjectId)

---

## Contexto

Actualmente los pagos a proveedores (`SupplierPayment`, colección `supplier_payments`) quedan "huérfanos" porque se registran antes de recibir la factura de compra. Se requiere un sistema de **adelantos/vinculación** que permita:
1. Registrar pagos anticipados sin compra asociada (ya funciona, endpoint existente).
2. Vincular esos pagos a una `PurchaseInvoice` cuando llegue la compra.
3. Soportar múltiples pagos por compra y pagos parciales.

El frontend Angular ya tiene actualizados los modelos y servicios que consumirán estos endpoints.

---

## Frontend ya implementado (referencia)

### Modelos TypeScript (contratos que el backend debe cumplir)

**`src/app/compras/models/supplier-payment.ts`:**
```typescript
export type PaymentMethod = 'EFECTIVO' | 'TRANSFERENCIA' | 'TARJETA_CREDITO' | 'TARJETA_DEBITO' | 'CHEQUE';
export type SupplierPaymentStatus = 'ADELANTO' | 'VINCULADO' | 'PARCIAL' | 'ANULADO';

export interface SupplierPayment {
  id?: string;
  supplierId: string;
  supplierName?: string;
  paymentDate: string;           // yyyy-MM-dd
  amount: number;
  method: PaymentMethod;
  bankAccountId?: string;
  bankAccountName?: string;
  reference?: string;
  notes?: string;
  supportUrl?: string;
  status?: SupplierPaymentStatus;
  linkedPurchaseId?: string;
  linkedAt?: string;
  linkedBy?: string;
  appliedAmount?: number;
  remainingAmount?: number;
}
```

**`src/app/compras/models/purchase-invoice.ts`:**
```typescript
export type PurchasePaymentStatus = 'PENDIENTE' | 'PARCIAL' | 'PAGADO' | 'SOBREPAGADO';

export interface LinkedPayment {
  paymentId: string;
  appliedAmount: number;
  paymentDate: string;
  method: string;
  reference?: string;
}

export interface PurchaseInvoice {
  id?: string;
  supplier: Supplier;
  invoiceNumber: string;
  emissionDate: string;
  paymentType: PurchasePaymentType;
  items: PurchaseItem[];
  subtotal: number;
  totalVat: number;
  freightRate: number;
  freightCost: number;
  total: number;
  notes?: string;
  supportDocument?: string;
  createdAt?: string;
  paymentStatus?: PurchasePaymentStatus;
  totalPaid?: number;
  linkedPayments?: LinkedPayment[];
}
```

### Servicios Angular (endpoints que el backend debe exponer)

**`SupplierPaymentsService`** — base URL: `/api/supplier-payments`
```typescript
// Ya existentes:
create(payment, file?)         → POST /api/supplier-payments (FormData con metadata + support)
list(params?)                  → GET  /api/supplier-payments?supplierId=&bankAccountId=&from=&to=&status=&unlinkedOnly=
downloadSupport(id)            → GET  /api/supplier-payments/{id}/support

// NUEVOS:
listUnlinked(supplierId)       → GET  /api/supplier-payments/unlinked?supplierId={id}
unlink(paymentId)              → POST /api/supplier-payments/{paymentId}/unlink
```

**`PurchasesService`** — base URL: `/api/purchases/invoices`
```typescript
// Ya existentes:
list(params?)                  → GET  /api/purchases/invoices
getById(id)                    → GET  /api/purchases/invoices/{id}
create(payload)                → POST /api/purchases/invoices
update(id, payload)            → PUT  /api/purchases/invoices/{id}
addItems(id, items)            → POST /api/purchases/invoices/{id}/items

// NUEVOS:
linkPayments(purchaseId, paymentIds)  → POST /api/purchases/invoices/{id}/link-payments
                                        Body: { "paymentIds": ["id-1", "id-2"] }

getLinkedPayments(purchaseId)         → GET  /api/purchases/invoices/{id}/payments
```

### Respuesta esperada de `GET /api/purchases/invoices/{id}/payments`:
```typescript
interface PurchasePaymentDetailResponse {
  purchaseId: string;
  purchaseTotal: number;
  totalPaid: number;
  paymentStatus: string;
  payments: Array<{
    paymentId: string;
    appliedAmount: number;
    paymentDate: string;
    method: string;
    reference?: string;
    bankAccountName?: string;
    originalAmount?: number;
  }>;
}
```

---

## 1. Cambios en Documentos MongoDB

### 1.1 `SupplierPayment` (colección `supplier_payments`)

Agregar los siguientes campos al documento Java existente:

```java
@Document(collection = "supplier_payments")
public class SupplierPayment {
    @Id
    private String id;
    
    // Campos existentes (NO MODIFICAR)
    private String supplierId;
    private String supplierName;
    private String paymentDate;     // yyyy-MM-dd
    private BigDecimal amount;
    private String method;          // EFECTIVO, TRANSFERENCIA, TARJETA_CREDITO, TARJETA_DEBITO, CHEQUE
    private String bankAccountId;
    private String bankAccountName;
    private String reference;
    private String notes;
    private String supportUrl;
    
    // NUEVOS CAMPOS — agregar con defaults
    private String status = "ADELANTO";         // ADELANTO | VINCULADO | PARCIAL | ANULADO
    private String linkedPurchaseId;            // ID de PurchaseInvoice vinculada
    private Instant linkedAt;
    private String linkedBy;
    private BigDecimal appliedAmount;           // Monto ya aplicado (default 0)
    private BigDecimal remainingAmount;         // Monto disponible para vincular (default = amount)
    private Instant createdAt;
    private Instant updatedAt;
}
```

> **Nota**: Usar Strings para `status` en vez de enum en el documento permite flexibilidad en MongoDB. Si se prefiere enum, mapear con Jackson `@JsonProperty`.

### 1.2 `PurchaseInvoice` (colección `purchase_invoices`)

Agregar campos al documento Java existente:

```java
@Document(collection = "purchase_invoices")
public class PurchaseInvoice {
    @Id
    private String id;
    
    // Campos existentes (NO MODIFICAR)
    private Supplier supplier;
    private String invoiceNumber;
    private String emissionDate;        // yyyy-MM-dd
    private String paymentType;         // CONTADO | CREDITO
    private List<PurchaseItem> items;
    private BigDecimal subtotal;
    private BigDecimal totalVat;
    private BigDecimal freightRate;
    private BigDecimal freightCost;
    private BigDecimal total;
    private String notes;
    private String supportDocument;
    private Instant createdAt;
    
    // NUEVOS CAMPOS — agregar con defaults
    private String paymentStatus = "PENDIENTE";    // PENDIENTE | PARCIAL | PAGADO | SOBREPAGADO
    private BigDecimal totalPaid = BigDecimal.ZERO;
    private List<LinkedPayment> linkedPayments = new ArrayList<>();
    private Instant updatedAt;
}
```

**Clase embebida `LinkedPayment`:**
```java
public class LinkedPayment {
    private String paymentId;
    private BigDecimal appliedAmount;
    private String paymentDate;
    private String method;
    private String reference;
}
```

---

## 2. Nuevos Endpoints

### 2.1 `GET /api/supplier-payments/unlinked?supplierId={id}`

Retorna pagos del proveedor con `status` IN (`ADELANTO`, `PARCIAL`) y `remainingAmount > 0`.

**Controller:**
```java
@GetMapping("/unlinked")
public ResponseEntity<List<SupplierPayment>> getUnlinkedPayments(
        @RequestParam String supplierId) {
    return ResponseEntity.ok(supplierPaymentService.findUnlinkedBySupplier(supplierId));
}
```

**Service:**
```java
public List<SupplierPayment> findUnlinkedBySupplier(String supplierId) {
    Query query = new Query();
    query.addCriteria(Criteria.where("supplierId").is(supplierId));
    query.addCriteria(Criteria.where("status").in("ADELANTO", "PARCIAL"));
    query.addCriteria(new Criteria().orOperator(
        Criteria.where("remainingAmount").gt(BigDecimal.ZERO),
        Criteria.where("remainingAmount").exists(false)
    ));
    query.with(Sort.by(Sort.Direction.DESC, "paymentDate"));
    return mongoTemplate.find(query, SupplierPayment.class);
}
```

---

### 2.2 `POST /api/purchases/invoices/{id}/link-payments`

**Request Body:**
```json
{ "paymentIds": ["64abc123...", "64abc456..."] }
```

**Controller:**
```java
@PostMapping("/{id}/link-payments")
public ResponseEntity<Void> linkPayments(
        @PathVariable String id,
        @RequestBody LinkPaymentsRequest request) {
    purchasePaymentService.linkPayments(id, request.getPaymentIds());
    return ResponseEntity.ok().build();
}
```

**Service — lógica principal:**
```java
public void linkPayments(String purchaseId, List<String> paymentIds) {
    PurchaseInvoice purchase = purchaseInvoiceRepository.findById(purchaseId)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Compra no existe: " + purchaseId));

    List<SupplierPayment> payments = supplierPaymentRepository.findAllById(paymentIds);
    
    // 1. Validar proveedor y estado
    for (SupplierPayment p : payments) {
        if (!p.getSupplierId().equals(purchase.getSupplier().getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, 
                "El pago " + p.getId() + " no pertenece al proveedor de esta compra");
        }
        if ("ANULADO".equals(p.getStatus())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, 
                "El pago " + p.getId() + " está anulado");
        }
        if ("VINCULADO".equals(p.getStatus()) && !purchaseId.equals(p.getLinkedPurchaseId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, 
                "El pago " + p.getId() + " ya está vinculado a otra compra");
        }
    }

    // 2. Aplicar cada pago
    BigDecimal purchaseTotal = purchase.getTotal();
    BigDecimal currentPaid = purchase.getTotalPaid() != null ? purchase.getTotalPaid() : BigDecimal.ZERO;
    BigDecimal remainingToPay = purchaseTotal.subtract(currentPaid);
    BigDecimal newPaid = BigDecimal.ZERO;

    List<LinkedPayment> linkedPayments = purchase.getLinkedPayments() != null 
        ? new ArrayList<>(purchase.getLinkedPayments()) 
        : new ArrayList<>();

    for (SupplierPayment payment : payments) {
        BigDecimal available = payment.getRemainingAmount() != null 
            ? payment.getRemainingAmount() 
            : payment.getAmount();

        if (available.compareTo(BigDecimal.ZERO) <= 0) continue;
        
        BigDecimal toApply = available.min(remainingToPay.max(BigDecimal.ZERO));
        if (toApply.compareTo(BigDecimal.ZERO) <= 0) {
            // Si ya se cubrió la compra, aplicar todo el pago restante (SOBREPAGADO es válido)
            toApply = available;
        }

        // Actualizar SupplierPayment
        BigDecimal applied = payment.getAppliedAmount() != null ? payment.getAppliedAmount() : BigDecimal.ZERO;
        payment.setAppliedAmount(applied.add(toApply));
        payment.setRemainingAmount(available.subtract(toApply));
        payment.setLinkedPurchaseId(purchaseId);
        payment.setLinkedAt(Instant.now());
        payment.setStatus(payment.getRemainingAmount().compareTo(BigDecimal.ZERO) == 0 ? "VINCULADO" : "PARCIAL");
        payment.setUpdatedAt(Instant.now());
        supplierPaymentRepository.save(payment);

        // Agregar a linkedPayments embebida
        LinkedPayment link = new LinkedPayment();
        link.setPaymentId(payment.getId());
        link.setAppliedAmount(toApply);
        link.setPaymentDate(payment.getPaymentDate());
        link.setMethod(payment.getMethod());
        link.setReference(payment.getReference());
        linkedPayments.add(link);

        newPaid = newPaid.add(toApply);
        remainingToPay = remainingToPay.subtract(toApply);
    }

    // 3. Actualizar PurchaseInvoice
    BigDecimal updatedTotalPaid = currentPaid.add(newPaid);
    purchase.setTotalPaid(updatedTotalPaid);
    purchase.setPaymentStatus(calculatePaymentStatus(purchaseTotal, updatedTotalPaid));
    purchase.setLinkedPayments(linkedPayments);
    purchase.setUpdatedAt(Instant.now());
    purchaseInvoiceRepository.save(purchase);
}

private String calculatePaymentStatus(BigDecimal total, BigDecimal paid) {
    if (paid == null || paid.compareTo(BigDecimal.ZERO) == 0) return "PENDIENTE";
    BigDecimal diff = total.subtract(paid).abs();
    BigDecimal tolerance = new BigDecimal("1"); // tolerancia de $1
    if (diff.compareTo(tolerance) <= 0) return "PAGADO";
    if (paid.compareTo(total) > 0) return "SOBREPAGADO";
    return "PARCIAL";
}
```

---

### 2.3 `POST /api/supplier-payments/{paymentId}/unlink`

**Controller:**
```java
@PostMapping("/{paymentId}/unlink")
public ResponseEntity<Void> unlinkPayment(@PathVariable String paymentId) {
    purchasePaymentService.unlinkPayment(paymentId);
    return ResponseEntity.ok().build();
}
```

**Service:**
```java
public void unlinkPayment(String paymentId) {
    SupplierPayment payment = supplierPaymentRepository.findById(paymentId)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Pago no existe"));

    if ("ADELANTO".equals(payment.getStatus())) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El pago ya está desvinculado");
    }
    if ("ANULADO".equals(payment.getStatus())) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No se puede desvincular un pago anulado");
    }

    String purchaseId = payment.getLinkedPurchaseId();
    if (purchaseId == null) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El pago no tiene compra vinculada");
    }
    
    PurchaseInvoice purchase = purchaseInvoiceRepository.findById(purchaseId)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Compra vinculada no existe"));

    // 1. Remover de lista embebida
    if (purchase.getLinkedPayments() != null) {
        purchase.getLinkedPayments().removeIf(lp -> paymentId.equals(lp.getPaymentId()));
    }
    
    // 2. Recalcular totalPaid
    BigDecimal sumApplied = purchase.getLinkedPayments() != null 
        ? purchase.getLinkedPayments().stream()
            .map(LinkedPayment::getAppliedAmount)
            .filter(Objects::nonNull)
            .reduce(BigDecimal.ZERO, BigDecimal::add)
        : BigDecimal.ZERO;
        
    purchase.setTotalPaid(sumApplied);
    purchase.setPaymentStatus(calculatePaymentStatus(purchase.getTotal(), sumApplied));
    purchase.setUpdatedAt(Instant.now());
    purchaseInvoiceRepository.save(purchase);

    // 3. Resetear pago
    payment.setStatus("ADELANTO");
    payment.setLinkedPurchaseId(null);
    payment.setLinkedAt(null);
    payment.setLinkedBy(null);
    payment.setAppliedAmount(BigDecimal.ZERO);
    payment.setRemainingAmount(payment.getAmount());
    payment.setUpdatedAt(Instant.now());
    supplierPaymentRepository.save(payment);
}
```

---

### 2.4 `GET /api/purchases/invoices/{id}/payments`

**Controller:**
```java
@GetMapping("/{id}/payments")
public ResponseEntity<PurchasePaymentDetailResponse> getLinkedPayments(@PathVariable String id) {
    return ResponseEntity.ok(purchasePaymentService.getLinkedPayments(id));
}
```

**Service:**
```java
public PurchasePaymentDetailResponse getLinkedPayments(String purchaseId) {
    PurchaseInvoice purchase = purchaseInvoiceRepository.findById(purchaseId)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Compra no existe"));
    
    List<PaymentDetailDto> details = new ArrayList<>();
    if (purchase.getLinkedPayments() != null) {
        for (LinkedPayment lp : purchase.getLinkedPayments()) {
            SupplierPayment sp = supplierPaymentRepository.findById(lp.getPaymentId()).orElse(null);
            PaymentDetailDto dto = new PaymentDetailDto();
            dto.setPaymentId(lp.getPaymentId());
            dto.setAppliedAmount(lp.getAppliedAmount());
            dto.setPaymentDate(lp.getPaymentDate());
            dto.setMethod(lp.getMethod());
            dto.setReference(lp.getReference());
            dto.setBankAccountName(sp != null ? sp.getBankAccountName() : null);
            dto.setOriginalAmount(sp != null ? sp.getAmount() : null);
            details.add(dto);
        }
    }
    
    PurchasePaymentDetailResponse response = new PurchasePaymentDetailResponse();
    response.setPurchaseId(purchaseId);
    response.setPurchaseTotal(purchase.getTotal());
    response.setTotalPaid(purchase.getTotalPaid());
    response.setPaymentStatus(purchase.getPaymentStatus());
    response.setPayments(details);
    return response;
}
```

**DTO:**
```java
public class PurchasePaymentDetailResponse {
    private String purchaseId;
    private BigDecimal purchaseTotal;
    private BigDecimal totalPaid;
    private String paymentStatus;
    private List<PaymentDetailDto> payments;
}

public class PaymentDetailDto {
    private String paymentId;
    private BigDecimal appliedAmount;
    private String paymentDate;
    private String method;
    private String reference;
    private String bankAccountName;
    private BigDecimal originalAmount;
}
```

---

## 3. Cambios en Endpoints EXISTENTES

### 3.1 `POST /api/supplier-payments` (crear pago)

El endpoint existente ya recibe `FormData` con `metadata` (JSON) y opcional `support` (file).

**Cambio requerido**: Al guardar el pago, inicializar los nuevos campos:
```java
// Después de parsear el JSON del metadata:
payment.setStatus("ADELANTO");
payment.setAppliedAmount(BigDecimal.ZERO);
payment.setRemainingAmount(payment.getAmount());
payment.setLinkedPurchaseId(null);
payment.setCreatedAt(Instant.now());
payment.setUpdatedAt(Instant.now());

supplierPaymentRepository.save(payment);
```

### 3.2 `GET /api/supplier-payments` (listado con filtros)

Agregar query params opcionales:
- `status` (String) — filtrar por `ADELANTO`, `VINCULADO`, `PARCIAL`, `ANULADO`
- `unlinkedOnly` (boolean) — alias para `status IN (ADELANTO, PARCIAL)`

**MongoTemplate:**
```java
// Agregar al query existente:
if (status != null && !status.isEmpty()) {
    query.addCriteria(Criteria.where("status").is(status));
}
if (Boolean.TRUE.equals(unlinkedOnly)) {
    query.addCriteria(Criteria.where("status").in("ADELANTO", "PARCIAL"));
}
```

### 3.3 `GET /api/purchases/invoices` y `GET /api/purchases/invoices/{id}`

Los nuevos campos (`paymentStatus`, `totalPaid`, `linkedPayments`) se serializan automáticamente en la respuesta JSON si están en el documento MongoDB. **No se requiere mapper adicional** — solo asegurar que Jackson serializa correctamente (los campos con default `null` o lista vacía se incluyen).

### 3.4 `POST /api/purchases/invoices` (crear compra)

Inicializar al guardar:
```java
invoice.setPaymentStatus("PENDIENTE");
invoice.setTotalPaid(BigDecimal.ZERO);
invoice.setLinkedPayments(new ArrayList<>());
invoice.setCreatedAt(Instant.now());
invoice.setUpdatedAt(Instant.now());
```

---

## 4. Migración de Datos (MongoDB Shell)

Ejecutar en la base de datos para normalizar documentos existentes:

```javascript
// Conectar a la DB (ajustar nombre si difiere)
use concentrados_la_28;

// 1. supplier_payments — inicializar campos de vinculación
// IMPORTANTE: remainingAmount debe ser IGUAL al amount de cada documento
db.supplier_payments.find({ status: { $exists: false } }).forEach(function(doc) {
    db.supplier_payments.updateOne(
        { _id: doc._id },
        { 
            $set: {
                status: "ADELANTO",
                appliedAmount: NumberDecimal("0"),
                remainingAmount: doc.amount,
                linkedPurchaseId: null,
                linkedAt: null,
                linkedBy: null,
                createdAt: doc.createdAt || new Date(),
                updatedAt: new Date()
            }
        }
    );
});

// 2. purchase_invoices — inicializar campos de pago
db.purchase_invoices.updateMany(
    { paymentStatus: { $exists: false } },
    { 
        $set: { 
            paymentStatus: "PENDIENTE",
            totalPaid: NumberDecimal("0"),
            linkedPayments: [],
            updatedAt: new Date()
        }
    }
);

print("Migración completada.");
print("supplier_payments actualizados: " + db.supplier_payments.countDocuments({ status: "ADELANTO" }));
print("purchase_invoices actualizados: " + db.purchase_invoices.countDocuments({ paymentStatus: "PENDIENTE" }));
```

---

## 5. Índices MongoDB

```javascript
db.supplier_payments.createIndex({ "supplierId": 1, "status": 1, "paymentDate": -1 });
db.supplier_payments.createIndex({ "linkedPurchaseId": 1 });
db.purchase_invoices.createIndex({ "supplier.id": 1, "paymentStatus": 1 });
db.purchase_invoices.createIndex({ "linkedPayments.paymentId": 1 });
```

---

## 6. Validaciones de Negocio

| Regla | HTTP Status | Mensaje |
|-------|-------------|---------|
| Pago de proveedor A no se vincula a compra de proveedor B | 400 | `El pago {id} no pertenece al proveedor de esta compra` |
| Pago ANULADO no se puede vincular | 400 | `El pago {id} está anulado` |
| Pago VINCULADO a otra compra | 409 | `El pago {id} ya está vinculado a otra compra` |
| Desvincular pago ya ADELANTO | 400 | `El pago ya está desvinculado` |
| Total aplicado > total compra | 200 | Se permite, `paymentStatus = SOBREPAGADO` |

---

## 7. Estructura de paquetes sugerida

```
com.concentrados.la28.purchase/
├── controller/
│   ├── PurchaseInvoiceController.java    (agregar endpoint link-payments y payments)
│   └── SupplierPaymentController.java    (agregar endpoint unlinked y unlink)
├── service/
│   ├── PurchasePaymentService.java       (NUEVO — lógica de link/unlink)
│   └── SupplierPaymentService.java       (modificar para setear defaults)
├── model/
│   ├── PurchaseInvoice.java              (agregar campos)
│   ├── SupplierPayment.java              (agregar campos)
│   └── LinkedPayment.java                (NUEVO — clase embebida)
├── dto/
│   ├── LinkPaymentsRequest.java          (NUEVO)
│   ├── PurchasePaymentDetailResponse.java (NUEVO)
│   └── PaymentDetailDto.java             (NUEVO)
└── repository/
    ├── PurchaseInvoiceRepository.java
    └── SupplierPaymentRepository.java
```

---

## 8. Checklist de Implementación

- [ ] Agregar campos a `SupplierPayment.java`: `status`, `linkedPurchaseId`, `linkedAt`, `linkedBy`, `appliedAmount`, `remainingAmount`, `createdAt`, `updatedAt`
- [ ] Agregar campos a `PurchaseInvoice.java`: `paymentStatus`, `totalPaid`, `linkedPayments`, `updatedAt`
- [ ] Crear `LinkedPayment.java` (clase embebida)
- [ ] Crear `LinkPaymentsRequest.java`, `PurchasePaymentDetailResponse.java`, `PaymentDetailDto.java`
- [ ] Crear `PurchasePaymentService.java` con métodos `linkPayments()`, `unlinkPayment()`, `getLinkedPayments()`, `calculatePaymentStatus()`
- [ ] Nuevo endpoint `GET /api/supplier-payments/unlinked?supplierId=`
- [ ] Nuevo endpoint `POST /api/purchases/invoices/{id}/link-payments`
- [ ] Nuevo endpoint `POST /api/supplier-payments/{id}/unlink`
- [ ] Nuevo endpoint `GET /api/purchases/invoices/{id}/payments`
- [ ] Modificar `POST /api/supplier-payments` para setear defaults (`status=ADELANTO`, `remainingAmount=amount`)
- [ ] Modificar `POST /api/purchases/invoices` para inicializar `paymentStatus=PENDIENTE`, `totalPaid=0`, `linkedPayments=[]`
- [ ] Agregar query params `status` y `unlinkedOnly` a `GET /api/supplier-payments`
- [ ] Ejecutar script de migración MongoDB
- [ ] Crear índices MongoDB
- [ ] Tests: vincular, desvincular, pagos parciales, proveedor incorrecto, sobrepago
