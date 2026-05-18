# Backend Prompt: Endpoints para Reporte de Flujo de Caja

## Stack Tecnológico

- **Framework**: Spring Boot 3.x
- **Base de Datos**: MongoDB
- **Java**: 17+
- **IDs**: String (MongoDB ObjectId)

---

## Contexto

El reporte de Flujo de Caja del frontend necesita **dos endpoints globales** (no por cliente) que permitan obtener todos los pagos de cuentas por cobrar y todas las transacciones de anticipos en un rango de fechas. Actualmente solo existen endpoints por cliente.

El frontend ya tiene los servicios Angular implementados esperando estos endpoints.

---

## Frontend ya implementado (referencia)

### Servicios Angular (endpoints que el backend debe exponer)

**`ClientAccountService`** — base URL: `/api/client-accounts`
```typescript
// YA EXISTEN:
getByClientId(clientId)        → GET  /api/client-accounts/client/{clientId}
getAllWithBalance()            → GET  /api/client-accounts/with-balance
registerPayment(payment)         → POST /api/client-accounts/payments
getPaymentHistory(accountId)   → GET  /api/client-accounts/{accountId}/payments
getPaymentHistoryByClientId(c) → GET  /api/client-accounts/client/{clientId}/payments
getAccountsReport(filter)        → POST /api/client-accounts/report

// NUEVO — necesario para flujo de caja:
listAllPayments({ fromDate, toDate }) → GET  /api/client-accounts/payments?fromDate=yyyy-MM-dd&toDate=yyyy-MM-dd
```

**`ClientCreditService`** — base URL: `/api/client-credits`
```typescript
// YA EXISTEN:
getByClientId(clientId)        → GET  /api/client-credits/client/{clientId}
getClientCreditBalance(c)      → GET  /api/client-credits/client/{clientId}/balance
registerDeposit(req)           → POST /api/client-credits/deposit
useCredit(req)                 → POST /api/client-credits/use
getTransactionHistory(c)       → GET  /api/client-credits/client/{clientId}/transactions
getCreditsReport(filter)       → POST /api/client-credits/report

// NUEVO — necesario para flujo de caja:
listAllTransactions({ fromDate, toDate, type }) → GET  /api/client-credits/transactions?fromDate=&toDate=&type=
```

### Modelos TypeScript (contratos que el backend debe cumplir)

**`src/app/cuenta-cliente/models/client-account.ts`:**
```typescript
export class AccountPayment {
    id: string = '';
    clientAccountId: string = '';
    amount: number = 0;
    paymentMethod: PaymentMethod = PaymentMethod.EFECTIVO;
    bankAccountId?: string;
    bankAccountName?: string;
    reference?: string;
    notes?: string;
    paymentDate: string = '';      // yyyy-MM-dd'T'HH:mm:ss (ISO 8601)
    createdBy: string = '';
    createdAt: string = '';
}

export enum PaymentMethod {
    EFECTIVO = 'EFECTIVO',
    TRANSFERENCIA = 'TRANSFERENCIA',
    TARJETA_DEBITO = 'TARJETA_DEBITO',
    TARJETA_CREDITO = 'TARJETA_CREDITO',
    CHEQUE = 'CHEQUE',
    SALDO_FAVOR = 'SALDO_FAVOR',
    OTRO = 'OTRO'
}
```

**`src/app/cuenta-cliente/models/client-credit.ts`:**
```typescript
export class CreditTransaction {
    id: string = '';
    clientCreditId: string = '';
    type: CreditTransactionType = CreditTransactionType.DEPOSIT;
    amount: number = 0;
    balanceAfter: number = 0;
    paymentMethod?: PaymentMethodCredit;
    bankAccountId?: string;
    bankAccountName?: string;
    reference?: string;
    billingId?: string;
    notes?: string;
    transactionDate: string = '';   // yyyy-MM-dd'T'HH:mm:ss (ISO 8601)
    createdBy: string = '';
    createdAt: string = '';
}

export enum CreditTransactionType {
    DEPOSIT = 'DEPOSIT',
    CONSUMPTION = 'CONSUMPTION',
    REFUND = 'REFUND',
    ADJUSTMENT = 'ADJUSTMENT'
}

export enum PaymentMethodCredit {
    EFECTIVO = 'EFECTIVO',
    TRANSFERENCIA = 'TRANSFERENCIA',
    TARJETA_DEBITO = 'TARJETA_DEBITO',
    TARJETA_CREDITO = 'TARJETA_CREDITO',
    CHEQUE = 'CHEQUE',
    OTRO = 'OTRO'
}
```

---

## 1. Cambios en Documentos MongoDB

No se requieren cambios en la estructura de los documentos. Los endpoints nuevos leen de las colecciones existentes.

