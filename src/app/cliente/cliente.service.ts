import { Injectable } from '@angular/core';
import { urlConfig } from '../../config/config';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Client, SearchCriteriaClient } from './cliente';

@Injectable({
  providedIn: 'root'
})
export class ClienteService {

  private url: string = urlConfig.getClientServiceUrl();

  constructor(private http: HttpClient) { }

  getAll(): Observable<Client[]> {
    return this.http.get<Client[]>(`${this.url}`);
  }

  searchClient(searchCriteriaClient: SearchCriteriaClient): Observable<Client> {
    return this.http.post<Client>(`${this.url}/search`, searchCriteriaClient);
  }

  findByDocument(searchCriteriaClient: SearchCriteriaClient): Observable<Client> {
    return this.http.post<Client>(`${this.url}/findByDocument`, searchCriteriaClient);
  }

  create(client: Client): Observable<Client> {
    return this.http.post<Client>(`${this.url}`, client);
  }

  update(client: Client): Observable<Client> {
    const id = client.id || client.idNumber;
    return this.http.put<Client>(`${this.url}/${id}`, client);
  }
}
