import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Product, ProductCodeResponse } from './producto';
import { BehaviorSubject, catchError, map, Observable, tap, throwError } from 'rxjs';
import { urlConfig } from '../../config/config';
import { PaginationDto } from '../util/PaginationDto';
import { ProductPrice } from './productoPrice';
import { Vat } from './vat';
import { toast } from 'ngx-sonner';
import { ErrorResponse } from '../util/errorResponse';
import { BarcodeResponse } from './barcode';

@Injectable({
  providedIn: 'root'
})
export class ProductoService {

  private productosSubject = new BehaviorSubject<Product[]>([]);
  private productCodeSubject = new BehaviorSubject<string>('');

  productos$ = this.productosSubject.asObservable();

  productCode$ = this.productCodeSubject.asObservable();

  private url: string = urlConfig.microservicioProductoUrl();

  private urlVatProduct: string = urlConfig.microservicioVatProductUrl();


  constructor(private http: HttpClient) { this.fetchProductCode(); }

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

  getValidatedOrGenerateBarcode(barcode?: string): Observable<string> {
    const endpoint = barcode
      ? `${this.url}/validateOrGenerateBarcode?barcode=${barcode}`
      : `${this.url}/validateOrGenerateBarcode`;

    return this.http.get<BarcodeResponse>(endpoint).pipe(
      map(response => response.barcode),
      catchError((error: HttpErrorResponse) => {
        if (error.status === 409) {
          const barcodeError = error.error as ErrorResponse;
          toast.warning(barcodeError.message);
          return throwError(() => new Error(barcodeError.message));
        }
        const errorMessage = 'Error al validar el código de barras';
        toast.error(errorMessage);
        return throwError(() => new Error(errorMessage));
      })
    );
  }

  fetchProductCode(): void {
    this.http.get<ProductCodeResponse>(`${this.url}/generatedProductCode`).subscribe({
      next: (productCode) => this.productCodeSubject.next(productCode.value),
      error: (error) => toast.error('Error loading el codigo del producto:', error)
    });
  }
}