- **Colección fuente para pagos**: `client_accounts` (campo embebido `payments`) o colección separada si los pagos se guardan aparte.
- **Colección fuente para transacciones**: `client_credits` (campo embebido `transactions`) o colección separada.

> **Nota importante**: Verificar si `payments` y `transactions` están embebidos dentro de `client_accounts` / `client_credits` o son colecciones separadas. El endpoint debe funcionar en cualquier caso (usar `$unwind` + `$match` si están embebidos, o query directa si son colecciones separadas).

---

## 2. Nuevos Endpoints

### 2.1 `GET /api/client-accounts/payments?fromDate=yyyy-MM-dd&toDate=yyyy-MM-dd`

Retorna **todos los pagos** registrados en el rango de fechas, sin importar el cliente. Ordenados por `paymentDate` DESC.

**Query params:**
- `fromDate` (String, opcional): fecha inicial inclusive, formato `yyyy-MM-dd`
- `toDate` (String, opcional): fecha final inclusive, formato `yyyy-MM-dd`

**Controller:**
```java
@GetMapping("/payments")
public ResponseEntity<List<AccountPaymentDto>> listAllPayments(
        @RequestParam(required = false) String fromDate,
        @RequestParam(required = false) String toDate) {
    return ResponseEntity.ok(clientAccountService.findAllPayments(fromDate, toDate));
}
```

**Opción A — Si payments son colección embebida en `client_accounts`:**
```java
public List<AccountPaymentDto> findAllPayments(String fromDate, String toDate) {
    // Construir rango de fechas en Instant
    Instant start = fromDate != null 
        ? LocalDate.parse(fromDate).atStartOfDay(ZoneId.of("America/Bogota")).toInstant()
        : Instant.MIN;
    Instant end = toDate != null
        ? LocalDate.parse(toDate).atTime(LocalTime.MAX).atZone(ZoneId.of("America/Bogota")).toInstant()
        : Instant.now();

    Aggregation agg = Aggregation.newAggregation(
        Aggregation.match(Criteria.where("payments").exists(true)),
        Aggregation.unwind("payments"),
        Aggregation.match(Criteria.where("payments.paymentDate")
            .gte(start.toString())
            .lte(end.toString())),
        Aggregation.sort(Sort.Direction.DESC, "payments.paymentDate")
    );

    AggregationResults<Document> results = mongoTemplate.aggregate(
        agg, "client_accounts", Document.class);

    return results.getMappedResults().stream()
        .map(doc -> {
            Document paymentDoc = (Document) doc.get("payments");
            AccountPaymentDto dto = new AccountPaymentDto();
            dto.setId(paymentDoc.getString("id"));
            dto.setClientAccountId(doc.getString("_id"));
            dto.setAmount(toBigDecimal(paymentDoc.get("amount")));
            dto.setPaymentMethod(paymentDoc.getString("paymentMethod"));
            dto.setBankAccountId(paymentDoc.getString("bankAccountId"));
            dto.setBankAccountName(paymentDoc.getString("bankAccountName"));
            dto.setReference(paymentDoc.getString("reference"));
            dto.setNotes(paymentDoc.getString("notes"));
            dto.setPaymentDate(paymentDoc.getString("paymentDate"));
            dto.setCreatedBy(paymentDoc.getString("createdBy"));
            dto.setCreatedAt(paymentDoc.getString("createdAt"));
            return dto;
        })
        .collect(Collectors.toList());
}
```

**Opción B — Si payments son colección independiente `account_payments`:**
```java
public List<AccountPaymentDto> findAllPayments(String fromDate, String toDate) {
    Query query = new Query();
    
    if (fromDate != null || toDate != null) {
        Criteria dateCriteria = Criteria.where("paymentDate");
        if (fromDate != null) dateCriteria.gte(fromDate + "T00:00:00");
        if (toDate != null) dateCriteria.lte(toDate + "T23:59:59");
        query.addCriteria(dateCriteria);
    }
    
    query.with(Sort.by(Sort.Direction.DESC, "paymentDate"));
    
    return mongoTemplate.find(query, AccountPayment.class, "account_payments")
        .stream()
        .map(this::mapToDto)
        .collect(Collectors.toList());
}
```

**Response esperado (JSON):**
```json
[
  {
    "id": "64abc123...",
    "clientAccountId": "64xyz789...",
    "amount": 500000,
    "paymentMethod": "EFECTIVO",
    "bankAccountId": null,
    "bankAccountName": null,
    "reference": "PAGO-001",
    "notes": "Abono a cuenta",
    "paymentDate": "2026-05-10T14:30:00-05:00",
    "createdBy": "admin",
    "createdAt": "2026-05-10T14:30:00-05:00"
  }
]
```

