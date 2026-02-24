import { HttpErrorResponse, HttpHandlerFn, HttpRequest } from '@angular/common/http';
import { NgZone, inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { StorageService } from '../services/localStorage.service';
import { toast } from 'ngx-sonner';

let isRedirecting = false;

export function errorInterceptor(req: HttpRequest<unknown>, next: HttpHandlerFn) {
  return next(req).pipe(
    catchError((error: any) => {
      if (error instanceof HttpErrorResponse) {
        // Manejo de expiración / no autorizado
        if (error.status === 401 || error.status === 403) {
          if (!isRedirecting) {
            isRedirecting = true;
            try {
              const router = inject(Router);
              const zone = inject(NgZone);
              const storage = inject(StorageService);
              const currentUrl = router.url || '';
              
              // Si ya estamos en login, no redirigir
              if (currentUrl.startsWith('/login')) {
                isRedirecting = false;
                return throwError(() => error);
              }
              
              // Limpiar storage y redirigir automáticamente
              storage.allClearItems();
              
              // Mostrar notificación breve
              toast.warning('Tu sesión ha expirado. Redirigiendo al inicio de sesión...', {
                duration: 3000
              });
              
              // Redirigir automáticamente después de un breve delay
              zone.run(() => {
                setTimeout(() => {
                  router.navigate(['/login'], { replaceUrl: true }).finally(() => {
                    isRedirecting = false;
                  });
                }, 500);
              });
            } catch {
              isRedirecting = false;
            }
          }
        }
      }
      return throwError(() => error);
    })
  );
}
