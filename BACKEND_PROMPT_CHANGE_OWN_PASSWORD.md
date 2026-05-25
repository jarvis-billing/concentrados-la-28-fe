# Backend Prompt: Cambio de Contraseña Propia (Me)

## Descripción
Se requiere implementar un endpoint que permita al usuario autenticado cambiar su propia contraseña sin necesidad de conocer su ID. El endpoint extrae la identidad del usuario desde el JWT del request.

## Stack
- Spring Boot 3.x
- MongoDB
- Java 17+
- Spring Security con JWT (el token incluye el `sub` del usuario)

## Contexto Actual
El sistema ya cuenta con:
- Entidad `User` en MongoDB con campo `password` (almacenado con BCrypt)
- Endpoint existente: `PATCH /api/user/{id}/password` — cambia la contraseña de otro usuario (uso administrativo)
- Autenticación JWT: todos los requests autenticados llevan `Authorization: Bearer <token>`
- El `sub` del JWT corresponde al `numberIdentity` del usuario

## Requerimiento

### Endpoint a Implementar

```
PATCH /api/user/me/password
```

### Headers requeridos
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

### Request Body
```json
{
  "newPassword": "string — nueva contraseña (mínimo 6 caracteres)"
}
```

### Response
- **200 OK** — sin cuerpo (void)
- **400 Bad Request** — si `newPassword` es nulo, vacío o menor a 6 caracteres
- **401 Unauthorized** — si el token es inválido o ha expirado
- **404 Not Found** — si el usuario del token no existe en la base de datos

### Lógica de negocio
1. Extraer el `sub` del JWT (el `numberIdentity` del usuario autenticado)
2. Buscar el usuario en MongoDB por `numberIdentity == sub`
3. Validar que `newPassword` tenga al menos 6 caracteres
4. Encriptar `newPassword` con BCrypt (`passwordEncoder.encode(newPassword)`)
5. Actualizar el campo `password` del documento y guardar
6. Retornar `ResponseEntity.ok().build()`

## DTO

```java
public record ChangePasswordRequest(
    @NotBlank
    @Size(min = 6, message = "La contraseña debe tener al menos 6 caracteres")
    String newPassword
) {}
```

## Controlador (referencia)

```java
@PatchMapping("/me/password")
@PreAuthorize("isAuthenticated()")
public ResponseEntity<Void> changeOwnPassword(
        @AuthenticationPrincipal UserDetails userDetails,
        @Valid @RequestBody ChangePasswordRequest request) {

    userService.changeOwnPassword(userDetails.getUsername(), request.newPassword());
    return ResponseEntity.ok().build();
}
```

## Servicio (referencia)

```java
public void changeOwnPassword(String numberIdentity, String newPassword) {
    User user = userRepository.findByNumberIdentity(numberIdentity)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));

    user.setPassword(passwordEncoder.encode(newPassword));
    userRepository.save(user);
}
```

## Seguridad
- El endpoint debe estar protegido: cualquier rol autenticado puede acceder (`ADMIN`, `FACTURADOR`, `VENDEDOR`)
- No se requiere confirmar la contraseña actual (la validación de identidad la provee el JWT)
- No se debe exponer el hash de la contraseña en ninguna respuesta

## Notas de integración con el frontend
- El frontend llama a este endpoint desde `UserService.changeOwnPassword()`:
  ```typescript
  // src/app/users/user.service.ts
  changeOwnPassword(request: ChangePasswordRequest): Observable<void> {
    return this.http.patch<void>(`${this.url}/me/password`, request);
  }
  ```
- La URL base es: `GET /api/user` → `PATCH /api/user/me/password`
- El interceptor HTTP del frontend adjunta automáticamente el token JWT en el header `Authorization`
