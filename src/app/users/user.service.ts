import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { ChangePasswordRequest, CreateUserRequest, UpdateUserRequest, User } from '../auth/user';
import { Observable } from 'rxjs';
import { urlConfig } from '../../config/config';

@Injectable({
  providedIn: 'root'
})
export class UserService {

  private url: string = urlConfig.getUserServiceUrl();

  constructor(private http: HttpClient) { }

  getAll(): Observable<User[]> {
    return this.http.get<User[]>(`${this.url}`);
  }

  getById(id: string): Observable<User> {
    return this.http.get<User>(`${this.url}/${id}`);
  }

  create(request: CreateUserRequest): Observable<User> {
    return this.http.post<User>(`${this.url}`, request);
  }

  update(id: string, request: UpdateUserRequest): Observable<User> {
    return this.http.put<User>(`${this.url}/${id}`, request);
  }

  changePassword(id: string, request: ChangePasswordRequest): Observable<void> {
    return this.http.patch<void>(`${this.url}/${id}/password`, request);
  }

  changeOwnPassword(request: ChangePasswordRequest): Observable<void> {
    return this.http.patch<void>(`${this.url}/me/password`, request);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.url}/${id}`);
  }
}
