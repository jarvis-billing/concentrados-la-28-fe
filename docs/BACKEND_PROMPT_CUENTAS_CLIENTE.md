# Prompt para Implementación de Backend - Cuentas por Cobrar y Anticipos

## Stack Tecnológico

- **Java 17+**
- **Spring Boot 3.x**
- **MongoDB** (Spring Data MongoDB)
- **Lombok** para reducir boilerplate

---

## Contexto del Negocio

Se requiere implementar dos módulos en el backend:

1. **Cuentas por Cobrar**: Para gestionar las ventas a crédito de clientes y registrar los pagos que realizan a su cuenta general (no por factura específica).

2. **Anticipos/Saldos a Favor**: Para gestionar los pagos adelantados que hacen los clientes, los cuales pueden usar en futuras compras.

---

## Módulo 1: Cuentas por Cobrar (Client Accounts)

### Documentos MongoDB

#### ClientAccount
```java
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.DBRef;
import org.springframework.data.mongodb.core.index.Indexed;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "client_accounts")
public class ClientAccount {
    
    @Id
    private String id;
    
    @Indexed(unique = true)
    private String clientId;  // Referencia al cliente
    
    @DBRef
    private Client client;
    
    private BigDecimal totalDebt = BigDecimal.ZERO;      // Deuda total acumulada
    private BigDecimal totalPaid = BigDecimal.ZERO;      // Total pagado
    private BigDecimal currentBalance = BigDecimal.ZERO; // Saldo pendiente (totalDebt - totalPaid)
    
    private LocalDateTime lastPaymentDate;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    
    // Embebemos los pagos como subdocumentos para mejor rendimiento
    private List<AccountPayment> payments = new ArrayList<>();
}
```

#### AccountPayment (Subdocumento embebido)
```java
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class AccountPayment {
    
    private String id;  // Generado con UUID.randomUUID().toString()
    private BigDecimal amount;
    private PaymentMethod paymentMethod;
    private String reference;  // Referencia de transferencia, cheque, etc.
    private String notes;
    private LocalDateTime paymentDate;
    private String createdBy;
    private LocalDateTime createdAt;
}

public enum PaymentMethod {
    EFECTIVO, TRANSFERENCIA, TARJETA_DEBITO, TARJETA_CREDITO, CHEQUE, OTRO
}
```

### Endpoints Requeridos

#### Base URL: `/api/client-accounts`

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/client/{clientId}` | Obtener cuenta de un cliente |
| GET | `/client/{clientId}/balance` | Obtener solo el saldo pendiente |
| GET | `/client/{clientId}/payments` | Historial de pagos del cliente |
| GET | `/client/{clientId}/credit-billings` | Facturas a crédito del cliente |
| GET | `/with-balance` | Todas las cuentas con saldo pendiente |
| POST | `/payments` | Registrar un pago a la cuenta |
| POST | `/report` | Generar reporte de cuentas por cobrar |

### Lógica de Negocio

1. **Cuando se crea una venta a CRÉDITO**:
   - Buscar o crear `ClientAccount` para el cliente
   - Sumar el total de la factura a `totalDebt`
   - Actualizar `currentBalance = totalDebt - totalPaid`

2. **Cuando se registra un pago**:
   - Validar que el monto no exceda el `currentBalance`
   - Crear registro en `AccountPayment`
   - Sumar a `totalPaid`
   - Actualizar `currentBalance = totalDebt - totalPaid`
   - Actualizar `lastPaymentDate`

### DTOs

```java
// Request para registrar pago
public class RegisterPaymentRequest {
    private String clientId;  // O clientAccountId
    private BigDecimal amount;
    private PaymentMethod paymentMethod;
    private String reference;
    private String notes;
}

// Filtro para reportes
public class AccountReportFilter {
    private String clientId;
    private LocalDate fromDate;
    private LocalDate toDate;
    private Boolean onlyWithBalance;
}

