# Backend Prompt — Módulo Preventa

## Stack
- Spring Boot 3.x · MongoDB · Java 17+ · String IDs (ObjectId)
- Spring WebSocket (raw handler, sin STOMP) para notificaciones en tiempo real

---

## 1. Modelo de Datos — `PreSale` (MongoDB collection: `pre_sales`)

```java
@Document(collection = "PRE_SALES")
public class PreSale {
    @Id
    private String id;
    private String preSaleNumber;         // Ej: "PRV-0001", autogenerado
    private PreSaleStatus status;         // PENDING | BILLED | CANCELLED
    private String sellerName;
    private List<PreSaleItem> items;
    private double totalAmount;
    private String notes;
    private LocalDateTime createdAt;
    private String createdBy;             // numberIdentity del vendedor
    private LocalDateTime finalizedAt;
    private LocalDateTime billedAt;       // Cuando el facturador la importa
    private String billingId;             // ID de la factura generada
    private String billedBy;              // numberIdentity del facturador
    private LocalDateTime cancelledAt;
    private String cancelledBy;           // numberIdentity de quien canceló
}

public enum PreSaleStatus { PENDING, BILLED, CANCELLED }

public class PreSaleItem {
    private String barcode;
    private String productId;
    private String description;
    private String saleType;
    private String unitMeasure;
    private String presentationLabel;
    private double price;
    private double amount;
    private boolean isBulk;
    private Double bulkInputAmount;       // Solo granel: total $ ingresado
    private double subTotal;
}
```

### Índices sugeridos
```javascript
db.pre_sales.createIndex({ status: 1, createdAt: -1 })
db.pre_sales.createIndex({ preSaleNumber: 1 }, { unique: true })
db.pre_sales.createIndex({ createdAt: -1 })
```

### Secuencia de numeración
Usar un documento contador en colección `sequences`:
```java
// GET next: db.sequences.findOneAndUpdate({ _id: "pre_sale_number" }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: AFTER })
// Formatear como: "PRV-" + String.format("%04d", seq)
```

---

## 2. DTOs

```java
// Request — crear preventa desde el móvil
public record CreatePreSaleRequest(
    String sellerName,
    List<PreSaleItemDto> items,
    double totalAmount,
    String notes
) {}

// Response — devuelto al móvil y al facturador
public record PreSaleDto(
    String id,
    String preSaleNumber,
    String status,
    String sellerName,
    List<PreSaleItemDto> items,
    double totalAmount,
    String notes,
    LocalDateTime createdAt,
    LocalDateTime finalizedAt,
    LocalDateTime billedAt,
    String billingId
) {}

// Filtro para listado
public record PreSaleFilterDto(
    String status,
    LocalDate fromDate,
    LocalDate toDate
) {}

// Notificación que se envía por WebSocket al facturador
public record PreSaleNotification(
    String preSaleId,
    String preSaleNumber,
    String sellerName,
    double totalAmount,
    int itemCount,
    LocalDateTime createdAt
) {}

// Wrapper para mensajes WebSocket
public record WsMessage<T>(
    String type,    // "PREVENTA_READY"
    T payload
) {}

// Request para marcar como facturada
public record MarkBilledRequest(String billingId) {}
```

---

## 3. REST Endpoints — `PreSaleController` → `/api/preventas`

### POST `/api/preventas`
Crea una nueva preventa y notifica a los facturadores vía WebSocket.

```java
@PostMapping
public ResponseEntity<PreSaleDto> create(@RequestBody CreatePreSaleRequest request) {
    PreSale saved = preSaleService.create(request);
    // Broadcast WebSocket a todos los clientes conectados
    webSocketHandler.broadcast(new WsMessage<>("PREVENTA_READY", toNotification(saved)));
    return ResponseEntity.ok(toDto(saved));
}
```

### GET `/api/preventas/{id}`
Retorna la preventa completa por ID.

### POST `/api/preventas/list`
Lista preventas con filtros opcionales.
Devuelve `List<PreSaleDto>` ordenado por `createdAt DESC`.

**Request body — `PreSaleFilterDto`:**
```json
{
  "status": "PENDING",
  "sellerName": "John Doe",
  "fromDate": "2025-01-01",
  "toDate": "2025-12-31",
  "page": 0,
  "size": 50
}
```

Todos los campos son opcionales. Si se envía `sellerName`, filtrar por coincidencia exacta con el campo `sellerName` de la preventa. Esto permite que el VENDEDOR vea únicamente sus propias preventas.

