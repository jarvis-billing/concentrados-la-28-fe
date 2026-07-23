import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { firstValueFrom, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { LoginUserService } from './login/loginUser.service';
import { FeaturePermissionService } from '../feature-permissions/services/feature-permission.service';

/**
 * Guard para la ruta de Conteo Físico.
 *
 * - ADMIN / FACTURADOR: acceso siempre.
 * - VENDEDOR: acceso solo si existe un permiso activo para INVENTORY_COUNT.
 * - Cualquier otro rol o sin token: redirige al login.
 */
export const inventoryCountGuard: CanActivateFn = async (_route, state) => {
  const router              = inject(Router);
  const loginService        = inject(LoginUserService);
  const permissionService   = inject(FeaturePermissionService);

  const token = window.localStorage.getItem('authToken');
  if (!token) {
    router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
    return false;
  }

  const user = loginService.getUserFromToken();
  if (!user) {
    router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
    return false;
  }

  // EUserRol enum serializa como "ROLE_ADMIN", "ROLE_FACTURADOR", etc.
  // Normalizamos quitando el prefijo "ROLE_" para comparar limpio.
  const rawRol: string = user.rol ?? '';
  const rol = rawRol.startsWith('ROLE_') ? rawRol.slice(5) : rawRol;

  // ADMIN y FACTURADOR siempre tienen acceso
  if (rol === 'ADMIN' || rol === 'FACTURADOR') return true;

  // VENDEDOR: verificar permiso en el backend
  if (rol === 'VENDEDOR') {
    const redirectToInicio: UrlTree = router.createUrlTree(['/main/inicio']);
    return firstValueFrom(
      permissionService.check('INVENTORY_COUNT', 'VENDEDOR').pipe(
        map(res => (res.granted ? true : redirectToInicio)),
        catchError(() => of(redirectToInicio))
      )
    );
  }

  // Cualquier otro rol no tiene acceso
  router.navigate(['/main/inicio']);
  return false;
};
