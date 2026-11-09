import { Component, ElementRef, HostListener, ViewChild, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { toast } from 'ngx-sonner';
import { Supplier } from '../models/supplier';
import { SupplierService } from '../services/supplier.service';
import { SupplierPaymentsService } from '../services/supplier-payments.service';
import { SupplierPayment, PaymentMethod } from '../models/supplier-payment';
import { BankAccountService } from '../../bank-accounts/services/bank-account.service';
import { BankAccountDto } from '../../bank-accounts/models/bank-account.model';
import { CurrencyFormatDirective } from '../../directive/currency-format.directive';
import { PurchasesService } from '../services/purchases.service';
import { PendingPurchaseInvoice } from '../models/purchase-invoice';

@Component({
  selector: 'app-supplier-payments-page',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, CurrencyFormatDirective],
  templateUrl: './supplier-payments-page.component.html'
})
export class SupplierPaymentsPageComponent implements OnInit {
  private fb = inject(FormBuilder);
  private supplierService = inject(SupplierService);
  private paymentsService = inject(SupplierPaymentsService);
  private bankAccountService = inject(BankAccountService);
  private router = inject(Router);
  private sanitizer = inject(DomSanitizer);
  private purchasesService = inject(PurchasesService);

  suppliers: Supplier[] = [];
  bankAccounts: BankAccountDto[] = [];
  supportFile: File | null = null;

  supplierSearchText = '';
  supplierSuggestions: Supplier[] = [];
  showSupplierDropdown = false;
  selectedSupplier: Supplier | null = null;
  supplierActiveIndex = -1;
  @ViewChild('supplierDropdownEl') supplierDropdownEl?: ElementRef;
  supportPreviewUrl: string | null = null; // object URL para previsualización
  supportMime: string | null = null;
  supportTrustedUrl: SafeResourceUrl | null = null; // para iframes (PDF)

  // Facturas pendientes del proveedor y aplicación del pago
  pendingInvoices: PendingPurchaseInvoice[] = [];
  loadingPending = false;
  showInvoicesModal = false;
  draftSelection = new Map<string, number>(); // purchaseId -> monto (edición en el modal)
  allocations: { invoice: PendingPurchaseInvoice; amount: number }[] = [];
  isSaving = false;

  form: FormGroup = this.fb.group({
    supplierId: ['', [Validators.required]],
    paymentDate: [this.todayIso(), [Validators.required]],
    amount: ['0', [Validators.required]],
    method: ['EFECTIVO' as PaymentMethod, [Validators.required]],
    bankAccountId: [''],
    reference: [''],
    notes: ['']
  });

  ngOnInit() {
    this.loadSuppliers();
    this.loadBankAccounts();
    this.form.get('method')!.valueChanges.subscribe((method: PaymentMethod) => {
      const bankAccountCtrl = this.form.get('bankAccountId');
      if (method === 'EFECTIVO') {
        bankAccountCtrl!.clearValidators();
        bankAccountCtrl!.setValue('');
      } else {
        bankAccountCtrl!.setValidators([Validators.required]);
      }
      bankAccountCtrl!.updateValueAndValidity();
    });
  }

  loadBankAccounts() {
    this.bankAccountService.listActive().subscribe({
      next: (accounts) => {
        this.bankAccounts = accounts;
      },
      error: () => {
        // Silencioso, el selector queda vacío si falla
      }
    });
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
    this.form.patchValue({ supplierId: s.id });
    this.showSupplierDropdown = false;
    this.loadPendingInvoices(s.id!);
  }

  clearSupplierSelection() {
    this.selectedSupplier = null;
    this.supplierSearchText = '';
    this.form.patchValue({ supplierId: '' });
    this.supplierSuggestions = [];
    this.pendingInvoices = [];
    this.allocations = [];
    this.showInvoicesModal = false;
  }

  // ---------------- Facturas pendientes ----------------

  private loadPendingInvoices(supplierId: string) {
    this.pendingInvoices = [];
    this.allocations = [];
    this.loadingPending = true;
    this.purchasesService.listPending(supplierId).subscribe({
      next: (list) => {
        this.pendingInvoices = list;
        this.loadingPending = false;
        if (list.length > 0) this.openInvoicesModal();
      },
      error: () => {
        this.loadingPending = false;
        toast.error('No se pudieron cargar las facturas pendientes del proveedor');
      }
    });
  }

