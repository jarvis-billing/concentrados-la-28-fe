import { HttpErrorResponse, HttpHandlerFn, HttpRequest } from '@angular/common/http';
import { NgZone, inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { StorageService } from '../services/localStorage.service';
import { toast } from 'ngx-sonner';

let isRedirecting = false;

export function errorInterceptor(req: HttpRequest<unknown>, next: HttpHandlerFn) {
  const router = inject(Router);
  const zone = inject(NgZone);
  const storage = inject(StorageService);

  return next(req).pipe(
    catchError((error: any) => {
      if (error instanceof HttpErrorResponse) {
        if (error.status === 401 || error.status === 403) {
          if (!isRedirecting) {
            isRedirecting = true;
            const currentUrl = router.url || '';

            if (currentUrl.startsWith('/login')) {
              isRedirecting = false;
              return throwError(() => error);
            }

            storage.allClearItems();
            toast.warning('Tu sesión ha expirado. Redirigiendo al inicio de sesión...', {
              duration: 3000
            });

            zone.run(() => {
              setTimeout(() => {
                router.navigate(['/login'], { replaceUrl: true }).finally(() => {
                  isRedirecting = false;
                });
              }, 500);
            });
          }
        }
      }
      return throwError(() => error);
    })
  );
}