**Lógica del filtro en el servicio:**
```java
public List<PreSaleDto> list(PreSaleFilterDto filter) {
    Query query = new Query();
    if (filter.getStatus() != null)
        query.addCriteria(Criteria.where("status").is(filter.getStatus()));
    if (filter.getSellerName() != null && !filter.getSellerName().isBlank())
        query.addCriteria(Criteria.where("sellerName").is(filter.getSellerName()));
    if (filter.getFromDate() != null)
        query.addCriteria(Criteria.where("createdAt").gte(filter.getFromDate()));
    if (filter.getToDate() != null)
        query.addCriteria(Criteria.where("createdAt").lte(filter.getToDate()));
    query.with(Sort.by(Sort.Direction.DESC, "createdAt"));
    return mongoTemplate.find(query, PreSale.class)
        .stream().map(this::toDto).collect(Collectors.toList());
}

### PATCH `/api/preventas/{id}/cancel`
Cambia status a `CANCELLED`. Solo si status es `PENDING`.
Devuelve `PreSaleDto` actualizado o `400` si ya está facturada/cancelada.

### PATCH `/api/preventas/{id}/billed`
Cuerpo: `{ "billingId": "..." }`
Cambia status a `BILLED`, guarda `billingId` y `billedAt`.
Solo si status es `PENDING`. Devuelve `PreSaleDto` actualizado.

### PATCH `/api/preventas/{id}/resend`
Re-envía la notificación WebSocket a los facturadores conectados para una preventa que ya existe.
No modifica el estado de la preventa.
Solo válido si status es `PENDING`. Retorna `400` si está `BILLED` o `CANCELLED`.

**Roles permitidos:** `ADMIN`, `VENDEDOR`

**Lógica:**
```java
@PatchMapping("/{id}/resend")
public ResponseEntity<PreSaleDto> resend(@PathVariable String id) {
    PreSale ps = preSaleService.findOrThrow(id);
    if (ps.getStatus() != PreSaleStatus.PENDING)
        return ResponseEntity.badRequest().build();
    // Re-usa el mismo broadcast que en create
    PreSaleNotification notif = PreSaleNotification.builder()
        .preSaleId(ps.getId())
        .preSaleNumber(ps.getPreSaleNumber())
        .sellerName(ps.getSellerName())
        .totalAmount(ps.getTotalAmount())
        .itemCount(ps.getItems().size())
        .createdAt(ps.getCreatedAt())
        .build();
    webSocketHandler.broadcast(new WsMessage<>("PREVENTA_READY", notif));
    return ResponseEntity.ok(preSaleService.toDto(ps));
}
```

**Regla de seguridad en `SecurityConfig`:**
```java
.requestMatchers(HttpMethod.PATCH, "/api/preventas/*/resend")
    .hasAnyRole("ADMIN", "VENDEDOR")
```

---

## 4. WebSocket — Handler puro (sin STOMP)

### Configuración

```java
@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {
    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(preSaleWebSocketHandler(), "/ws/preventa")
                .setAllowedOriginPatterns("*");  // Ajustar en prod
    }

    @Bean
    public PreSaleWebSocketHandler preSaleWebSocketHandler() {
        return new PreSaleWebSocketHandler();
    }
}
```

### Handler

```java
@Component
public class PreSaleWebSocketHandler extends TextWebSocketHandler {

    private final Set<WebSocketSession> sessions = ConcurrentHashMap.newKeySet();
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        // Validar JWT del query param ?token=xxx
        String token = extractToken(session);
        if (!jwtService.isValid(token)) {
            try { session.close(CloseStatus.NOT_ACCEPTABLE); } catch (Exception ignored) {}
            return;
        }
        sessions.add(session);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        sessions.remove(session);
    }

    public void broadcast(WsMessage<?> message) {
        String json;
        try {
            json = objectMapper.writeValueAsString(message);
        } catch (Exception e) { return; }

        for (WebSocketSession session : sessions) {
            if (session.isOpen()) {
                try {
                    session.sendMessage(new TextMessage(json));
                } catch (Exception ignored) {}
            }
        }
    }

    private String extractToken(WebSocketSession session) {
        URI uri = session.getUri();
        if (uri == null) return null;
        String query = uri.getQuery();  // "token=eyJ..."
        if (query == null) return null;
        return Arrays.stream(query.split("&"))
            .filter(p -> p.startsWith("token="))
            .map(p -> p.substring(6))
            .findFirst()
            .map(t -> URLDecoder.decode(t, StandardCharsets.UTF_8))
            .orElse(null);
    }
}
```

### Nota sobre Heroku
Heroku soporta WebSockets nativamente (HTTP Upgrade). No se requiere configuración adicional. Asegurarse de que el timeout del dyno no cierre conexiones inactivas — el frontend ya tiene reconexión automática cada 5s.

---

## 5. Lógica de Negocio — `PreSaleService`

```java
@Service
public class PreSaleService {