// Resumen para reportes
public class AccountSummary {
    private String clientId;
    private String clientName;
    private String clientIdNumber;
    private BigDecimal totalDebt;
    private BigDecimal totalPaid;
    private BigDecimal currentBalance;
    private LocalDateTime lastPaymentDate;
    private Long daysSinceLastPayment;
}
```

---

## Módulo 2: Anticipos / Saldos a Favor (Client Credits)

### Documentos MongoDB

#### ClientCredit
```java
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.DBRef;
import org.springframework.data.mongodb.core.index.Indexed;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "client_credits")
public class ClientCredit {
    
    @Id
    private String id;
    
    @Indexed(unique = true)
    private String clientId;  // Referencia al cliente
    
    @DBRef
    private Client client;
    
    private BigDecimal currentBalance = BigDecimal.ZERO;   // Saldo a favor actual
    private BigDecimal totalDeposited = BigDecimal.ZERO;   // Total depositado históricamente
    private BigDecimal totalUsed = BigDecimal.ZERO;        // Total usado en compras
    
    private LocalDateTime lastTransactionDate;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    
    // Embebemos las transacciones como subdocumentos
    private List<CreditTransaction> transactions = new ArrayList<>();
}
```

#### CreditTransaction (Subdocumento embebido)
```java
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class CreditTransaction {
    
    private String id;  // Generado con UUID.randomUUID().toString()
    private CreditTransactionType type;
    private BigDecimal amount;
    private BigDecimal balanceAfter;  // Saldo después de la transacción
    private PaymentMethod paymentMethod;  // Solo para DEPOSIT
    private String reference;  // Referencia de pago o número de factura
    private String billingId;  // ID de factura si es CONSUMPTION
    private String notes;
    private LocalDateTime transactionDate;
    private String createdBy;
    private LocalDateTime createdAt;
}

public enum CreditTransactionType {
    DEPOSIT,      // Anticipo/depósito
    CONSUMPTION,  // Uso en factura
    REFUND,       // Devolución al cliente
    ADJUSTMENT    // Ajuste manual
}
```

### Endpoints Requeridos

#### Base URL: `/api/client-credits`

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/client/{clientId}` | Obtener crédito de un cliente |
| GET | `/client/{clientId}/balance` | Obtener solo el saldo a favor |
| GET | `/client/{clientId}/transactions` | Historial de transacciones |
| GET | `/with-balance` | Todos los clientes con saldo a favor |
| POST | `/deposit` | Registrar un anticipo |
| POST | `/use` | Usar saldo en una factura |
| POST | `/adjust` | Ajuste manual de saldo |
| POST | `/report` | Generar reporte de anticipos |

### Lógica de Negocio

1. **Cuando se registra un anticipo (DEPOSIT)**:
   - Buscar o crear `ClientCredit` para el cliente
   - Sumar el monto a `totalDeposited`
   - Actualizar `currentBalance = totalDeposited - totalUsed`
   - Crear registro en `CreditTransaction` con tipo DEPOSIT
   - Guardar `balanceAfter` con el nuevo saldo

2. **Cuando se usa saldo en una factura (CONSUMPTION)**:
   - Validar que el monto no exceda el `currentBalance`
   - Sumar a `totalUsed`
   - Actualizar `currentBalance = totalDeposited - totalUsed`
   - Crear registro en `CreditTransaction` con tipo CONSUMPTION
   - Guardar `billingId` de la factura asociada

3. **Integración con facturación**:
   - Al guardar una factura, si hay `creditToApply > 0`:
     - Llamar al servicio de créditos para registrar el consumo
     - Reducir el total a pagar de la factura
     - Registrar en los métodos de pago que se usó "SALDO_A_FAVOR"

### DTOs

```java
// Request para registrar anticipo
public class DepositCreditRequest {
    private String clientId;
    private BigDecimal amount;
    private PaymentMethod paymentMethod;
    private String reference;
    private String notes;
}

// Request para usar saldo
public class UseCreditRequest {
    private String clientId;
    private BigDecimal amount;
    private String billingId;
    private String notes;
}

// Filtro para reportes
public class CreditReportFilter {
    private String clientId;
    private LocalDate fromDate;
    private LocalDate toDate;
    private CreditTransactionType transactionType;
    private Boolean onlyWithBalance;
}

// Resumen para reportes
public class CreditSummary {
    private String clientId;
    private String clientName;
    private String clientIdNumber;
    private BigDecimal currentBalance;
    private BigDecimal totalDeposited;
    private BigDecimal totalUsed;
    private LocalDateTime lastTransactionDate;
}
```

