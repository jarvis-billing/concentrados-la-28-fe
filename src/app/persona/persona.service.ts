import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Persona } from './persona';
import { urlConfig } from '../../config/config';

@Injectable({
  providedIn: 'root'
})
export class PersonaService {

  private url: string = urlConfig.getPersonServiceUrl();

  constructor(private http: HttpClient) { }

  getAll(): Observable<Persona[]> {
    return this.http.get<Persona[]>(this.url);
  }

  create(fichaCatastral: Persona): Observable<Persona> {
    return this.http.post<Persona>(this.url, fichaCatastral);
  }

  get(id: string): Observable<Persona> {
    return this.http.get<Persona>(`${this.url}/${id}`);
  }

  update(fichaCatastral: Persona, id: string): Observable<Persona> {
    return this.http.put<Persona>(`${this.url}/${id}`, fichaCatastral);
  }

  delete(id: string): Observable<Persona> {
    return this.http.delete<Persona>(`${this.url}/${id}`);
  }

  findByNumeroDocumento(numeroDocumento: string): Observable<Persona[]> { 
    return this.http.get<Persona[]>(`${this.url}/findByDocumentNumber/${numeroDocumento}`);
  }

}
