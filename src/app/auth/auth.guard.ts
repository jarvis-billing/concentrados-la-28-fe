import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

export const authGuard: CanActivateFn = (_route, state) => {
  const router = inject(Router);
  const token = window.localStorage.getItem('authToken');

  if (!token) {
    const returnUrl = state.url;
    router.navigate(['/login'], { queryParams: { returnUrl } });
    return false;
  }
  return true;
};
