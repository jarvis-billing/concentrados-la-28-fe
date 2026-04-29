import { Component, HostListener, inject } from '@angular/core';
import { CommonModule, DatePipe, CurrencyPipe } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Supplier } from '../models/supplier';
import { SupplierService } from '../services/supplier.service';
import { SupplierPaymentsService } from '../services/supplier-payments.service';
import { SupplierPayment } from '../models/supplier-payment';
import { BankAccountService } from '../../bank-accounts/services/bank-account.service';
import { BankAccountDto } from '../../bank-accounts/models/bank-account.model';

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
  private bankAccountService = inject(BankAccountService);

  suppliers: Supplier[] = [];
  bankAccounts: BankAccountDto[] = [];
  payments: SupplierPayment[] = [];
  today: string = '';

  filter: FormGroup = this.fb.group({
    supplierId: [''],
    bankAccountId: [''],
    from: [''],
    to: ['']
  });

  ngOnInit() {
    this.today = new Date().toISOString().split('T')[0];
    this.filter.patchValue({ from: this.today, to: this.today });
    this.loadSuppliers();
    this.loadBankAccounts();
    this.search();
  }

  loadSuppliers() {
    this.supplierService.list().subscribe(res => this.suppliers = res);
  }

  loadBankAccounts() {
    this.bankAccountService.listActive().subscribe(res => this.bankAccounts = res);
  }

  search() {
    const f = this.filter.value;
    this.paymentsService.list({
      supplierId: f.supplierId || undefined,
      bankAccountId: f.bankAccountId || undefined,
      from: f.from || undefined,
      to: f.to || undefined
    }).subscribe(res => {
      this.payments = res.sort((a, b) => {
        const dateA = new Date(a.paymentDate || 0).getTime();
        const dateB = new Date(b.paymentDate || 0).getTime();
        return dateB - dateA;
      });
    });
  }

  clearFilters() {
    this.filter.reset({ supplierId: '', bankAccountId: '', from: this.today, to: this.today });
    this.search();
  }

  getBankAccountName(id?: string): string {
    if (!id) return '-';
    const account = this.bankAccounts.find(a => a.id === id);
    return account ? `${account.name} — ${account.bankName}` : id;
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

  get totalAmount(): number {
    return this.payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  }
}
