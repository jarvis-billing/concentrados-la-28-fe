# Backend Prompt: Implementar Devolución de Anticipos

## Descripción
Se requiere implementar un endpoint para procesar devoluciones de anticipos (saldo a favor) a clientes. Este endpoint registrará una transacción de tipo `REFUND` que reduce el saldo a favor del cliente.

## Contexto Actual
El sistema ya tiene implementado el módulo de anticipos/saldo a favor con:
- Entidad `ClientCredit` que almacena el saldo a favor del cliente
- Entidad `CreditTransaction` que registra transacciones (DEPOSIT, CONSUMPTION, ADJUSTMENT)
- Endpoints existentes: POST `/deposit`, POST `/use`, POST `/adjust`, POST `/manual`

## Requerimiento

### Endpoint a Implementar
```
POST /api/client-credits/refund
```

### Request Body (DTO)
```json
{
  "clientId": "string (UUID) - ID del cliente",
  "amount": "number - Monto a devolver (debe ser > 0)",
  "paymentMethod": "enum: EFECTIVO | TRANSFERENCIA | TARJETA_DEBITO | TARJETA_CREDITO | CHEQUE | OTRO",
  "reference": "string (opcional) - Referencia de pago",
  "notes": "string (opcional) - Notas sobre la devolución"
}
```

### Validaciones Requeridas
1. **Cliente existe**: El `clientId` debe corresponder a un cliente existente
2. **Saldo suficiente**: El monto a devolver debe ser menor o igual al saldo a favor actual del cliente
3. **Monto positivo**: El monto debe ser mayor a 0
4. **Método de pago válido**: Debe ser uno de los valores del enum `PaymentMethodCredit`

### Lógica de Negocio
1. Buscar el `ClientCredit` del cliente por `clientId`
2. Validar que `currentBalance >= amount`
3. Crear una nueva transacción `CreditTransaction` con:
   - `type`: `REFUND`
   - `amount`: monto de la devolución
   - `balanceAfter`: `currentBalance - amount`
   - `paymentMethod`: método seleccionado
   - `reference`: referencia proporcionada
   - `notes`: notas proporcionadas
   - `transactionDate`: fecha/hora actual
   - `createdBy`: usuario autenticado
4. Actualizar el `ClientCredit`:
   - `currentBalance = currentBalance - amount`
   - `totalUsed = totalUsed + amount` (opcional, depende de tu modelo)
   - `lastTransactionDate = now`
5. Retornar la transacción creada

### Response Exitosa (200 OK)
```json
{
  "id": "UUID",
  "clientCreditId": "UUID",
  "type": "REFUND",
  "amount": 50000,
  "balanceAfter": 25000,
  "paymentMethod": "EFECTIVO",
  "reference": "Devolución parcial",
  "notes": "Cliente solicitó devolución",
  "transactionDate": "2026-04-20T16:30:00",
  "createdBy": "usuario@ejemplo.com",
  "createdAt": "2026-04-20T16:30:00"
}
```

### Posibles Errores

| HTTP Status | Código/Error | Descripción |
|-------------|--------------|-------------|
| 404 | CLIENT_NOT_FOUND | El cliente no existe |
| 404 | CLIENT_CREDIT_NOT_FOUND | El cliente no tiene registro de saldo a favor |
| 400 | INSUFFICIENT_BALANCE | El monto excede el saldo disponible |
| 400 | INVALID_AMOUNT | El monto debe ser mayor a 0 |
| 400 | INVALID_PAYMENT_METHOD | Método de pago no válido |

### Consideraciones Técnicas

1. **Transaccionalidad**: La operación debe ser atómica (transacción de base de datos)
2. **Auditoría**: Registrar quién realizó la devolución en `createdBy`
3. **Historial**: La transacción debe aparecer en el historial de transacciones del cliente
4. **Integridad**: Evitar race conditions si el cliente tiene múltiples operaciones concurrentes
5. **Integración con Arqueo de Caja**: Ver sección específica más abajo - **CRÍTICO**

## Integración con Módulo de Arqueo de Caja (CRÍTICO)

### Requerimiento de Arqueo
Cada devolución de anticipo **DEBE** generar automáticamente una transacción de caja (`CashTransaction`) para que aparezca en el arqueo del día.

### Entidades Relacionadas
- Entidad: `CashTransaction` (o similar en tu modelo)
- Se obtiene vía: `/api/cash-register/daily-summary`

### Nueva Categoría de Transacción
Agregar al enum `TransactionCategory`:
```java/typescript
enum TransactionCategory {
    VENTA = 'VENTA',
    PAGO_CREDITO = 'PAGO_CREDITO',
    DEPOSITO_ANTICIPO = 'DEPOSITO_ANTICIPO',
    DEVOLUCION_ANTICIPO = 'DEVOLUCION_ANTICIPO',  // ← NUEVO
    GASTO = 'GASTO',
    PAGO_PROVEEDOR = 'PAGO_PROVEEDOR',
    AJUSTE = 'AJUSTE',
    TRASLADO_BANCO = 'TRASLADO_BANCO'
}
```

