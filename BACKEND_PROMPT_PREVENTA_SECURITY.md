# Backend Prompt: Seguridad y Roles para el módulo Preventa

## Contexto

Se implementó un módulo de preventa (pre-venta móvil con escáner de código de barras).
El frontend Angular hace llamadas REST a `/api/preventas/**`.
El backend es **Spring Boot 3.x** con **MongoDB** y autenticación **JWT**.

El objetivo de este prompt es:
1. Revisar la configuración actual de Spring Security para los endpoints `/api/preventas/**`.
2. Ajustar los roles permitidos según la estructura real de usuarios en MongoDB.
3. Asegurar que el JWT converter lee correctamente el campo `rol` del usuario.

---

## Estructura real del usuario en MongoDB

```json
{
  "_id": { "$oid": "66b5a1bca4c35f65c1f68b3f" },
  "numberIdentity": "123456789",
  "name": "John",
  "surname": "Doe",
  "rol": "ROLE_VENDEDOR",
  "_class": "com.co.jarvis.entity.User"
}
```

### Observaciones clave:
- El campo se llama **`rol`** (singular), no `roles`, no `role`.
- El valor ya incluye el prefijo **`ROLE_`** (ej: `"ROLE_VENDEDOR"`, `"ROLE_ADMIN"`, `"ROLE_FACTURADOR"`).
- Es un **String simple**, no un array.

---

## 1. Verificación del JWT claim de rol

### Problema potencial
Si el `JwtAuthenticationConverter` o el filtro JWT personalizado extrae el claim `rol` del token y lo pasa como `SimpleGrantedAuthority("ROLE_VENDEDOR")`, Spring Security lo reconocerá correctamente con `hasAnyRole("VENDEDOR")` o `hasAnyAuthority("ROLE_VENDEDOR")`.

Sin embargo, si el claim en el token se llama diferente (`role`, `roles`, `authorities`) o si el valor se almacena sin prefijo, las reglas `hasAnyRole(...)` fallarán con 403.

### Verificar que el JWT incluye el claim correcto
Al generar el token (login), asegurarse de que se agrega el campo `rol` con el valor completo incluyendo `ROLE_`:

```java
// En la clase que genera el JWT (ej: JwtService o JwtUtil)
Map<String, Object> claims = new HashMap<>();
claims.put("rol", user.getRol()); // "ROLE_VENDEDOR", "ROLE_ADMIN", etc.
// ... buildToken(claims, userDetails, expiration)
```

### Verificar la extracción de roles en el filtro JWT
El filtro que valida el token debe extraer el claim `rol` y construir la authority correctamente:

```java
// En JwtAuthFilter o similar, al construir el UsernamePasswordAuthenticationToken:
String rol = jwtService.extractClaim(token, claims -> claims.get("rol", String.class));

List<GrantedAuthority> authorities = List.of(new SimpleGrantedAuthority(rol));
// Si rol = "ROLE_VENDEDOR", Spring lo reconoce con hasAnyRole("VENDEDOR")
// Si rol = "ROLE_ADMIN", Spring lo reconoce con hasAnyRole("ADMIN")

UsernamePasswordAuthenticationToken authToken = new UsernamePasswordAuthenticationToken(
    userDetails, null, authorities
);
```

> **IMPORTANTE**: Si actualmente el filtro hace `new SimpleGrantedAuthority("ROLE_" + rol)` y el valor en DB ya tiene `ROLE_`, quedaría duplicado como `"ROLE_ROLE_VENDEDOR"`, causando el 403. Verificar y corregir si es necesario.

---

## 2. Configuración de Spring Security para `/api/preventas/**`

Agregar en `SecurityConfig.java` dentro del bloque `.authorizeHttpRequests(...)`, **antes** de la regla catch-all `anyRequest().authenticated()`:

