import { Component, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Supplier, SupplierStatus } from '../models/supplier';
import { SupplierService } from '../services/supplier.service';
import { toast } from 'ngx-sonner';
import { ExpensesFabComponent } from '../../expenses/expenses-fab.component';

@Component({
  selector: 'app-suppliers-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ExpensesFabComponent],
  templateUrl: './suppliers-page.component.html'
})
export class SuppliersPageComponent {
  private fb = inject(FormBuilder);
  private supplierService = inject(SupplierService);

  suppliers: Supplier[] = [];
  editingId: string | null = null;

  form: FormGroup = this.fb.group({
    name: ['', [Validators.required]],
    documentType: ['NIT', [Validators.required]],
    idNumber: ['', [Validators.required]],
    phone: [''],
    email: ['', [Validators.email]],
    address: ['', [Validators.required]],
    status: ['ACTIVE' as SupplierStatus, [Validators.required]],
  });

  ngOnInit() {
    this.loadSuppliers();
  }

  loadSuppliers() {
    this.supplierService.list().subscribe(res => this.suppliers = res);
  }

  newSupplier() {
    this.editingId = null;
    this.form.reset({
      name: '',
      documentType: 'NIT',
      idNumber: '',
      phone: '',
      email: '',
      address: '',
      status: 'ACTIVE'
    });
  }

  saveSupplier() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      toast.warning('Complete los campos obligatorios');
      return;
    }
    const payload: Supplier = this.form.value as Supplier;
    if (this.editingId) {
      this.supplierService.update(this.editingId, payload).subscribe(() => {
        toast.success('Proveedor actualizado');
        this.loadSuppliers();
        this.newSupplier();
      });
    } else {
      this.supplierService.create(payload).subscribe(() => {
        toast.success('Proveedor creado');
        this.loadSuppliers();
        this.newSupplier();
      });
    }
  }

  editSupplier(s: Supplier) {
    this.editingId = s.id ?? null;
    this.form.patchValue(s);
  }

  toggleStatus(s: Supplier) {
    const next: SupplierStatus = s.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    if (!s.id) return;
    this.supplierService.updateStatus(s.id, next).subscribe(() => {
      toast.success('Estado actualizado');
      this.loadSuppliers();
    });
  }

  cancelEdit() {
    this.newSupplier();
  }

  @HostListener('document:keydown', ['$event'])
  handleKeys(e: KeyboardEvent) {
    // F2 nuevo, F4 guardar, Esc cancelar
    if (e.key === 'F2') {
      e.preventDefault();
      this.newSupplier();
    }
    if (e.key === 'F4') {
      e.preventDefault();
      this.saveSupplier();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      this.cancelEdit();
    }
  }
}
