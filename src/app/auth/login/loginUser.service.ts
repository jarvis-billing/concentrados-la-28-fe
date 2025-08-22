import { Injectable } from '@angular/core';
import { urlConfig } from '../../../config/config';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { LoginUser } from './loginUser';
import { TokenLoginUser } from '../TokenLoginUser';


@Injectable({
    providedIn: 'root'
})

export class LoginUserService {

    private url: string = urlConfig.microservicioLoginUrl();

    constructor(private http: HttpClient) {}

    login(loginUser: LoginUser): Observable<TokenLoginUser> {
        return this.http.post<TokenLoginUser>(`${this.url}/login`, loginUser);
    }

    getUserFromToken(): any {
        const token = localStorage.getItem('authToken'); // Usa la clave que hayas guardado para el token.
        
        if (token) {
          // Extraer el payload, que es la segunda parte del JWT.
          const payload = token.split('.')[1];
          // Decodificar el payload de Base64
          const decodedPayload = atob(payload);
          // Convertir el JSON decodificado a un objeto
          const payloadObj = JSON.parse(decodedPayload);
          
          const sub = payloadObj.sub; // Extraer el sub
          const user = payloadObj[sub]; // Acceder al objeto de usuario usando sub como clave
          return user || null;
        }
        
        return null; // Si no hay token, devolver null
      }

}