    public PreSale create(CreatePreSaleRequest request) {
        PreSale preSale = new PreSale();
        preSale.setPreSaleNumber(generateNumber());    // PRV-0001
        preSale.setStatus(PreSaleStatus.PENDING);
        preSale.setSellerName(request.sellerName());
        preSale.setItems(mapItems(request.items()));
        preSale.setTotalAmount(request.totalAmount());
        preSale.setNotes(request.notes());
        preSale.setCreatedAt(LocalDateTime.now());
        preSale.setFinalizedAt(LocalDateTime.now());
        return repository.save(preSale);
    }

    public PreSale cancel(String id, String cancelledBy) {
        PreSale ps = findOrThrow(id);
        if (ps.getStatus() != PreSaleStatus.PENDING)
            throw new BusinessException("Solo se pueden cancelar preventas en estado PENDIENTE");
        ps.setStatus(PreSaleStatus.CANCELLED);
        ps.setCancelledAt(LocalDateTime.now());
        ps.setCancelledBy(cancelledBy);   // Extraer de @AuthenticationPrincipal
        return repository.save(ps);
    }

    public PreSale markAsBilled(String id, String billingId, String billedBy) {
        PreSale ps = findOrThrow(id);
        if (ps.getStatus() != PreSaleStatus.PENDING)
            throw new BusinessException("La preventa ya fue procesada");
        ps.setStatus(PreSaleStatus.BILLED);
        ps.setBillingId(billingId);
        ps.setBilledAt(LocalDateTime.now());
        ps.setBilledBy(billedBy);         // Extraer de @AuthenticationPrincipal
        return repository.save(ps);
    }

    public List<PreSale> list(PreSaleFilterDto filter) {
        // Construir Query dinámico con Criteria
        Query query = new Query().with(Sort.by(Sort.Direction.DESC, "createdAt"));
        if (filter.status() != null)
            query.addCriteria(Criteria.where("status").is(filter.status()));
        if (filter.fromDate() != null)
            query.addCriteria(Criteria.where("createdAt").gte(filter.fromDate().atStartOfDay()));
        if (filter.toDate() != null)
            query.addCriteria(Criteria.where("createdAt").lte(filter.toDate().atTime(23, 59, 59)));
        return mongoTemplate.find(query, PreSale.class);
    }

    private String generateNumber() {
        // Incrementar contador en colección sequences
        Query query = new Query(Criteria.where("_id").is("pre_sale_number"));
        Update update = new Update().inc("seq", 1);
        FindAndModifyOptions options = FindAndModifyOptions.options().upsert(true).returnNew(true);
        SequenceDocument doc = mongoTemplate.findAndModify(query, update, options, SequenceDocument.class, "sequences");
        return "PRV-" + String.format("%04d", doc.getSeq());
    }
}
```

---

## 6. Seguridad

- El endpoint WebSocket `/ws/preventa` valida el JWT desde el query param `?token=`.
- Los endpoints REST `/api/preventas/**` deben estar protegidos con la misma cadena de filtros JWT existente.
- El endpoint `POST /api/preventas` (crear desde móvil) requiere rol `VENDEDOR` o `ADMIN`.
- El endpoint `POST /api/preventas/list` requiere rol `ADMIN`, `FACTURADOR` o `VENDEDOR` (el vendedor puede ver sus propias preventas usando el filtro `sellerName`).
- Los endpoints `PATCH /cancel`, `PATCH /billed` requieren rol `ADMIN` o `FACTURADOR`.
- El endpoint `PATCH /resend` requiere rol `ADMIN` o `VENDEDOR` (el vendedor reenvía la notificación de su propia preventa).

---

## 7. Prueba rápida del flujo

1. El vendedor abre `https://tu-app.com/preventa` en el móvil.
2. Escanea productos → `POST /api/preventas` → backend guarda y hace broadcast WS.
3. El facturador en `https://tu-app.com/main/factura` (desktop) recibe el WS con `type: "PREVENTA_READY"`.
4. El facturador hace clic en **Importar** → frontend llama `GET /api/preventas/{id}` y mapea los ítems a la factura activa.
5. Al guardar la factura, el frontend llama `PATCH /api/preventas/{id}/billed` con el `billingId`.

---

## 8. Dependencia Maven adicional

```xml
<!-- Spring WebSocket — agregar al pom.xml si no está -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-websocket</artifactId>
</dependency>
```
