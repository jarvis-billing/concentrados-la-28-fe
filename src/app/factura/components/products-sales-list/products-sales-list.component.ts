import { Component, inject, OnInit } from '@angular/core';
import { FacturaService } from '../../factura.service';
import { BillingReportFilter, ProductSalesSummary } from '../../billing';
import { FormsModule } from '@angular/forms';
import { CurrencyPipe } from '@angular/common';
import { LoginUserService } from '../../../auth/login/loginUser.service';
import { toast } from 'ngx-sonner';

@Component({
  selector: 'app-products-sales-list',
  standalone: true,
  imports: [FormsModule, CurrencyPipe],
  templateUrl: './products-sales-list.component.html',
  styleUrl: './products-sales-list.component.css'
})
export class ProductsSalesListComponent implements OnInit {

  facturaService = inject(FacturaService);
  loginUserService = inject(LoginUserService);

  listProductsSales: ProductSalesSummary[] = [];
  filterReport: BillingReportFilter = new BillingReportFilter();
  today: string = '';

  isLoading: boolean = false;
  userLogin = this.loginUserService.getUserFromToken();

  loadListProductsSales() {
    this.isLoading = true;
    this.facturaService.getProductSalesSummary(this.filterReport).subscribe(productsSaled => {
      
      this.listProductsSales = productsSaled;
      this.isLoading = false;
      if (this.listProductsSales.length === 0) {
        toast.error('No se encontraron productos vendidos para el filtro seleccionado.');
      }


    });
  }

  ngOnInit(): void {
    const now = new Date();
    this.today = now.toISOString().split('T')[0];
  }

  calculateTotalSales(): number {
    return this.listProductsSales.reduce((total, product) => {
      return total + (product.totalAmount * product.unitPrice);
    }, 0);
  }
}
