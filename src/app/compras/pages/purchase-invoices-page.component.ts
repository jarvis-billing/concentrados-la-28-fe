import { Component, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Supplier } from '../models/supplier';
import { PurchaseInvoice } from '../models/purchase-invoice';
import { PurchasesService } from '../services/purchases.service';
import { SupplierService } from '../services/supplier.service';
import { toast } from 'ngx-sonner';
import { ExpensesFabComponent } from '../../expenses/expenses-fab.component';

@Component({
  selector: 'app-purchase-invoices-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ExpensesFabComponent],
  templateUrl: './purchase-invoices-page.component.html'
})
export class PurchaseInvoicesPageComponent {
  private fb = inject(FormBuilder);
  private purchasesService = inject(PurchasesService);
  private supplierService = inject(SupplierService);

  suppliers: Supplier[] = [];

  form: FormGroup = this.fb.group({
    supplierId: ['', [Validators.required]],
    invoiceNumber: ['', [Validators.required]],
    emissionDate: [this.todayIso(), [Validators.required]],
    paymentType: ['CONTADO', [Validators.required]],
    items: this.fb.array([]),
    notes: ['']
  });

  ngOnInit() {
    this.loadSuppliers();
    this.addItem();
  }

  get itemsArray(): FormArray {
    return this.form.get('items') as FormArray;
  }

  addItem() {
    const g = this.fb.group({
      productId: [''],
      presentationId: ['', [Validators.required]],
      description: ['', [Validators.required]],
      quantity: [1, [Validators.required, Validators.min(0.01)]],
      unitCost: [0, [Validators.required, Validators.min(0)]],
      totalCost: [{ value: 0, disabled: true }]
    });
    g.valueChanges.subscribe(() => this.recalcItem(g));
    this.itemsArray.push(g);
  }

  removeItem(index: number) {
    this.itemsArray.removeAt(index);
  }

  recalcItem(g: FormGroup) {
    const qty = Number(g.get('quantity')?.value || 0);
    const unit = Number(g.get('unitCost')?.value || 0);
    const total = qty * unit;
    g.get('totalCost')?.setValue(total, { emitEvent: false });
  }

  loadSuppliers() {
    this.supplierService.list().subscribe(res => this.suppliers = res);
  }

  saveInvoice() {
    if (this.form.invalid || (this.itemsArray.length === 0)) {
      this.form.markAllAsTouched();
      toast.warning('Complete datos obligatorios y agregue al menos un ítem');
      return;
    }
    const raw = this.form.getRawValue();
    const payload: PurchaseInvoice = {
      id: undefined,
      supplier: this.suppliers.find(s => s.id === raw.supplierId)!,
      invoiceNumber: raw.invoiceNumber,
      emissionDate: raw.emissionDate,
      paymentType: raw.paymentType,
      items: raw.items.map((it: any) => ({
        productId: it.productId,
        presentationId: it.presentationId,
        description: it.description,
        quantity: Number(it.quantity),
        unitCost: Number(it.unitCost),
        totalCost: Number(it.quantity) * Number(it.unitCost)
      })),
      total: raw.items.reduce((acc: number, it: any) => acc + (Number(it.quantity) * Number(it.unitCost)), 0),
      notes: raw.notes || ''
    };

    this.purchasesService.create(payload).subscribe(() => {
      toast.success('Compra registrada');
      this.resetForm();
    });
  }

  resetForm() {
    this.form.reset({
      supplierId: '',
      invoiceNumber: '',
      emissionDate: this.todayIso(),
      paymentType: 'CONTADO',
      notes: ''
    });
    this.form.setControl('items', this.fb.array([]));
    this.addItem();
  }

  todayIso(): string {
    const d = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  // Keyboard: F2 new item, F4 save, Esc cancel
  @HostListener('document:keydown', ['$event'])
  handleKeys(e: KeyboardEvent) {
    if (e.key === 'F2') {
      e.preventDefault();
      this.addItem();
    }
    if (e.key === 'F4') {
      e.preventDefault();
      this.saveInvoice();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      this.resetForm();
    }
  }
}