> **Importante**: El frontend filtra `SALDO_FAVOR` del lado del cliente. El backend debe devolver **todos** los pagos (incluyendo `SALDO_FAVOR`) para mantener consistencia.

---

### 2.2 `GET /api/client-credits/transactions?fromDate=yyyy-MM-dd&toDate=yyyy-MM-dd&type={DEPOSIT|CONSUMPTION|REFUND|ADJUSTMENT}`

Retorna **todas las transacciones de crédito/anticipo** en el rango de fechas. Opcionalmente filtrar por tipo.

**Query params:**
- `fromDate` (String, opcional): fecha inicial inclusive, formato `yyyy-MM-dd`
- `toDate` (String, opcional): fecha final inclusive, formato `yyyy-MM-dd`
- `type` (String, opcional): `DEPOSIT`, `CONSUMPTION`, `REFUND`, `ADJUSTMENT`

**Controller:**
```java
@GetMapping("/transactions")
public ResponseEntity<List<CreditTransactionDto>> listAllTransactions(
        @RequestParam(required = false) String fromDate,
        @RequestParam(required = false) String toDate,
        @RequestParam(required = false) String type) {
    return ResponseEntity.ok(clientCreditService.findAllTransactions(fromDate, toDate, type));
}
```

**Opción A — Si transactions están embebidas en `client_credits`:**
```java
public List<CreditTransactionDto> findAllTransactions(String fromDate, String toDate, String type) {
    Criteria unwindCriteria = new Criteria();
    
    if (fromDate != null || toDate != null) {
        Criteria dateCriteria = Criteria.where("transactions.transactionDate");
        if (fromDate != null) dateCriteria.gte(fromDate + "T00:00:00");
        if (toDate != null) dateCriteria.lte(toDate + "T23:59:59");
        unwindCriteria.andOperator(dateCriteria);
    }
    if (type != null && !type.isEmpty()) {
        unwindCriteria.and("transactions.type").is(type);
    }

    Aggregation agg = Aggregation.newAggregation(
        Aggregation.match(Criteria.where("transactions").exists(true)),
        Aggregation.unwind("transactions"),
        Aggregation.match(unwindCriteria),
        Aggregation.sort(Sort.Direction.DESC, "transactions.transactionDate")
    );

    AggregationResults<Document> results = mongoTemplate.aggregate(
        agg, "client_credits", Document.class);

    return results.getMappedResults().stream()
        .map(doc -> {
            Document txDoc = (Document) doc.get("transactions");
            CreditTransactionDto dto = new CreditTransactionDto();
            dto.setId(txDoc.getString("id"));
            dto.setClientCreditId(doc.getString("_id"));
            dto.setType(txDoc.getString("type"));
            dto.setAmount(toBigDecimal(txDoc.get("amount")));
            dto.setBalanceAfter(toBigDecimal(txDoc.get("balanceAfter")));
            dto.setPaymentMethod(txDoc.getString("paymentMethod"));
            dto.setBankAccountId(txDoc.getString("bankAccountId"));
            dto.setBankAccountName(txDoc.getString("bankAccountName"));
            dto.setReference(txDoc.getString("reference"));
            dto.setBillingId(txDoc.getString("billingId"));
            dto.setNotes(txDoc.getString("notes"));
            dto.setTransactionDate(txDoc.getString("transactionDate"));
            dto.setCreatedBy(txDoc.getString("createdBy"));
            dto.setCreatedAt(txDoc.getString("createdAt"));
            return dto;
        })
        .collect(Collectors.toList());
}
```

**Opción B — Si transactions son colección independiente `credit_transactions`:**
```java
public List<CreditTransactionDto> findAllTransactions(String fromDate, String toDate, String type) {
    Query query = new Query();
    
    if (fromDate != null || toDate != null) {
        Criteria dateCriteria = Criteria.where("transactionDate");
        if (fromDate != null) dateCriteria.gte(fromDate + "T00:00:00");
        if (toDate != null) dateCriteria.lte(toDate + "T23:59:59");
        query.addCriteria(dateCriteria);
    }
    if (type != null && !type.isEmpty()) {
        query.addCriteria(Criteria.where("type").is(type));
    }
    
    query.with(Sort.by(Sort.Direction.DESC, "transactionDate"));
    
    return mongoTemplate.find(query, CreditTransaction.class, "credit_transactions")
        .stream()
        .map(this::mapToDto)
        .collect(Collectors.toList());
}
```

