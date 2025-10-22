import { Component, HostListener, inject } from '@angular/core';
import { CommonModule, DatePipe, CurrencyPipe } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Supplier } from '../models/supplier';
import { SupplierService } from '../services/supplier.service';
import { SupplierPaymentsService } from '../services/supplier-payments.service';
import { SupplierPayment } from '../models/supplier-payment';

@Component({
  selector: 'app-supplier-payments-list-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DatePipe, CurrencyPipe, RouterModule],
  templateUrl: './supplier-payments-list-page.component.html'
})
export class SupplierPaymentsListPageComponent {
  private fb = inject(FormBuilder);
  private supplierService = inject(SupplierService);
  private paymentsService = inject(SupplierPaymentsService);

  suppliers: Supplier[] = [];
  payments: SupplierPayment[] = [];

  filter: FormGroup = this.fb.group({
    supplierId: [''],
    from: [''],
    to: ['']
  });

  ngOnInit() {
    this.loadSuppliers();
    this.search();
  }

  loadSuppliers() {
    this.supplierService.list().subscribe(res => this.suppliers = res);
  }

  search() {
    const f = this.filter.value;
    this.paymentsService.list({
      supplierId: f.supplierId || undefined,
      from: f.from || undefined,
      to: f.to || undefined
    }).subscribe(res => this.payments = res);
  }

  clearFilters() {
    this.filter.reset({ supplierId: '', from: '', to: '' });
    this.search();
  }

  openSupport(p: SupplierPayment) {
    if (!p.id) return;
    this.paymentsService.downloadSupport(p.id).subscribe(blob => {
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    });
  }

  @HostListener('document:keydown', ['$event'])
  handleKeys(e: KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); this.search(); }
    if (e.key === 'Escape') { e.preventDefault(); this.clearFilters(); }
  }
}