---

## Servicios de Ejemplo

### ClientAccountService
```java
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import lombok.RequiredArgsConstructor;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ClientAccountService {
    
    private final ClientAccountRepository clientAccountRepository;
    private final ClientRepository clientRepository;
    
    public ClientAccount getByClientId(String clientId) {
        return clientAccountRepository.findByClientId(clientId)
            .orElse(null);
    }
    
    public BigDecimal getClientBalance(String clientId) {
        return clientAccountRepository.findByClientId(clientId)
            .map(ClientAccount::getCurrentBalance)
            .orElse(BigDecimal.ZERO);
    }
    
    public List<ClientAccount> getAllWithBalance() {
        return clientAccountRepository.findAllWithBalance();
    }
    
    @Transactional
    public void addDebt(String clientId, BigDecimal amount) {
        ClientAccount account = clientAccountRepository.findByClientId(clientId)
            .orElseGet(() -> createNewAccount(clientId));
        
        account.setTotalDebt(account.getTotalDebt().add(amount));
        account.setCurrentBalance(account.getTotalDebt().subtract(account.getTotalPaid()));
        account.setUpdatedAt(LocalDateTime.now());
        
        clientAccountRepository.save(account);
    }
    
    @Transactional
    public AccountPayment registerPayment(RegisterPaymentRequest request, String createdBy) {
        ClientAccount account = clientAccountRepository.findByClientId(request.getClientId())
            .orElseThrow(() -> new RuntimeException("Cuenta no encontrada para el cliente"));
        
        if (request.getAmount().compareTo(account.getCurrentBalance()) > 0) {
            throw new RuntimeException("El monto del pago excede el saldo pendiente");
        }
        
        AccountPayment payment = new AccountPayment();
        payment.setId(UUID.randomUUID().toString());
        payment.setAmount(request.getAmount());
        payment.setPaymentMethod(request.getPaymentMethod());
        payment.setReference(request.getReference());
        payment.setNotes(request.getNotes());
        payment.setPaymentDate(LocalDateTime.now());
        payment.setCreatedBy(createdBy);
        payment.setCreatedAt(LocalDateTime.now());
        
        account.getPayments().add(payment);
        account.setTotalPaid(account.getTotalPaid().add(request.getAmount()));
        account.setCurrentBalance(account.getTotalDebt().subtract(account.getTotalPaid()));
        account.setLastPaymentDate(LocalDateTime.now());
        account.setUpdatedAt(LocalDateTime.now());
        
        clientAccountRepository.save(account);
        return payment;
    }
    
    private ClientAccount createNewAccount(String clientId) {
        Client client = clientRepository.findById(clientId)
            .orElseThrow(() -> new RuntimeException("Cliente no encontrado"));
        
        ClientAccount account = new ClientAccount();
        account.setClientId(clientId);
        account.setClient(client);
        account.setCreatedAt(LocalDateTime.now());
        account.setUpdatedAt(LocalDateTime.now());
        return account;
    }
}
```