**Response esperado (JSON):**
```json
[
  {
    "id": "64def456...",
    "clientCreditId": "64ghi012...",
    "type": "DEPOSIT",
    "amount": 200000,
    "balanceAfter": 200000,
    "paymentMethod": "TRANSFERENCIA",
    "bankAccountId": "bank-123",
    "bankAccountName": "Bancolombia Ahorros",
    "reference": "TRANS-001",
    "billingId": null,
    "notes": "Anticipo cliente Juan Pérez",
    "transactionDate": "2026-05-12T10:00:00-05:00",
    "createdBy": "admin",
    "createdAt": "2026-05-12T10:00:00-05:00"
  }
]
```

---

## 3. DTOs Java

```java
// AccountPaymentDto.java
public class AccountPaymentDto {
    private String id;
    private String clientAccountId;
    private BigDecimal amount;
    private String paymentMethod;
    private String bankAccountId;
    private String bankAccountName;
    private String reference;
    private String notes;
    private String paymentDate;     // ISO 8601 string
    private String createdBy;
    private String createdAt;
    // getters y setters
}

// CreditTransactionDto.java
public class CreditTransactionDto {
    private String id;
    private String clientCreditId;
    private String type;            // DEPOSIT, CONSUMPTION, REFUND, ADJUSTMENT
    private BigDecimal amount;
    private BigDecimal balanceAfter;
    private String paymentMethod;
    private String bankAccountId;
    private String bankAccountName;
    private String reference;
    private String billingId;
    private String notes;
    private String transactionDate; // ISO 8601 string
    private String createdBy;
    private String createdAt;
    // getters y setters
}
```

---

## 4. Consideraciones Importantes

### 4.1 Zona Horaria

Las fechas `fromDate` y `toDate` vienen en formato `yyyy-MM-dd` sin zona horaria. El backend debe interpretarlas en la zona `America/Bogota`:
- `fromDate` → inicio del día en Bogotá (`00:00:00-05:00`)
- `toDate` → fin del día en Bogotá (`23:59:59-05:00`)

### 4.2 Permisos / Seguridad

Ambos endpoints deben estar protegidos por autenticación (JWT) como el resto de la API. No requieren roles especiales — cualquier usuario autenticado puede consultar reportes.

Si actualmente devuelven 401, verificar:
1. Que el endpoint esté dentro del `SecurityFilterChain` permitido para `USER`/`ADMIN`.
2. Que el token JWT se envíe en el header `Authorization` (el frontend ya lo hace para todos los demás endpoints).

### 4.3 Performance

Si las colecciones son grandes, considerar índices:

```javascript
// Si payments están embebidos en client_accounts
db.client_accounts.createIndex({ "payments.paymentDate": 1 });
db.client_accounts.createIndex({ "payments.paymentMethod": 1 });

// Si payments son colección independiente
db.account_payments.createIndex({ "paymentDate": -1 });
db.account_payments.createIndex({ "paymentMethod": 1 });

// Si transactions están embebidos en client_credits
db.client_credits.createIndex({ "transactions.transactionDate": 1 });
db.client_credits.createIndex({ "transactions.type": 1 });

// Si transactions son colección independiente
db.credit_transactions.createIndex({ "transactionDate": -1 });
db.credit_transactions.createIndex({ "type": 1 });
```

---

## 5. Estructura de paquetes sugerida

```
com.concentrados.la28.client/
├── controller/
│   ├── ClientAccountController.java    (agregar GET /payments)
│   └── ClientCreditController.java     (agregar GET /transactions)
├── service/
│   ├── ClientAccountService.java       (agregar findAllPayments)
│   └── ClientCreditService.java        (agregar findAllTransactions)
├── dto/
│   ├── AccountPaymentDto.java          (NUEVO)
│   └── CreditTransactionDto.java       (NUEVO)
└── repository/
    ├── ClientAccountRepository.java
    └── ClientCreditRepository.java
```

---

## 6. Checklist de Implementación

- [ ] Crear `AccountPaymentDto.java`
- [ ] Crear `CreditTransactionDto.java`
- [ ] Implementar `GET /api/client-accounts/payments?fromDate=&toDate=`
- [ ] Implementar `GET /api/client-credits/transactions?fromDate=&toDate=&type=`
- [ ] Ambos endpoints ordenan por fecha DESC
- [ ] Ambos endpoints soportan fechas sin zona horaria interpretadas en `America/Bogota`
- [ ] Ambos endpoints están protegidos por JWT (no devuelven 401 a usuarios autenticados)
- [ ] Crear índices MongoDB para `paymentDate` y `transactionDate`
- [ ] Test: llamar con rango de fechas y verificar que retorna datos correctos
- [ ] Test: llamar sin filtros y verificar que retorna todos los registros ordenados
- [ ] Test: verificar que `type=DEPOSIT` en credit transactions filtra correctamente