  openInvoicesModal() {
    this.draftSelection = new Map(this.allocations.map(a => [a.invoice.id, a.amount]));
    this.showInvoicesModal = true;
  }

  closeInvoicesModal() {
    this.showInvoicesModal = false;
  }

  isInvoiceSelected(inv: PendingPurchaseInvoice): boolean {
    return this.draftSelection.has(inv.id);
  }

  toggleInvoice(inv: PendingPurchaseInvoice) {
    if (this.draftSelection.has(inv.id)) {
      this.draftSelection.delete(inv.id);
    } else {
      this.draftSelection.set(inv.id, inv.balance);
    }
  }

  get allInvoicesSelected(): boolean {
    return this.pendingInvoices.length > 0 && this.pendingInvoices.every(i => this.draftSelection.has(i.id));
  }

  toggleAllInvoices() {
    if (this.allInvoicesSelected) {
      this.draftSelection.clear();
    } else {
      this.pendingInvoices.forEach(i => { if (!this.draftSelection.has(i.id)) this.draftSelection.set(i.id, i.balance); });
    }
  }

  getDraftAmount(inv: PendingPurchaseInvoice): number {
    return this.draftSelection.get(inv.id) ?? 0;
  }

  setDraftAmount(inv: PendingPurchaseInvoice, value: number | null) {
    if (!this.draftSelection.has(inv.id)) return;
    this.draftSelection.set(inv.id, Math.min(Math.max(value || 0, 0), inv.balance));
  }

  get draftTotal(): number {
    let total = 0;
    this.draftSelection.forEach(v => total += v);
    return total;
  }

  get pendingBalanceTotal(): number {
    return this.pendingInvoices.reduce((s, i) => s + i.balance, 0);
  }

  /** Confirma las facturas seleccionadas; si el monto del pago es menor, lo ajusta al total aplicado */
  confirmInvoices() {
    const selected = this.pendingInvoices
      .filter(i => this.draftSelection.has(i.id) && (this.draftSelection.get(i.id) || 0) > 0)
      .map(i => ({ invoice: i, amount: this.draftSelection.get(i.id)! }));
    if (selected.length === 0) {
      toast.warning('Seleccione al menos una factura o registre el pago como anticipo');
      return;
    }
    this.allocations = selected;
    if (this.paymentAmount < this.allocatedTotal) {
      this.form.patchValue({ amount: this.allocatedTotal });
    }
    this.showInvoicesModal = false;
  }

  /** Registrar el pago sin factura: queda como anticipo del proveedor */
  payAsAdvance() {
    this.allocations = [];
    this.showInvoicesModal = false;
  }

  removeAllocation(purchaseId: string) {
    this.allocations = this.allocations.filter(a => a.invoice.id !== purchaseId);
  }

  get paymentAmount(): number {
    return this.normalizeToNumber(this.form.get('amount')!.value);
  }

  get allocatedTotal(): number {
    return this.allocations.reduce((s, a) => s + a.amount, 0);
  }

  /** Parte del pago que no se aplica a facturas y queda como anticipo */
  get advanceRemainder(): number {
    return Math.max(this.paymentAmount - this.allocatedTotal, 0);
  }

