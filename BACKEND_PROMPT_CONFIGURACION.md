# Backend Prompt — Módulo Configuración: Usuarios y Empresa

## Stack
- Spring Boot 3.x · MongoDB · Java 17+ · String IDs (ObjectId)
- Auditoría automática con Spring Data `@CreatedBy`, `@LastModifiedBy`, `@CreatedDate`, `@LastModifiedDate`

---

## IMPORTANTE: Verificar antes de implementar

Antes de crear cualquier endpoint, verificar si ya existe en `UserController`, `CompanyController` o en los servicios respectivos. Sólo implementar lo que NO exista aún.

Los endpoints ya confirmados en el frontend son:
- `GET /api/user` — ya existe (`UserService.getAll()`)
- `GET /api/auth/login` — ya existe

---

## 1. Auditoría — AuditInfo embebido

### 1.1 Configurar AuditorAware

```java
@Configuration
@EnableMongoAuditing
public class MongoAuditConfig {
    @Bean
    public AuditorAware<String> auditorAware() {
        return () -> {
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            if (auth == null || !auth.isAuthenticated()) return Optional.of("system");
            return Optional.of(auth.getName()); // sub del JWT
        };
    }
}
```

### 1.2 Campos a agregar a entidades existentes (User y Company)

Verificar si los campos ya existen antes de agregar:

```java
// En User.java y Company.java — agregar si NO existen:
@CreatedDate
private LocalDateTime createdAt;

@LastModifiedDate
private LocalDateTime updatedAt;

@CreatedBy
private String createdBy;

@LastModifiedBy
private String updatedBy;
```

> **Nota de migración**: Los documentos existentes no tendrán estos campos. No es necesario migrarlos; los nuevos documentos los tendrán automáticamente. El frontend maneja `null` con `|| '—'`.

---

## 2. Módulo Usuarios — `UserController` → `/api/user`

### Endpoints existentes (NO reimplementar)
- `GET /api/user` — listar todos

### Endpoints NUEVOS a implementar

#### GET `/api/user/{id}`
```java
@GetMapping("/{id}")
public ResponseEntity<UserResponse> getById(@PathVariable String id) {
    return ResponseEntity.ok(userService.getById(id));
}
```

#### POST `/api/user`
Crear usuario. Hash de la contraseña con BCrypt.

**Request:**
```json
{
  "numberIdentity": "1234567890",
  "password": "plaintext",
  "name": "JUAN",
  "surname": "PEREZ",
  "phone": "300 000 0000",
  "address": "Calle 1 #1-1",
  "rol": "VENDEDOR"
}
```

**Validaciones:**
- `numberIdentity` único (HTTP 409 si ya existe)
- `rol` debe ser uno de: `ADMIN`, `FACTURADOR`, `VENDEDOR`
- `password` mínimo 6 caracteres

**Response:** `UserResponse` (sin campo `password`)

```java
@PostMapping
public ResponseEntity<UserResponse> create(@RequestBody @Valid CreateUserRequest request) {
    // verificar si existe: userRepository.existsByNumberIdentity(request.numberIdentity())
    // bcrypt: passwordEncoder.encode(request.password())
    return ResponseEntity.status(HttpStatus.CREATED).body(userService.create(request));
}
```

#### PUT `/api/user/{id}`
Actualizar datos (sin contraseña, sin cédula).

**Request:**
```json
{
  "name": "JUAN",
  "surname": "PEREZ",
  "phone": "300 000 0000",
  "address": "Calle 1 #1-1",
  "rol": "FACTURADOR"
}
```

```java
@PutMapping("/{id}")
public ResponseEntity<UserResponse> update(@PathVariable String id, @RequestBody UpdateUserRequest request) {
    return ResponseEntity.ok(userService.update(id, request));
}
```

#### PATCH `/api/user/{id}/password`
Cambiar contraseña. Hash con BCrypt.

**Request:**
```json
{ "newPassword": "nueva123" }
```

**Validación:** `newPassword` mínimo 6 caracteres.

```java
@PatchMapping("/{id}/password")
public ResponseEntity<Void> changePassword(@PathVariable String id, @RequestBody ChangePasswordRequest request) {
    userService.changePassword(id, request.newPassword());
    return ResponseEntity.ok().build();
}
```

#### DELETE `/api/user/{id}`
Eliminar usuario. Proteger: no permitir eliminar al usuario autenticado actual.

```java
@DeleteMapping("/{id}")
public ResponseEntity<Void> delete(@PathVariable String id) {
    userService.delete(id);
    return ResponseEntity.noContent().build();
}
```

