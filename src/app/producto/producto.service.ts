import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { EVat, Product } from './producto';
import { BehaviorSubject, map, Observable, tap } from 'rxjs';
import { urlConfig } from '../../config/config';
import { PaginationDto } from '../util/PaginationDto';
import { ProductPrice } from './productoPrice';
import { Vat } from './vat';

@Injectable({
  providedIn: 'root'
})
export class ProductoService {
   
  private productosSubject = new BehaviorSubject<Product[]>([]);
  productos$ = this.productosSubject.asObservable();

  private url: string = urlConfig.microservicioProductoUrl();

  private urlVatProduct: string = urlConfig.microservicioVatProductUrl();


  constructor(private http: HttpClient) {}

  // Inicializa o refresca la lista
  fetchAll(): void {
    this.http.get<Product[]>(this.url).subscribe(productos => {
      this.productosSubject.next(productos);
    });
  }


  getProductByBarcode(barcode: string): Observable<Product> {
    return this.http.get<Product>(`${this.url}/findByBarcode/${barcode}`);
  }

  getAll(): Observable<Product[]> {
    return this.http.get<Product[]>(this.url);
  }

  getAllPage(pageNumber: number, pageSize: number): Observable<PaginationDto<Product>> {
    const params = new HttpParams()
      .set('page-number', pageNumber.toString())
      .set('page-size', pageSize.toString());

    return this.http.get<PaginationDto<Product>>(`${this.url}/paginate`, { params });
  }

  getAllPageSearch(pageNumber: number, pageSize: number, search: string): Observable<PaginationDto<Product>> {
    const params = new HttpParams()
      .set('page-number', pageNumber.toString())
      .set('page-size', pageSize.toString());

    return this.http.get<PaginationDto<Product>>(`${this.url}/paginateSearch/${search}`, { params });
  }

  create(product: Product): Observable<Product> {
    return this.http.post<Product>(this.url, product).pipe(
      tap(() => this.fetchAll()) // recarga el listado
    );
  }

  get(id: string): Observable<Product> {
    return this.http.get<Product>(`${this.url}/${id}`);
  }

  update(product: Product, id?: string): Observable<Product> {
    return this.http.put<Product>(`${this.url}/${id}`, product);
  }

  updatePriceByIds(productPrice: ProductPrice): Observable<Product> {
    return this.http.post<Product>(`${this.url}/updatePrice`, productPrice);
  }

  delete(id: string): Observable<Product> {
    return this.http.delete<Product>(`${this.url}/${id}`);
  }

  getAllVatProduct(): Observable<Vat[]> {
    return this.http.get<Vat[]>(this.urlVatProduct);
  }
}
