import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Company } from '../../factura/company';
import { Observable } from 'rxjs';
import { urlConfig } from '../../../config/config';

@Injectable({
  providedIn: 'root'
})
export class CompanyService {

  private url: string = urlConfig.getCompanyServiceUrl();

  constructor(private http: HttpClient) { }

  get(): Observable<Company> {
    return this.http.get<Company>(`${this.url}`);
  }

  list(): Observable<Company[]> {
    return this.http.get<Company[]>(`${this.url}/all`);
  }

  create(company: Partial<Company>): Observable<Company> {
    return this.http.post<Company>(`${this.url}`, company);
  }

  update(id: string, company: Partial<Company>): Observable<Company> {
    return this.http.put<Company>(`${this.url}/${id}`, company);
  }

  activate(id: string): Observable<Company> {
    return this.http.patch<Company>(`${this.url}/${id}/activate`, {});
  }

  deactivate(id: string): Observable<Company> {
    return this.http.patch<Company>(`${this.url}/${id}/deactivate`, {});
  }
}
