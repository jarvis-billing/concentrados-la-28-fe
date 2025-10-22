import { HttpErrorResponse, HttpHandlerFn, HttpRequest } from '@angular/common/http';
import { NgZone, inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { StorageService } from '../services/localStorage.service';
import { toast } from 'ngx-sonner';

let sessionPromptShown = false;
let sessionToastId: string | number | undefined;

export function errorInterceptor(req: HttpRequest<unknown>, next: HttpHandlerFn) {
  return next(req).pipe(
    catchError((error: any) => {
      if (error instanceof HttpErrorResponse) {
        // Manejo de expiración / no autorizado
        if (error.status === 401 || error.status === 403) {
          if (!sessionPromptShown) {
            sessionPromptShown = true;
            try {
              const router = inject(Router);
              const zone = inject(NgZone);
              const storage = inject(StorageService);
              const currentUrl = router.url || '';
              // Si ya estamos en login, no mostrar el prompt
              if (currentUrl.startsWith('/login')) {
                sessionPromptShown = false;
                return throwError(() => error);
              }
              sessionToastId = toast.error('Sesión expirada. Por favor inicia sesión nuevamente.', {
                duration: 0,
                action: {
                  label: 'Ir a inicio de sesión',
                  onClick: () => {
                    try { if (sessionToastId != null) toast.dismiss(sessionToastId as any); } catch {}
                    try { storage.allClearItems(); } catch {}
                    zone.run(() => {
                      router.navigate(['/login'], { replaceUrl: true }).finally(() => {
                        sessionPromptShown = false;
                      });
                    });
                  }
                }
              });
            } catch {
              // Fallback simple: solo bandera para no spamear
              sessionPromptShown = false;
            }
          }
        }
      }
      return throwError(() => error);
    })
  );
}