### ClientCreditService
```java
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import lombok.RequiredArgsConstructor;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ClientCreditService {
    
    private final ClientCreditRepository clientCreditRepository;
    private final ClientRepository clientRepository;
    
    public ClientCredit getByClientId(String clientId) {
        return clientCreditRepository.findByClientId(clientId)
            .orElse(null);
    }
    
    public BigDecimal getClientCreditBalance(String clientId) {
        return clientCreditRepository.findByClientId(clientId)
            .map(ClientCredit::getCurrentBalance)
            .orElse(BigDecimal.ZERO);
    }
    
    public List<ClientCredit> getAllWithBalance() {
        return clientCreditRepository.findAllWithBalance();
    }
    
    @Transactional
    public CreditTransaction registerDeposit(DepositCreditRequest request, String createdBy) {
        ClientCredit credit = clientCreditRepository.findByClientId(request.getClientId())
            .orElseGet(() -> createNewCredit(request.getClientId()));
        
        BigDecimal newBalance = credit.getCurrentBalance().add(request.getAmount());
        
        CreditTransaction transaction = new CreditTransaction();
        transaction.setId(UUID.randomUUID().toString());
        transaction.setType(CreditTransactionType.DEPOSIT);
        transaction.setAmount(request.getAmount());
        transaction.setBalanceAfter(newBalance);
        transaction.setPaymentMethod(request.getPaymentMethod());
        transaction.setReference(request.getReference());
        transaction.setNotes(request.getNotes());
        transaction.setTransactionDate(LocalDateTime.now());
        transaction.setCreatedBy(createdBy);
        transaction.setCreatedAt(LocalDateTime.now());
        
        credit.getTransactions().add(transaction);
        credit.setTotalDeposited(credit.getTotalDeposited().add(request.getAmount()));
        credit.setCurrentBalance(newBalance);
        credit.setLastTransactionDate(LocalDateTime.now());
        credit.setUpdatedAt(LocalDateTime.now());
        
        clientCreditRepository.save(credit);
        return transaction;
    }
    
    @Transactional
    public CreditTransaction useCredit(UseCreditRequest request, String createdBy) {
        ClientCredit credit = clientCreditRepository.findByClientId(request.getClientId())
            .orElseThrow(() -> new RuntimeException("El cliente no tiene saldo a favor"));
        
        if (request.getAmount().compareTo(credit.getCurrentBalance()) > 0) {
            throw new RuntimeException("El monto excede el saldo a favor disponible");
        }
        
        BigDecimal newBalance = credit.getCurrentBalance().subtract(request.getAmount());
        
        CreditTransaction transaction = new CreditTransaction();
        transaction.setId(UUID.randomUUID().toString());
        transaction.setType(CreditTransactionType.CONSUMPTION);
        transaction.setAmount(request.getAmount());
        transaction.setBalanceAfter(newBalance);
        transaction.setBillingId(request.getBillingId());
        transaction.setNotes(request.getNotes());
        transaction.setTransactionDate(LocalDateTime.now());
        transaction.setCreatedBy(createdBy);
        transaction.setCreatedAt(LocalDateTime.now());
        
        credit.getTransactions().add(transaction);
        credit.setTotalUsed(credit.getTotalUsed().add(request.getAmount()));
        credit.setCurrentBalance(newBalance);
        credit.setLastTransactionDate(LocalDateTime.now());
        credit.setUpdatedAt(LocalDateTime.now());
        
        clientCreditRepository.save(credit);
        return transaction;
    }
    
    private ClientCredit createNewCredit(String clientId) {
        Client client = clientRepository.findById(clientId)
            .orElseThrow(() -> new RuntimeException("Cliente no encontrado"));
        
        ClientCredit credit = new ClientCredit();
        credit.setClientId(clientId);
        credit.setClient(client);
        credit.setCreatedAt(LocalDateTime.now());
        credit.setUpdatedAt(LocalDateTime.now());
        return credit;
    }
}
```

---

## Integración con Módulo de Ventas Existente

### Modificaciones al guardar una venta (Sale/Billing)

```java
// En el servicio de ventas, al guardar:
public Billing saveBilling(Billing billing, BigDecimal creditToApply) {
    // 1. Si es venta a CRÉDITO, actualizar cuenta por cobrar
    if (billing.getSaleType() == SaleType.CREDITO) {
        clientAccountService.addDebt(billing.getClient().getId(), billing.getTotalBilling());
    }
    
    // 2. Si se aplica saldo a favor
    if (creditToApply != null && creditToApply.compareTo(BigDecimal.ZERO) > 0) {
        clientCreditService.useCredit(UseCreditRequest.builder()
            .clientId(billing.getClient().getId())
            .amount(creditToApply)
            .billingId(billing.getId())
            .notes("Aplicado en factura " + billing.getBillNumber())
            .build());
        
        // Agregar método de pago SALDO_A_FAVOR
        billing.getPaymentMethods().add("SALDO_A_FAVOR");
    }
    
    // 3. Guardar la factura
    return billingRepository.save(billing);
}
```

