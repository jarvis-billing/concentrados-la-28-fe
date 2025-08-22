import { Injectable } from '@angular/core';
import { urlConfig } from '../../config/config';
import { HttpClient, HttpParams } from '@angular/common/http';
import { catchError, Observable, tap, throwError } from 'rxjs';
import { Order } from './orden';
import { handleError } from '../util/manejador.error.util';
import { PaginationDto } from '../util/PaginationDto';

@Injectable({
  providedIn: 'root'
})
export class OrdenService {

  private url: string = urlConfig.microservicioOrdenUrl();

  constructor(private http: HttpClient) { }

  startOrder(): Observable<Order> {
    return this.http.get<Order>(`${this.url}/startOrder`);
  }

  findByNumeroOrden(orderNumber: string): Observable<Order> {
    return this.http.get<Order>(`${this.url}/findByOrderNumber/${orderNumber}`);
  }

  findByOrderStatus(orderStatus: string): Observable<Order[]> {
    return this.http.get<Order[]>(`${this.url}/findByOrderStatus/${orderStatus}`).pipe(
      tap((response) => {
          console.log('Response from API:', response);
      }),
      catchError((error) => {
          console.log('Error occurred:', error);
          return throwError(error);
      })
    );
  }

  ordersFinished(pageNumber: number, pageSize: number): Observable<PaginationDto<Order>> {
    const params = new HttpParams()
      .set('page-number', pageNumber.toString())
      .set('page-size', pageSize.toString());
  
    return this.http.get<PaginationDto<Order>>(`${this.url}/ordersFinished`, {params}).pipe(
      tap((response) => {
          console.log('Response from API:', response);
      }),
      catchError((error) => {
          console.log('Error occurred:', error);
          return throwError(error);
      })
    );
  }

  getAll(): Observable<Order[]> {
    return this.http.get<Order[]>(this.url);
  }

  create(order: Order): Observable<Order> {
    return this.http.post<Order>(this.url, order);
  }

  get(id: string): Observable<Order> {
    return this.http.get<Order>(`${this.url}/${id}`);
  }

  update(order: Order, id: string): Observable<Order> {
    return this.http.put<Order>(`${this.url}/${id}`, order);
  }

  delete(id: string): Observable<Order> {
    return this.http.delete<Order>(`${this.url}/${id}`);
  }

  endOrder(id: number): Observable<Order> {
    return this.http.put<Order>(`${this.url}/endOrder/${id}`, null);
  }
}
