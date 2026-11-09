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
    status: [''],
    from: [''],
    to: ['']
  });

  readonly statusOptions = [
    { value: '', label: 'Todos' },
    { value: 'VINCULADO', label: 'Vinculado / aplicado' },
    { value: 'PARCIAL', label: 'Parcial (con anticipo)' },
    { value: 'ADELANTO', label: 'Anticipo sin aplicar' },
    { value: 'CORTE', label: 'Vinculado en corte (sin factura)' },
    { value: 'ANULADO', label: 'Anulado' }
  ];

  ngOnInit() {
    const now = new Date(); // fecha local (no UTC: después de las 7 p.m. saltaba al día siguiente)
    this.today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
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
      status: f.status || undefined,
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
    this.filter.reset({ supplierId: '', bankAccountId: '', status: '', from: this.today, to: this.today });
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

  /** Saldo del pago que sigue disponible como anticipo */
  remainingOf(p: SupplierPayment): number {
    if (p.status === 'ANULADO' || p.status === 'VINCULADO' || p.legacyClosed) return 0;
    return Number(p.remainingAmount ?? p.amount) || 0;
  }

  appliedOf(p: SupplierPayment): number {
    if (p.status === 'ANULADO') return 0;
    const fromApps = (p.applications || []).reduce((s, a) => s + (Number(a.amount) || 0), 0);
    if (fromApps > 0) return fromApps;
    // Vinculado sin detalle de factura: se considera aplicado completo
    if (p.status === 'VINCULADO') return Number(p.amount) || 0;
    return 0;
  }

  hasInvoices(p: SupplierPayment): boolean {
    return !!p.applications?.length;
  }

  statusInfo(p: SupplierPayment): { label: string; css: string; hint: string } {
    switch (p.status) {
      case 'ANULADO':
        return { label: 'Anulado', css: 'bg-danger', hint: 'El pago fue anulado' };
      case 'VINCULADO':
        return this.hasInvoices(p)
          ? { label: 'Aplicado a factura', css: 'bg-success', hint: 'El pago está aplicado por completo' }
          : { label: 'Vinculado sin factura', css: 'bg-secondary',
              hint: p.legacyClosed
                ? 'Pago anterior al corte: se dio por aplicado a facturas anteriores sin detalle de factura'
                : 'El pago está vinculado pero no tiene detalle de factura registrado' };
      case 'PARCIAL':
        return { label: 'Parcial + anticipo', css: 'bg-info text-dark', hint: 'Parte del pago se aplicó y el resto queda como anticipo' };
      default:
        return { label: 'Anticipo sin aplicar', css: 'bg-warning text-dark', hint: 'Todo el pago está disponible para aplicar a facturas' };
    }
  }

  invoiceStatusCss(status?: string): string {
    switch (status) {
      case 'PAGADO': return 'text-success';
      case 'PARCIAL': return 'text-primary';
      case 'SOBREPAGADO': return 'text-danger';
      default: return 'text-warning';
    }
  }

  get totalApplied(): number {
    return this.payments.reduce((sum, p) => sum + this.appliedOf(p), 0);
  }

  get totalAdvance(): number {
    return this.payments.reduce((sum, p) => sum + this.remainingOf(p), 0);
  }
}
