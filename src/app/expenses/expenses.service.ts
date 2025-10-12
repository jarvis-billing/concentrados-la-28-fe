import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { Expense } from './expense';
import { urlConfig } from '../../config/config';

@Injectable({ providedIn: 'root' })
export class ExpensesService {
  private url: string = `${urlConfig.urlServer}/api/expenses`;

  constructor(private http: HttpClient) {}

  save(expense: Expense): Observable<Expense> {
    return this.http.post<Expense>(this.url, expense);
  }

  update(id: string, expense: Partial<Expense>): Observable<Expense> {
    return this.http.put<Expense>(`${this.url}/${id}`, expense);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.url}/${id}`);
  }

  list(filter?: { fromDate?: string; toDate?: string; category?: string; page?: number; size?: number; sort?: string }): Observable<Expense[]> {
    let params = new HttpParams();
    if (filter?.fromDate) params = params.set('fromDate', filter.fromDate);
    if (filter?.toDate) params = params.set('toDate', filter.toDate);
    if (filter?.category) params = params.set('category', filter.category);
    if (filter?.page !== undefined) params = params.set('page', String(filter.page));
    if (filter?.size !== undefined) params = params.set('size', String(filter.size));
    if (filter?.sort) params = params.set('sort', filter.sort);

    return this.http.get<any>(this.url, { params }).pipe(
      map(res => Array.isArray(res) ? res as Expense[] : (res?.items as Expense[] ?? []))
    );
  }

  categories(): Observable<string[]> {
    return this.http.get<string[]>(`${this.url}/categories`);
  }
}
