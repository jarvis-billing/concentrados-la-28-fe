import { Component, inject, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { toast } from 'ngx-sonner';
import { CompanyService } from '../../services/company.service';
import { Company } from '../../../factura/company';

const PAYMENT_METHODS = ['EFECTIVO', 'TRANSFERENCIA', 'CHEQUE', 'TARJETA_CREDITO', 'TARJETA_DEBITO', 'NEQUI', 'DAVIPLATA'] as const;
const TAX_REGIMES = ['GENERAL', 'SIMPLE', 'ESPECIAL'] as const;
const BILLING_TYPES = ['ELECTRONICA', 'POS'] as const;

export type PageMode = 'view' | 'edit' | 'new';

@Component({
  selector: 'app-company-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DatePipe],
  templateUrl: './company-page.component.html',
  styleUrl: './company-page.component.css'
})
export class CompanyPageComponent implements OnInit {

  private companyService = inject(CompanyService);

  companies: Company[] = [];
  isLoading = false;
  isSaving = false;
  mode: PageMode = 'view';
  editingCompany: Company | null = null;

  paymentMethodOptions = [...PAYMENT_METHODS];
  taxRegimes = [...TAX_REGIMES];
  billingTypes = [...BILLING_TYPES];

  form = new FormGroup({
    nit: new FormControl('', Validators.required),
    businessName: new FormControl('', Validators.required),
    phone: new FormControl(''),
    address: new FormControl(''),
    email: new FormControl('', Validators.email),
    prefixBill: new FormControl(''),
    dianResolutionNumber: new FormControl(''),
    billFrom: new FormControl<number | null>(null),
    billUntil: new FormControl<number | null>(null),
    resolutionExpiresDate: new FormControl(''),
    billingType: new FormControl(''),
    taxRegime: new FormControl(''),
    bank: new FormControl(''),
    bankAccountType: new FormControl(''),
    bankAccountNumber: new FormControl(''),
    isCurrentResolution: new FormControl(false),
  });

  selectedPaymentMethods: Set<string> = new Set();

  get activeCompany(): Company | null {
    return this.companies.find(c => c.status === 'ACTIVO') ?? null;
  }

  get inactiveCompanies(): Company[] {
    return this.companies.filter(c => c.status !== 'ACTIVO');
  }

  ngOnInit(): void {
    this.loadAll();
  }

  loadAll(): void {
    this.isLoading = true;
    this.companyService.list().subscribe({
      next: (list) => {
        this.companies = list;
        this.isLoading = false;
        this.mode = 'view';
      },
      error: () => {
        // Fallback: single-company endpoint
        this.companyService.get().subscribe({
          next: (c) => {
            this.companies = [c];
            this.isLoading = false;
            this.mode = 'view';
          },
          error: () => {
            toast.error('Error al cargar datos de la empresa');
            this.isLoading = false;
          },
        });
      },
    });
  }

  startEdit(company: Company): void {
    this.editingCompany = company;
    this.patchForm(company);
    this.mode = 'edit';
  }

  startNew(): void {
    this.editingCompany = null;
    this.form.reset({ isCurrentResolution: false });
    this.selectedPaymentMethods = new Set();
    if (this.activeCompany) {
      toast.warning(`Registrar una nueva empresa desactivará "${this.activeCompany.businessName}".`, {
        action: { label: 'Entendido', onClick: () => {} },
      });
    }
    this.mode = 'new';
  }

  cancel(): void {
    this.mode = 'view';
    this.editingCompany = null;
  }

  private patchForm(c: Company): void {
    const bc = c.billingConfig;
    this.form.patchValue({
      nit: c.nit,
      businessName: c.businessName,
      phone: c.phone,
      address: c.address,
      email: c.email,
      prefixBill: bc?.prefixBill || '',
      dianResolutionNumber: bc?.dianResolutionNumber || '',
      billFrom: bc?.billFrom || null,
      billUntil: bc?.billUntil || null,
      resolutionExpiresDate: bc?.resolutionExpiresDate ? bc.resolutionExpiresDate.substring(0, 10) : '',
      billingType: bc?.billingType || '',
      taxRegime: bc?.taxRegime || '',
      bank: bc?.bank || '',
      bankAccountType: bc?.bankAccountType || '',
      bankAccountNumber: bc?.bankAccountNumber || '',
      isCurrentResolution: bc?.isCurrentResolution || false,
    });
    this.selectedPaymentMethods = new Set(bc?.paymentMethods || []);
  }

  togglePaymentMethod(method: string): void {
    if (this.selectedPaymentMethods.has(method)) {
      this.selectedPaymentMethods.delete(method);
    } else {
      this.selectedPaymentMethods.add(method);
    }
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.isSaving = true;
    const v = this.form.value;

    const billingConfig = {
      id: this.editingCompany?.billingConfig?.id || '',
      prefixBill: v.prefixBill || '',
      dianResolutionNumber: v.dianResolutionNumber || '',
      billFrom: v.billFrom || 0,
      billUntil: v.billUntil || 0,
      resolutionExpiresDate: v.resolutionExpiresDate || '',
      billingType: v.billingType || '',
      taxRegime: v.taxRegime || '',
      bank: v.bank || '',
      bankAccountType: v.bankAccountType || '',
      bankAccountNumber: v.bankAccountNumber || '',
      isCurrentResolution: v.isCurrentResolution || false,
      paymentMethods: Array.from(this.selectedPaymentMethods),
    };

    const payload: Partial<Company> = {
      nit: v.nit!,
      businessName: v.businessName!,
      phone: v.phone || '',
      address: v.address || '',
      email: v.email || '',
      status: 'ACTIVO',
      billingConfig,
    };

    if (this.mode === 'edit' && this.editingCompany) {
      this.companyService.update(this.editingCompany.id, payload).subscribe({
        next: (updated) => {
          const idx = this.companies.findIndex(c => c.id === updated.id);
          if (idx >= 0) this.companies[idx] = updated;
          toast.success('Empresa actualizada correctamente');
          this.isSaving = false;
          this.mode = 'view';
          this.editingCompany = null;
        },
        error: () => { toast.error('Error al guardar'); this.isSaving = false; },
      });
    } else {
      this.companyService.create(payload).subscribe({
        next: () => {
          toast.success('Nueva empresa registrada y activada');
          this.isSaving = false;
          this.loadAll();
        },
        error: () => { toast.error('Error al crear la empresa'); this.isSaving = false; },
      });
    }
  }

  activateCompany(company: Company): void {
    toast.warning(`¿Activar "${company.businessName}"?`, {
      description: `La empresa activa actual quedará desactivada.`,
      action: {
        label: 'Activar',
        onClick: () => {
          this.companyService.activate(company.id).subscribe({
            next: () => {
              toast.success(`"${company.businessName}" ahora es la empresa activa`);
              this.loadAll();
            },
            error: () => toast.error('Error al activar la empresa'),
          });
        },
      },
    });
  }
}
