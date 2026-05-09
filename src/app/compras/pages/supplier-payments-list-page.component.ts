import { Component, ElementRef, HostListener, ViewChild, inject } from '@angular/core';
import { CommonModule, DatePipe, CurrencyPipe } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Supplier } from '../models/supplier';
import { SupplierService } from '../services/supplier.service';
import { SupplierPaymentsService } from '../services/supplier-payments.service';
import { SupplierPayment } from '../models/supplier-payment';
import { BankAccountService } from '../../bank-accounts/services/bank-account.service';
import { BankAccountDto } from '../../bank-accounts/models/bank-account.model';

@Component({
  selector: 'app-supplier-payments-list-page',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, DatePipe, CurrencyPipe, RouterModule],
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

  supplierSearchText = '';
  supplierSuggestions: Supplier[] = [];
  showSupplierDropdown = false;
  selectedSupplier: Supplier | null = null;
  supplierActiveIndex = -1;
  @ViewChild('supplierDropdownEl') supplierDropdownEl?: ElementRef;

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

  onSupplierSearchInput() {
    const q = this.supplierSearchText.trim().toLowerCase();
    this.supplierActiveIndex = -1;
    if (!q) { this.supplierSuggestions = []; this.showSupplierDropdown = false; return; }
    this.supplierSuggestions = this.suppliers.filter(s =>
      (s.name || '').toLowerCase().includes(q) ||
      (s.idNumber || '').toLowerCase().includes(q)
    ).slice(0, 8);
    this.showSupplierDropdown = true;
  }

  onSupplierKeydown(event: KeyboardEvent) {
    if (!this.showSupplierDropdown) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.supplierActiveIndex = Math.min(this.supplierActiveIndex + 1, this.supplierSuggestions.length - 1);
      this.scrollDropdownItem(this.supplierDropdownEl, this.supplierActiveIndex);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.supplierActiveIndex = Math.max(this.supplierActiveIndex - 1, -1);
      this.scrollDropdownItem(this.supplierDropdownEl, this.supplierActiveIndex);
    } else if (event.key === 'Enter' && this.supplierActiveIndex >= 0) {
      event.preventDefault();
      this.selectSupplierFromAutocomplete(this.supplierSuggestions[this.supplierActiveIndex]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.showSupplierDropdown = false;
      this.supplierActiveIndex = -1;
    }
  }

  private scrollDropdownItem(ref: ElementRef | undefined, index: number): void {
    if (!ref || index < 0) return;
    const item = ref.nativeElement.children[index] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }

  selectSupplierFromAutocomplete(s: Supplier) {
    this.selectedSupplier = s;
    this.supplierSearchText = `${s.name} (${s.documentType} ${s.idNumber})`;
    this.filter.patchValue({ supplierId: s.id });
    this.showSupplierDropdown = false;
  }

  clearSupplierSelection() {
    this.selectedSupplier = null;
    this.supplierSearchText = '';
    this.filter.patchValue({ supplierId: '' });
    this.supplierSuggestions = [];
  }

  hideSupplierDropdownDelayed() {
    setTimeout(() => { this.showSupplierDropdown = false; this.supplierActiveIndex = -1; }, 200);
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
    this.clearSupplierSelection();
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