---

## Repositorios MongoDB

### ClientAccountRepository
```java
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;
import java.util.List;
import java.util.Optional;

public interface ClientAccountRepository extends MongoRepository<ClientAccount, String> {
    
    Optional<ClientAccount> findByClientId(String clientId);
    
    @Query("{ 'currentBalance': { $gt: 0 } }")
    List<ClientAccount> findAllWithBalance();
    
    boolean existsByClientId(String clientId);
}
```

### ClientCreditRepository
```java
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;
import java.util.List;
import java.util.Optional;

public interface ClientCreditRepository extends MongoRepository<ClientCredit, String> {
    
    Optional<ClientCredit> findByClientId(String clientId);
    
    @Query("{ 'currentBalance': { $gt: 0 } }")
    List<ClientCredit> findAllWithBalance();
    
    boolean existsByClientId(String clientId);
}
```

---

## Consideraciones Adicionales

1. **Transaccionalidad**: Usar `@Transactional` de Spring para operaciones que modifican saldos. MongoDB 4.0+ soporta transacciones multi-documento.

2. **Auditoría**: Registrar quién y cuándo realizó cada operación usando los campos `createdBy` y `createdAt`.

3. **Validaciones**:
   - No permitir pagos mayores al saldo pendiente
   - No permitir uso de crédito mayor al disponible
   - No permitir saldos negativos

4. **Concurrencia**: Usar `@Version` de Spring Data para bloqueo optimista:
```java
@Version
private Long version;
```

5. **Índices MongoDB**: Los índices se crean automáticamente con `@Indexed`. Para índices adicionales, usar configuración:
```java
@Configuration
public class MongoConfig {
    @Bean
    public MongoCustomConversions customConversions() {
        return new MongoCustomConversions(Collections.emptyList());
    }
}
```

---

## Índices MongoDB (crear en MongoDB Shell o Compass)

```javascript
// Índices para client_accounts
db.client_accounts.createIndex({ "clientId": 1 }, { unique: true });
db.client_accounts.createIndex({ "currentBalance": 1 }, { partialFilterExpression: { currentBalance: { $gt: 0 } } });

// Índices para client_credits
db.client_credits.createIndex({ "clientId": 1 }, { unique: true });
db.client_credits.createIndex({ "currentBalance": 1 }, { partialFilterExpression: { currentBalance: { $gt: 0 } } });
```

---

## Script de Migración para Facturas a Crédito Existentes

Si ya tienes facturas a crédito registradas antes de implementar esta funcionalidad, necesitas ejecutar una migración para crear los registros de `ClientAccount`.

### Opción 1: Servicio de Migración en Spring Boot

```java
import org.springframework.stereotype.Service;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class ClientAccountMigrationService {
    
    private final BillingRepository billingRepository;
    private final ClientAccountRepository clientAccountRepository;
    private final ClientRepository clientRepository;
    
    /**
     * Ejecutar manualmente o con endpoint protegido.
     * NO usar @EventListener en producción sin control.
     */
    public void migrateExistingCreditBillings() {
        log.info("Iniciando migración de facturas a crédito existentes...");
        
        // 1. Buscar todas las facturas a crédito
        List<Billing> creditBillings = billingRepository.findBySaleType("CREDITO");
        log.info("Facturas a crédito encontradas: {}", creditBillings.size());
        
        // 2. Agrupar por cliente y sumar totales
        Map<String, BigDecimal> debtByClient = new HashMap<>();
        
        for (Billing billing : creditBillings) {
            String clientId = billing.getClient().getId();
            BigDecimal currentDebt = debtByClient.getOrDefault(clientId, BigDecimal.ZERO);
            debtByClient.put(clientId, currentDebt.add(billing.getTotalBilling()));
        }
        
        // 3. Crear o actualizar ClientAccount para cada cliente
        for (Map.Entry<String, BigDecimal> entry : debtByClient.entrySet()) {
            String clientId = entry.getKey();
            BigDecimal totalDebt = entry.getValue();
            
            ClientAccount account = clientAccountRepository.findByClientId(clientId)
                .orElseGet(() -> {
                    Client client = clientRepository.findById(clientId).orElse(null);
                    if (client == null) {
                        log.warn("Cliente no encontrado: {}", clientId);
                        return null;
                    }
                    ClientAccount newAccount = new ClientAccount();
                    newAccount.setClientId(clientId);
                    newAccount.setClient(client);
                    newAccount.setCreatedAt(LocalDateTime.now());
                    return newAccount;
                });
            
            if (account != null) {
                account.setTotalDebt(totalDebt);
                account.setCurrentBalance(totalDebt.subtract(account.getTotalPaid()));
                account.setUpdatedAt(LocalDateTime.now());
                clientAccountRepository.save(account);
                log.info("Cuenta creada/actualizada para cliente {}: deuda = {}", 
                    clientId, totalDebt);
            }
        }
        
        log.info("Migración completada. Clientes procesados: {}", debtByClient.size());
    }
}
```