  formatMoney(value: number | null | undefined): string {
    return '$ ' + new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Number(value) || 0);
  }

  hideSupplierDropdownDelayed() {
    setTimeout(() => { this.showSupplierDropdown = false; this.supplierActiveIndex = -1; }, 200);
  }

  onSelectSupportFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] || null;
    this.setSupportFile(file);
  }

  setSupportFile(file: File | null) {
    // limpiar previos
    if (this.supportPreviewUrl) URL.revokeObjectURL(this.supportPreviewUrl);
    this.supportFile = file;
    this.supportPreviewUrl = null;
    this.supportMime = null;
    this.supportTrustedUrl = null;
    if (file) {
      this.supportPreviewUrl = URL.createObjectURL(file);
      this.supportMime = file.type || null;
      if (this.supportMime === 'application/pdf') {
        this.supportTrustedUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.supportPreviewUrl);
      }
    }
  }

  clearSupport() { this.setSupportFile(null); }

  savePayment() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      toast.warning('Complete los campos obligatorios');
      return;
    }
    if (this.paymentAmount <= 0) {
      toast.warning('El monto del pago debe ser mayor a 0');
      return;
    }
    if (this.allocatedTotal - this.paymentAmount > 1) {
      toast.warning(`El monto del pago (${this.formatMoney(this.paymentAmount)}) es menor al total aplicado a facturas (${this.formatMoney(this.allocatedTotal)})`);
      return;
    }
    const raw = this.form.getRawValue();
    const selectedSupplier = this.suppliers.find(s => s.id === raw.supplierId);
    const selectedAccount = this.bankAccounts.find(a => a.id === raw.bankAccountId);
    const payload: SupplierPayment = {
      supplierId: raw.supplierId,
      supplierName: selectedSupplier?.name,
      paymentDate: raw.paymentDate,
      amount: this.normalizeToNumber(raw.amount),
      method: raw.method,
      bankAccountId: raw.method !== 'EFECTIVO' ? raw.bankAccountId || undefined : undefined,
      bankAccountName: raw.method !== 'EFECTIVO' ? selectedAccount?.name || undefined : undefined,
      reference: raw.reference || undefined,
      notes: raw.notes || undefined,
      allocations: this.allocations.map(a => ({ purchaseId: a.invoice.id, amount: a.amount }))
    };
    this.isSaving = true;
    this.paymentsService.create(payload, this.supportFile || undefined).subscribe({
      next: () => {
        const applied = this.allocations.length;
        const advance = this.advanceRemainder;
        if (applied === 0) {
          toast.success('Pago registrado como anticipo');
        } else if (advance > 0) {
          toast.success(`Pago aplicado a ${applied} factura(s); ${this.formatMoney(advance)} quedan como anticipo`);
        } else {
          toast.success(`Pago aplicado a ${applied} factura(s)`);
        }
        this.isSaving = false;
        this.resetForm();
      },
      error: (err) => {
        const msg = typeof err?.error === 'string' ? err.error : err?.error?.message;
        toast.error(msg || 'Error al registrar el pago');
        this.isSaving = false;
      }
    });
  }

  newSupplier() {
    this.router.navigate(['/main/compras/proveedores']);
  }

  goToPaymentsList() {
    this.router.navigate(['/main/compras/pagos-proveedor/list']);
  }

  resetForm() {
    this.form.reset({
      supplierId: '',
      paymentDate: this.todayIso(),
      amount: 0,
      method: 'EFECTIVO',
      bankAccountId: '',
      reference: '',
      notes: ''
    });
    this.form.get('bankAccountId')!.clearValidators();
    this.form.get('bankAccountId')!.updateValueAndValidity();
    this.clearSupport();
    this.clearSupplierSelection();
  }

  get isBankMethod(): boolean {
    return this.form.value.method !== 'EFECTIVO';
  }

  todayIso(): string {
    const d = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  @HostListener('document:keydown', ['$event'])
  handleKeys(e: KeyboardEvent) {
    if (this.showInvoicesModal) {
      if (e.key === 'Escape') { e.preventDefault(); this.closeInvoicesModal(); }
      return;
    }
    if (e.key === 'F4') { e.preventDefault(); this.savePayment(); }
    if (e.key === 'Escape') { e.preventDefault(); this.resetForm(); }
  }

  // Normaliza entrada monetaria (similar a factura): acepta number o string con formato
  private normalizeToNumber(value: unknown): number {
    if (typeof value === 'number') return isFinite(value) ? value : 0;
    if (typeof value === 'string') {
      const raw = value
        .toString()
        .replace(/[\s$\u00A0]/g, '')
        .replace(/\.(?=\d{3}(\D|$))/g, '')
        .replace(/,/g, '.')
        .replace(/[^0-9.\-]/g, '');
      const n = Number(raw);
      return isNaN(n) ? 0 : n;
    }
    return 0;
  }
}
