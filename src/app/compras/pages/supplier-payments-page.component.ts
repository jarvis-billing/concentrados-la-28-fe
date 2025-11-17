import { Component, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { toast } from 'ngx-sonner';
import { Supplier } from '../models/supplier';
import { SupplierService } from '../services/supplier.service';
import { SupplierPaymentsService } from '../services/supplier-payments.service';
import { SupplierPayment, PaymentMethod } from '../models/supplier-payment';
import { CurrencyFormatDirective } from '../../directive/currency-format.directive';

@Component({
  selector: 'app-supplier-payments-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, CurrencyFormatDirective],
  templateUrl: './supplier-payments-page.component.html'
})
export class SupplierPaymentsPageComponent {
  private fb = inject(FormBuilder);
  private supplierService = inject(SupplierService);
  private paymentsService = inject(SupplierPaymentsService);
  private router = inject(Router);
  private sanitizer = inject(DomSanitizer);

  suppliers: Supplier[] = [];
  supportFile: File | null = null;
  supportPreviewUrl: string | null = null; // object URL para previsualización
  supportMime: string | null = null;
  supportTrustedUrl: SafeResourceUrl | null = null; // para iframes (PDF)

  form: FormGroup = this.fb.group({
    supplierId: ['', [Validators.required]],
    paymentDate: [this.todayIso(), [Validators.required]],
    amount: ['0', [Validators.required]],
    method: ['EFECTIVO' as PaymentMethod, [Validators.required]],
    reference: [''],
    notes: ['']
  });

  ngOnInit() {
    this.loadSuppliers();
  }

  loadSuppliers() {
    this.supplierService.list().subscribe(res => this.suppliers = res);
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
    const raw = this.form.getRawValue();
    const selectedSupplier = this.suppliers.find(s => s.id === raw.supplierId);
    const payload: SupplierPayment = {
      supplierId: raw.supplierId,
      supplierName: selectedSupplier?.name,
      paymentDate: raw.paymentDate,
      amount: this.normalizeToNumber(raw.amount),
      method: raw.method,
      reference: raw.reference || undefined,
      notes: raw.notes || undefined
    };
    this.paymentsService.create(payload, this.supportFile || undefined).subscribe(() => {
      toast.success('Pago registrado');
      this.resetForm();
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
      reference: '',
      notes: ''
    });
    this.clearSupport();
  }

  todayIso(): string {
    const d = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  @HostListener('document:keydown', ['$event'])
  handleKeys(e: KeyboardEvent) {
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
