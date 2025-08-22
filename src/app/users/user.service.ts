import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { User } from '../auth/user';
import { Observable } from 'rxjs';
import { urlConfig } from '../../config/config';

@Injectable({
  providedIn: 'root'
})
export class UserService {
  
  private url: string = urlConfig.microservicioUserUrl();

  constructor(private http: HttpClient) { }

  getAll(): Observable<User[]> {
    return this.http.get<User[]>(`${this.url}`);
  }
}
