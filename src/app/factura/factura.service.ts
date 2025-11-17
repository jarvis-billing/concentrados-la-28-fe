import { Injectable } from '@angular/core';
import { urlConfig } from '../../config/config';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Billing, BillingReportFilter, ProductSalesSummary } from './billing';

@Injectable({
  providedIn: 'root'
})
export class FacturaService {

  private url: string = urlConfig.getSaleServiceUrl();
  private pdfSrc: any;

  constructor(private http: HttpClient) { }

  importOrdenToSale(orderNumber: number): Observable<Billing> {
    return this.http.get<Billing>(`${this.url}/importOrdenToSale/${orderNumber}`);  
  }

  save(factura: Billing): Observable<Billing> {
    return this.http.post<Billing>(this.url, factura);
  }

  getLastBillingNumber(): Observable<any> {
    return this.http.get<any>(`${this.url}/lastBillingNumber`);
  }

  printTicketBilling(billing: Billing): Observable<any> {
    const headers = new HttpHeaders({
      'Accept': 'application/pdf'
    });
    return this.http.post(`${this.url}/print/ticket-billing`, billing, {
      headers,
      responseType: 'blob'
    });
  }

  getBillingByNumber(billingNumber: string): Observable<Billing> {
    return this.http.get<Billing>(`${this.url}/find-billing/${billingNumber}`);
  }

  findAllBilling(filterReport: BillingReportFilter): Observable<Billing[]> {
    return this.http.post<Billing[]>(`${this.url}/report/list-sales`, filterReport);
  }

  generatedTicketBilling(billing: Billing) {
    this.printTicketBilling(billing).subscribe(printPDF => {
      this.pdfSrc = URL.createObjectURL(printPDF);
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = this.pdfSrc;
      document.body.appendChild(iframe);
      iframe?.contentWindow?.print();
    });
  }

  getProductSalesSummary(filterReport: BillingReportFilter): Observable<ProductSalesSummary[]> {
    return this.http.post<ProductSalesSummary[]>(`${this.url}/report/product/summary`, filterReport);
  }
}