### Lógica de Integración con Caja
Al procesar la devolución, además de crear la `CreditTransaction`, se debe:

1. **Crear una transacción de caja** con:
   - `type`: `'EGRESO'` (dinero sale de la caja)
   - `category`: `'DEVOLUCION_ANTICIPO'`
   - `description`: `'Devolución de anticipo a cliente: [Nombre Cliente]'`
   - `amount`: monto de la devolución
   - `paymentMethod`: método de pago de la devolución
   - `reference`: referencia proporcionada
   - `transactionDate`: fecha/hora actual
   - `relatedDocumentId`: ID del cliente o de la transacción de crédito

2. **Manejo según método de pago**:
   - **EFECTIVO**: Afecta directamente el efectivo esperado en caja
   - **TRANSFERENCIA/TARJETA**: Registra el egreso pero no afecta efectivo físico
   - **CHEQUE**: Registra el egreso

3. **Impacto en el arqueo**:
   - Las transacciones con `category = 'DEVOLUCION_ANTICIPO'` deben sumarse a:
     - `totalExpense` (total egresos del día)
     - `expectedCashAmount` (si es efectivo)
     - `paymentMethodSummaries` con el método correspondiente

### Ejemplo de Transacción de Caja Generada
```json
{
  "id": "880e8400-e29b-41d4-a716-446655440003",
  "type": "EGRESO",
  "category": "DEVOLUCION_ANTICIPO",
  "description": "Devolución de anticipo a cliente: Empresa ABC",
  "amount": 75000,
  "paymentMethod": "EFECTIVO",
  "reference": "Devolución parcial",
  "transactionDate": "2026-04-20T16:30:00Z",
  "relatedDocumentId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Endpoint de Arqueo Relacionado
Asegurar que el endpoint `GET /api/cash-register/daily-summary` incluya estas transacciones en:
- Listado de transacciones del día
- Resumen por método de pago
- Cálculo de totales

### Ejemplo de Uso

**Request:**
```http
POST /api/client-credits/refund
Content-Type: application/json

{
  "clientId": "550e8400-e29b-41d4-a716-446655440000",
  "amount": 75000,
  "paymentMethod": "TRANSFERENCIA",
  "reference": "TRX-123456",
  "notes": "Devolución por cancelación de pedido"
}
```

**Response:**
```json
{
  "id": "660e8400-e29b-41d4-a716-446655440001",
  "clientCreditId": "770e8400-e29b-41d4-a716-446655440002",
  "type": "REFUND",
  "amount": 75000,
  "balanceAfter": 125000,
  "paymentMethod": "TRANSFERENCIA",
  "reference": "TRX-123456",
  "notes": "Devolución por cancelación de pedido",
  "transactionDate": "2026-04-20T16:30:00Z",
  "createdBy": "admin@empresa.com",
  "createdAt": "2026-04-20T16:30:00Z"
}
```

## Archivos Relacionados en Frontend
- `@/src/app/cuenta-cliente/services/client-credit.service.ts` - Línea 95: método `processRefund()`
- `@/src/app/cuenta-cliente/models/client-credit.ts` - Línea 90: clase `RefundCreditRequest`
- `@/src/app/cuenta-cliente/components/refund-credit-modal/` - UI del modal

## Enum de Tipos de Transacción Existente
```java/typescript
enum CreditTransactionType {
    DEPOSIT = 'DEPOSIT',         // Anticipo/depósito
    CONSUMPTION = 'CONSUMPTION', // Uso en factura
    REFUND = 'REFUND',           // Devolución al cliente ← NUEVO
    ADJUSTMENT = 'ADJUSTMENT'    // Ajuste manual
}
```

## Enum de Métodos de Pago Existente
```java/typescript
enum PaymentMethodCredit {
    EFECTIVO = 'EFECTIVO',
    TRANSFERENCIA = 'TRANSFERENCIA',
    TARJETA_DEBITO = 'TARJETA_DEBITO',
    TARJETA_CREDITO = 'TARJETA_CREDITO',
    CHEQUE = 'CHEQUE',
    OTRO = 'OTRO'
}
```

## Notas Adicionales
- El endpoint debe seguir el mismo patrón que los endpoints existentes: `/deposit`, `/use`, `/adjust`
- Considerar implementar un límite máximo de devolución por día (opcional)
- Verificar permisos: solo usuarios con rol adecuado pueden procesar devoluciones

---
**Prioridad:** Alta
**Fecha de solicitud:** 2026-04-20
