import { Component, HostListener, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Supplier } from '../models/supplier';
import { PurchaseInvoice } from '../models/purchase-invoice';
import { PurchasesService } from '../services/purchases.service';
import { SupplierService } from '../services/supplier.service';
import { toast } from 'ngx-sonner';
import { ExpensesFabComponent } from '../../expenses/expenses-fab.component';
import { CurrencyFormatDirective } from '../../directive/currency-format.directive';
import { ProductsSearchModalComponent } from '../../producto/components/products-search-modal/products-search-modal.component';
import { Product } from '../../producto/producto';

@Component({
  selector: 'app-purchase-invoices-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, ExpensesFabComponent, CurrencyFormatDirective, ProductsSearchModalComponent],
  templateUrl: './purchase-invoices-page.component.html'
})
export class PurchaseInvoicesPageComponent {
  private fb = inject(FormBuilder);
  private purchasesService = inject(PurchasesService);
  private supplierService = inject(SupplierService);
  private router = inject(Router);

  @ViewChild(ProductsSearchModalComponent, { static: false }) productsSearchModalComp!: ProductsSearchModalComponent;

  suppliers: Supplier[] = [];
  filteredSuppliers: Supplier[] = [];
  supplierSearchText: string = '';
  showSupplierDropdown: boolean = false;
  selectedSupplier: Supplier | null = null;
  private selectedItemIndexForProductSearch: number | null = null;
  selectedFile: File | null = null;
  uploadedFileUrl: string | null = null;

  form: FormGroup = this.fb.group({
    supplierId: ['', [Validators.required]],
    invoiceNumber: ['', [Validators.required]],
    emissionDate: [this.todayIso(), [Validators.required]],
    paymentType: ['CONTADO', [Validators.required]],
    items: this.fb.array([]),
    notes: [''],
    supportDocument: ['']
  });

  ngOnInit() {
    this.loadSuppliers();
    this.addItem();
  }

  get itemsArray(): FormArray {
    return this.form.get('items') as FormArray;
  }

  get itemsTotal(): number {
    return this.itemsArray.controls.reduce((acc, ctrl) => {
      const g = ctrl as FormGroup;
      const total = Number(g.get('totalCost')?.value || 0);
      return acc + (isFinite(total) ? total : 0);
    }, 0);
  }

  addItem() {
    const g = this.fb.group({
      productId: [''],
      presentationId: ['', [Validators.required]],
      presentationBarcode: [''],
      description: ['', [Validators.required]],
      quantity: [1, [Validators.required, Validators.min(0.01)]],
      unitCost: ['0', [Validators.required]],
      totalCost: [{ value: 0, disabled: true }]
    });
    g.valueChanges.subscribe(() => this.recalcItem(g));
    this.itemsArray.push(g);
  }

  removeItem(index: number) {
    this.itemsArray.removeAt(index);
  }

  openProductsModalForRow(index: number) {
    this.selectedItemIndexForProductSearch = index;
    this.productsSearchModalComp?.openModal();
  }

  onPresentationSelected(mappedProduct: Product) {
    const index = this.selectedItemIndexForProductSearch ?? (this.itemsArray.length > 0 ? this.itemsArray.length - 1 : null);
    if (index === null || index < 0) {
      this.addItem();
      const lastIndex = this.itemsArray.length - 1;
      const g = this.itemsArray.at(lastIndex) as FormGroup;
      g.patchValue({
        productId: mappedProduct.id,
        presentationId: mappedProduct.barcode,
        presentationBarcode: mappedProduct.barcode,
        description: mappedProduct.description
      });
      this.selectedItemIndexForProductSearch = null;
      return;
    }

    const group = this.itemsArray.at(index) as FormGroup | undefined;
    if (!group) {
      return;
    }

    group.patchValue({
      productId: mappedProduct.id,
      presentationId: mappedProduct.barcode,
      presentationBarcode: mappedProduct.barcode,
      description: mappedProduct.description
    });

    this.selectedItemIndexForProductSearch = null;
  }

  recalcItem(g: FormGroup) {
    const qty = Number(g.get('quantity')?.value || 0);
    const unit = this.normalizeToNumber(g.get('unitCost')?.value);
    const total = qty * (unit || 0);
    g.get('totalCost')?.setValue(total, { emitEvent: false });
  }

  loadSuppliers() {
    this.supplierService.list().subscribe(res => {
      this.suppliers = res;
      this.filteredSuppliers = res;
    });
  }

