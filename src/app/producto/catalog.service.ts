import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { urlConfig } from '../../config/config';
import { toast } from 'ngx-sonner';
import { Catalog, CatalogType } from './catalog';


@Injectable({
  providedIn: 'root'
})
export class CatalogService {
  private categoriesSubject = new BehaviorSubject<string[]>([]);
  private brandsSubject = new BehaviorSubject<string[]>([]);

  categories$ = this.categoriesSubject.asObservable();
  brands$ = this.brandsSubject.asObservable();

  private baseUrl = urlConfig.microServiceCatalogUrl();

  constructor(private http: HttpClient) {
    this.loadInitialData();
  }

  private loadInitialData(): void {
    this.fetchCategories();
    this.fetchBrands();
  }

  fetchCategories(): void {
    this.http.get<string[]>(`${this.baseUrl}/categories`).subscribe({
      next: (categories) => this.categoriesSubject.next(categories.sort()),
      error: (error) => toast.error('Error loading categories:', error)
    });
  }

  fetchBrands(): void {
    this.http.get<string[]>(`${this.baseUrl}/brands`).subscribe({
      next: (brands) => this.brandsSubject.next(brands.sort()),
      error: (error) => toast.error('Error loading brands:', error)
    });
  }

  addCategory(categoryValue: string): Observable<string[]> {
    const category: Catalog = {
      value: categoryValue.toUpperCase(),
      type: CatalogType.CATEGORY,
      active: true,
      createdAt: new Date(),
    };

    return this.http.post<string[]>(`${this.baseUrl}/categories`, category).pipe(
      tap(categories => this.categoriesSubject.next(categories.sort()))
    );
  }

  addBrand(brandValue: string): Observable<string[]> {
    const brand: Catalog = {
      value: brandValue.toLocaleUpperCase(),
      type: CatalogType.BRAND,
      active: true,
      createdAt: new Date(),
    };

    return this.http.post<string[]>(`${this.baseUrl}/brands`, brand).pipe(
      tap(brands => {
        this.brandsSubject.next(brands.sort())
      })
    );
  }
}