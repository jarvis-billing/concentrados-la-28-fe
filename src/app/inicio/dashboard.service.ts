import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, forkJoin, map, of, catchError } from 'rxjs';
import { urlConfig } from '../../config/config';
import { Billing, BillingReportFilter } from '../factura/billing';
import { StockAlert } from '../inventario/models/inventory-dashboard';

export interface DashboardStats {
  salesToday: number;
  salesThisWeek: number;
  salesThisMonth: number;
  invoicesToday: number;
  productsCount: number;
  lowStockCount: number;
}

export interface DashboardData {
  stats: DashboardStats;
  recentInvoices: Billing[];
  stockAlerts: StockAlert[];
}

@Injectable({
  providedIn: 'root'
})
export class DashboardService {
  private http = inject(HttpClient);
  private saleUrl = urlConfig.getSaleServiceUrl();
  private productUrl = urlConfig.getProductServiceUrl();
  private inventoryUrl = urlConfig.getInventoryServiceUrl();

  getDashboardData(): Observable<DashboardData> {
    const today = new Date();
    const startOfDay = this.formatDate(today);
    const startOfWeek = this.formatDate(this.getStartOfWeek(today));
    const startOfMonth = this.formatDate(this.getStartOfMonth(today));
    const endDate = this.formatDate(today);

    const todayFilter: BillingReportFilter = { 
      fromDate: startOfDay, 
      toDate: endDate,
      billNumber: '',
      userSale: '',
      client: '',
      product: ''
    };

    const weekFilter: BillingReportFilter = { 
      fromDate: startOfWeek, 
      toDate: endDate,
      billNumber: '',
      userSale: '',
      client: '',
      product: ''
    };

    const monthFilter: BillingReportFilter = { 
      fromDate: startOfMonth, 
      toDate: endDate,
      billNumber: '',
      userSale: '',
      client: '',
      product: ''
    };

    console.log('Dashboard filters:', { todayFilter, weekFilter, monthFilter });

    return forkJoin({
      salesToday: this.getSales(todayFilter),
      salesWeek: this.getSales(weekFilter),
      salesMonth: this.getSales(monthFilter),
      products: this.getProductsCount(),
      stockAlerts: this.getStockAlerts()
    }).pipe(
      map(results => {
        console.log('Dashboard results:', {
          salesToday: results.salesToday.length,
          salesWeek: results.salesWeek.length,
          salesMonth: results.salesMonth.length
        });

        const salesTodayTotal = results.salesToday.reduce((sum, b) => sum + (b.totalBilling || 0), 0);
        const salesWeekTotal = results.salesWeek.reduce((sum, b) => sum + (b.totalBilling || 0), 0);
        const salesMonthTotal = results.salesMonth.reduce((sum, b) => sum + (b.totalBilling || 0), 0);

        return {
          stats: {
            salesToday: salesTodayTotal,
            salesThisWeek: salesWeekTotal,
            salesThisMonth: salesMonthTotal,
            invoicesToday: results.salesToday.length,
            productsCount: results.products,
            lowStockCount: results.stockAlerts.length
          },
          recentInvoices: results.salesToday.slice(0, 5),
          stockAlerts: results.stockAlerts.slice(0, 5)
        };
      })
    );
  }

  private getSales(filter: BillingReportFilter): Observable<Billing[]> {
    return this.http.post<Billing[]>(`${this.saleUrl}/report/list-sales`, filter).pipe(
      catchError(() => of([]))
    );
  }

  private getProductsCount(): Observable<number> {
    return this.http.get<any[]>(this.productUrl).pipe(
      map(products => products?.length || 0),
      catchError(() => of(0))
    );
  }

  private getStockAlerts(): Observable<StockAlert[]> {
    return this.http.get<StockAlert[]>(`${this.inventoryUrl}/stock-alerts`).pipe(
      catchError(() => of([]))
    );
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private getStartOfWeek(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return d;
  }

  private getStartOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }
}