```java
// =========================================
// PREVENTA endpoints
// =========================================

// Crear nueva preventa (móvil - vendedor)
.requestMatchers(HttpMethod.POST, "/api/preventas")
    .hasAnyRole("ADMIN", "VENDEDOR")

// Listar preventas con filtros (escritorio + vendedor puede ver sus propias)
.requestMatchers(HttpMethod.POST, "/api/preventas/list")
    .hasAnyRole("ADMIN", "FACTURADOR", "VENDEDOR")

// Obtener detalle de una preventa por ID
.requestMatchers(HttpMethod.GET, "/api/preventas/{id}")
    .hasAnyRole("ADMIN", "FACTURADOR", "VENDEDOR")

// Cancelar preventa (solo admin/facturador)
.requestMatchers(HttpMethod.PATCH, "/api/preventas/{id}/cancel")
    .hasAnyRole("ADMIN", "FACTURADOR")

// Marcar preventa como facturada (solo admin/facturador)
.requestMatchers(HttpMethod.PATCH, "/api/preventas/{id}/billed")
    .hasAnyRole("ADMIN", "FACTURADOR")
```

### Alternativa con `hasAnyAuthority` (si los roles no tienen prefijo ROLE_ en el token)
Si por alguna razón el claim en el JWT viene sin prefijo (ej: `"VENDEDOR"` puro), usar:

```java
.requestMatchers(HttpMethod.POST, "/api/preventas")
    .hasAnyAuthority("ADMIN", "VENDEDOR")
// ... etc
```

---

## 3. WebSocket `/ws/preventa`

El endpoint WebSocket usa JWT desde query param (`?token=...`). Asegurarse de que está excluido de los filtros HTTP normales y que el handler valida el token manualmente:

```java
// En SecurityConfig, permitir el handshake HTTP del WebSocket:
.requestMatchers("/ws/preventa").permitAll()
// La validación del JWT se hace dentro del WebSocketHandler con el query param
```

---

## 4. Checklist de verificación

- [ ] El JWT generado en login incluye el claim `rol` con valor `"ROLE_VENDEDOR"` (o el que corresponda).
- [ ] El filtro JWT extrae el claim `rol` y crea `SimpleGrantedAuthority(rol)` sin duplicar el prefijo `ROLE_`.
- [ ] `SecurityConfig` tiene las reglas de `/api/preventas/**` antes de `anyRequest().authenticated()`.
- [ ] `/ws/preventa` está en la lista de `permitAll()` a nivel HTTP (la validación es manual en el handler).
- [ ] Probar con usuario `ROLE_VENDEDOR`: `POST /api/preventas` → 201, `POST /api/preventas/list` → 200.
- [ ] Probar con usuario `ROLE_VENDEDOR`: `PATCH /api/preventas/{id}/billed` → 403 (debe denegar).
- [ ] Probar con usuario `ROLE_FACTURADOR`: todos los endpoints → 200/201.

---

## 5. Roles existentes en el sistema

Según la estructura de la DB, los valores posibles del campo `rol`:

| Valor en DB        | `hasAnyRole(...)` | Descripción                        |
|--------------------|-------------------|------------------------------------|
| `ROLE_ADMIN`       | `"ADMIN"`         | Acceso total                       |
| `ROLE_FACTURADOR`  | `"FACTURADOR"`    | Facturación, reportes, preventas   |
| `ROLE_VENDEDOR`    | `"VENDEDOR"`      | Solo crear preventa y ver su lista |

---

## 6. Resumen de endpoints del módulo Preventa

| Método | Endpoint                        | Roles permitidos                      |
|--------|---------------------------------|---------------------------------------|
| POST   | `/api/preventas`                | ADMIN, VENDEDOR                       |
| POST   | `/api/preventas/list`           | ADMIN, FACTURADOR, VENDEDOR           |
| GET    | `/api/preventas/{id}`           | ADMIN, FACTURADOR, VENDEDOR           |
| PATCH  | `/api/preventas/{id}/cancel`    | ADMIN, FACTURADOR                     |
| PATCH  | `/api/preventas/{id}/billed`    | ADMIN, FACTURADOR                     |
| WS     | `/ws/preventa` (handshake HTTP) | permitAll (JWT validado en el handler)|
