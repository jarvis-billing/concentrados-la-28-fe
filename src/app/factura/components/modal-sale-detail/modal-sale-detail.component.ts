import { Component, Input } from '@angular/core';
import { SaleDetail } from '../../saleDetail';
import { CurrencyPipe } from '@angular/common';

@Component({
  selector: 'app-modal-sale-detail',
  standalone: true,
  imports: [CurrencyPipe],
  templateUrl: './modal-sale-detail.component.html',
  styleUrl: './modal-sale-detail.component.css'
})
export class ModalSaleDetailComponent {

  @Input() saleDetails: SaleDetail[] = [];

  @Input() billingNumber: String = '';
  
  closeSaleDetailModal(): void {
    const modal = document.getElementById('modalSaleDetail');
    if (modal) {
      modal.classList.remove('show');
      modal.style.display = 'none';
    }
  }
}