  filterSuppliers(searchText: string) {
    this.supplierSearchText = searchText;
    if (!searchText.trim()) {
      this.filteredSuppliers = this.suppliers;
      this.showSupplierDropdown = false;
      return;
    }
    
    const query = searchText.toLowerCase();
    this.filteredSuppliers = this.suppliers.filter(s => {
      const name = (s.name || '').toLowerCase();
      const idNumber = (s.idNumber || '').toLowerCase();
      const docType = (s.documentType || '').toLowerCase();
      return name.includes(query) || idNumber.includes(query) || docType.includes(query);
    });
    this.showSupplierDropdown = this.filteredSuppliers.length > 0;
  }

  selectSupplier(supplier: Supplier) {
    this.selectedSupplier = supplier;
    this.supplierSearchText = `${supplier.name} (${supplier.documentType} ${supplier.idNumber})`;
    this.form.patchValue({ supplierId: supplier.id });
    this.showSupplierDropdown = false;
  }

  clearSupplierSelection() {
    this.selectedSupplier = null;
    this.supplierSearchText = '';
    this.form.patchValue({ supplierId: '' });
    this.filteredSuppliers = this.suppliers;
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedFile = input.files[0];
      this.form.patchValue({ supportDocument: this.selectedFile.name });
    }
  }

  removeFile() {
    this.selectedFile = null;
    this.uploadedFileUrl = null;
    this.form.patchValue({ supportDocument: '' });
  }

  saveInvoice() {
    if (this.form.invalid || (this.itemsArray.length === 0)) {
      this.form.markAllAsTouched();
      toast.warning('Complete datos obligatorios y agregue al menos un ítem');
      return;
    }
    const raw = this.form.getRawValue();
    console.log('Datos del formulario:', raw);
    console.log('Proveedor seleccionado ID:', raw.supplierId);
    console.log('Lista de proveedores:', this.suppliers);
    
    const selectedSupplier = this.suppliers.find(s => s.id === raw.supplierId);
    console.log('Proveedor encontrado:', selectedSupplier);
    
    if (!selectedSupplier) {
      toast.error('Error: No se encontró el proveedor seleccionado');
      return;
    }
    
    const payload: any = {
      supplier: {
        id: selectedSupplier.id,
        name: selectedSupplier.name
      },
      invoiceNumber: raw.invoiceNumber,
      invoiceDate: raw.emissionDate,
      paymentType: raw.paymentType,
      items: raw.items.map((it: any) => ({
        productId: it.productId,
        presentationId: it.presentationId,
        presentationBarcode: it.presentationBarcode,
        description: it.description,
        quantity: Number(it.quantity),
        unitCost: this.normalizeToNumber(it.unitCost),
        totalCost: Number(it.quantity) * this.normalizeToNumber(it.unitCost)
      })),
      total: raw.items.reduce((acc: number, it: any) => acc + (Number(it.quantity) * this.normalizeToNumber(it.unitCost)), 0),
      notes: raw.notes || '',
      supportDocument: raw.supportDocument || undefined
    };
    
    console.log('Payload a enviar:', payload);

    this.purchasesService.create(payload).subscribe({
      next: (response) => {
        console.log('Respuesta del backend:', response);
        toast.success('Compra registrada');
        this.resetForm();
      },
      error: (error) => {
        console.error('Error al guardar:', error);
        toast.error('Error al guardar la factura');
      }
    });
  }

  resetForm() {
    this.form.reset({
      supplierId: '',
      invoiceNumber: '',
      emissionDate: this.todayIso(),
      paymentType: 'CONTADO',
      notes: '',
      supportDocument: ''
    });
    this.form.setControl('items', this.fb.array([]));
    this.selectedFile = null;
    this.uploadedFileUrl = null;
    this.selectedSupplier = null;
    this.supplierSearchText = '';
    this.filteredSuppliers = this.suppliers;
    this.addItem();
  }

  goToList() {
    this.router.navigate(['/main/compras/facturas/list']);
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
    if (e.key === 'F3') {
      e.preventDefault();
      const index = this.itemsArray.length > 0 ? this.itemsArray.length - 1 : 0;
      if (this.itemsArray.length === 0) {
        this.addItem();
      }
      this.openProductsModalForRow(index);
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

  // Normaliza entrada monetaria con formato a número
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
