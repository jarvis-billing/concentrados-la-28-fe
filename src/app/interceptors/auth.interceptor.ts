import { HttpHandlerFn, HttpRequest } from "@angular/common/http";
import { StorageService } from "../services/localStorage.service";
import { inject } from "@angular/core";

export function authInterceptor(req: HttpRequest<unknown>, next: HttpHandlerFn) {
    // Inject the current `StorageService` and use it to get an authentication token:
    const authToken:any = inject(StorageService).get("authToken");
    const tokenType:any = inject(StorageService).get("tokenType");
    // Clone the request to add the authentication header.
    const newReq = req.clone({
      headers: req.headers.append('Authorization', tokenType + ' ' + authToken),
    });
    return next(newReq);
  }