### UserResponse DTO
```java
public record UserResponse(
    String id,
    String numberIdentity,
    String name,
    String surname,
    String fullName,
    String phone,
    String address,
    String rol,
    Object company,
    LocalDateTime createdAt,
    LocalDateTime updatedAt,
    String createdBy,
    String updatedBy
) {}
// Excluir 'password' siempre
```

### Roles válidos
```java
public enum UserRole {
    ADMIN, FACTURADOR, VENDEDOR
}
```

---

## 3. Módulo Empresa — `CompanyController` → `/api/company`

La colección `COMPANY` tiene **un único documento** (singleton de configuración).

### Endpoints NUEVOS

#### GET `/api/company`
Devuelve la empresa activa.

```java
@GetMapping
public ResponseEntity<CompanyResponse> get() {
    return ResponseEntity.ok(companyService.get());
}
```

**Lógica:** buscar el primer documento de la colección `COMPANY` (o por `status = ACTIVO`).

#### PUT `/api/company/{id}`
Actualizar la empresa completa (incluye `billingConfig`).

**Request body:** igual al JSON de Company del documento MongoDB, sin `_class` ni `_id` (vienen como parámetros de URL).

```java
@PutMapping("/{id}")
public ResponseEntity<CompanyResponse> update(
    @PathVariable String id,
    @RequestBody UpdateCompanyRequest request) {
    return ResponseEntity.ok(companyService.update(id, request));
}
```

**Validaciones:**
- `nit` requerido
- `businessName` requerido
- `email` formato válido si presente

### UpdateCompanyRequest DTO
```java
public record UpdateCompanyRequest(
    String nit,
    String businessName,
    String phone,
    String address,
    String email,
    String status,
    BillingConfigDto billingConfig
) {}

public record BillingConfigDto(
    String id,
    String bankAccountType,
    String billingType,
    List<String> paymentMethods,
    LocalDateTime resolutionExpiresDate,
    Long billFrom,
    Long billUntil,
    String bank,
    String bankAccountNumber,
    String prefixBill,
    String dianResolutionNumber,
    String taxRegime,
    boolean isCurrentResolution
) {}
```

### CompanyResponse DTO
```java
public record CompanyResponse(
    String id,
    String nit,
    String businessName,
    String phone,
    String address,
    String email,
    String status,
    BillingConfigDto billingConfig,
    LocalDateTime createdAt,
    LocalDateTime updatedAt,
    String createdBy,
    String updatedBy
) {}
```

---

## 4. JWT — incluir `rol` en el token

Verificar si el JWT ya incluye el campo `rol` en el payload. Si no, agregar al generar el token:

```java
// En JwtService o AuthService, al generar el token:
.claim("rol", user.getRol().name())  // o user.getRol() si ya es String
```

El frontend lo extrae así:
```typescript
// loginUser.service.ts — getUserFromToken()
const user = payloadObj[sub];  // el objeto usuario embebido
// user.rol debe existir
```

---

## 5. Seguridad

| Endpoint | Roles permitidos |
|----------|-----------------|
| `GET /api/user` | ADMIN, FACTURADOR |
| `GET /api/user/{id}` | ADMIN, FACTURADOR |
| `POST /api/user` | ADMIN |
| `PUT /api/user/{id}` | ADMIN |
| `PATCH /api/user/{id}/password` | ADMIN |
| `DELETE /api/user/{id}` | ADMIN |
| `GET /api/company` | ADMIN, FACTURADOR, VENDEDOR |
| `PUT /api/company/{id}` | ADMIN |

---

## 6. Índices MongoDB

```javascript
// Verificar si ya existen antes de crear
db.users.createIndex({ numberIdentity: 1 }, { unique: true })
db.COMPANY.createIndex({ status: 1 })
```

---

## 7. Resumen de cambios mínimos

| Tarea | Ya existe | Acción |
|-------|-----------|--------|
| `GET /api/user` | ✅ Sí | No tocar |
| `GET /api/user/{id}` | ❓ Verificar | Crear si no existe |
| `POST /api/user` | ❓ Verificar | Crear si no existe |
| `PUT /api/user/{id}` | ❓ Verificar | Crear si no existe |
| `PATCH /api/user/{id}/password` | ❓ Verificar | Crear si no existe |
| `DELETE /api/user/{id}` | ❓ Verificar | Crear si no existe |
| `GET /api/company` | ❓ Verificar | Crear si no existe |
| `PUT /api/company/{id}` | ❓ Verificar | Crear si no existe |
| `@EnableMongoAuditing` | ❓ Verificar | Agregar si no está |
| Campos `createdAt/By` en `User` | ❓ Verificar | Agregar si no están |
| Campos `createdAt/By` en `Company` | ❓ Verificar | Agregar si no están |
| `rol` en JWT payload | ❓ Verificar | Agregar si no está |