### Opción 2: Endpoint de Migración (Recomendado)

```java
@RestController
@RequestMapping("/api/admin/migration")
@RequiredArgsConstructor
public class MigrationController {
    
    private final ClientAccountMigrationService migrationService;
    
    @PostMapping("/client-accounts")
    @PreAuthorize("hasRole('ADMIN')")  // Proteger con autenticación
    public ResponseEntity<String> migrateClientAccounts() {
        migrationService.migrateExistingCreditBillings();
        return ResponseEntity.ok("Migración completada");
    }
}
```

### Opción 3: Script MongoDB directo

Ejecutar en MongoDB Shell o Compass:

```javascript
// Script de migración para facturas a crédito existentes
// Ejecutar UNA SOLA VEZ después de crear la colección client_accounts

// 1. Agregar al pipeline de agregación
db.SALES_BILLING.aggregate([
    // Filtrar solo facturas a crédito
    { $match: { saleType: "CREDITO" } },
    
    // Agrupar por cliente
    { $group: {
        _id: "$client.$id",  // o "$client._id" según tu estructura
        totalDebt: { $sum: "$totalBilling" },
        clientData: { $first: "$client" }
    }},
    
    // Proyectar el formato final
    { $project: {
        clientId: "$_id",
        client: "$clientData",
        totalDebt: 1,
        totalPaid: { $literal: 0 },
        currentBalance: "$totalDebt",
        payments: { $literal: [] },
        createdAt: new Date(),
        updatedAt: new Date()
    }},
    
    // Insertar en la colección client_accounts
    { $merge: {
        into: "client_accounts",
        on: "clientId",
        whenMatched: "merge",
        whenNotMatched: "insert"
    }}
]);

print("Migración completada");

// Verificar resultados
db.client_accounts.find().pretty();
```

### Consideraciones Importantes

1. **Hacer backup antes de migrar**: `mongodump --db tu_base_de_datos`

2. **Ejecutar en ambiente de prueba primero**

3. **Si ya hay pagos registrados manualmente**, ajustar el script para restarlos del `currentBalance`

4. **Verificar la estructura de `client` en tus billings** - puede ser `$ref` (DBRef) o documento embebido

---

## Resumen de Endpoints

### Client Accounts (`/api/client-accounts`)
- `GET /client/{clientId}` - Obtener cuenta
- `GET /client/{clientId}/balance` - Obtener saldo
- `GET /client/{clientId}/payments` - Historial de pagos
- `GET /client/{clientId}/credit-billings` - Facturas a crédito
- `GET /with-balance` - Cuentas con saldo pendiente
- `POST /payments` - Registrar pago
- `POST /report` - Reporte

### Client Credits (`/api/client-credits`)
- `GET /client/{clientId}` - Obtener crédito
- `GET /client/{clientId}/balance` - Obtener saldo a favor
- `GET /client/{clientId}/transactions` - Historial
- `GET /with-balance` - Clientes con saldo a favor
- `POST /deposit` - Registrar anticipo
- `POST /use` - Usar saldo
- `POST /adjust` - Ajuste manual
- `POST /report` - Reporte
