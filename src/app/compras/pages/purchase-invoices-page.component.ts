import { Component, HostListener, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Supplier } from '../models/supplier';
import { PurchaseInvoice } from '../models/purchase-invoice';
import { PurchasesService } from '../services/purchases.service';
import { SupplierService } from '../services/supplier.service';
import { toast } from 'ngx-sonner';
import { ExpensesFabComponent } from '../../expenses/expenses-fab.component';
import { CurrencyFormatDirective } from '../../directive/currency-format.directive';
import { ProductsSearchModalComponent } from '../../producto/components/products-search-modal/products-search-modal.component';
import { Product } from '../../producto/producto';
import { BatchService } from '../../lotes/services/batch.service';
import { BATCH_REQUIRED_CATEGORY, CreateBatchRequest } from '../../lotes/models/batch';
import { BatchExpirationAlertComponent } from '../../lotes/components/batch-expiration-alert/batch-expiration-alert.component';
import { Subscription, debounceTime } from 'rxjs';

@Component({
  selector: 'app-purchase-invoices-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, ExpensesFabComponent, CurrencyFormatDirective, ProductsSearchModalComponent, BatchExpirationAlertComponent],
  templateUrl: './purchase-invoices-page.component.html'
})
export class PurchaseInvoicesPageComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private purchasesService = inject(PurchasesService);
  private supplierService = inject(SupplierService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private batchService = inject(BatchService);

  @ViewChild(ProductsSearchModalComponent, { static: false }) productsSearchModalComp!: ProductsSearchModalComponent;

  suppliers: Supplier[] = [];
  filteredSuppliers: Supplier[] = [];
  supplierSearchText: string = '';
  showSupplierDropdown: boolean = false;
  selectedSupplier: Supplier | null = null;
  private selectedItemIndexForProductSearch: number | null = null;
  selectedFile: File | null = null;
  uploadedFileUrl: string | null = null;

  // Modo edición
  isEditMode = false;
  editingInvoiceId: string | null = null;
  existingItems: any[] = []; // Items originales de la factura (solo lectura)

  // Autoguardado
  private readonly AUTOSAVE_KEY = 'purchase_invoice_draft';
  private autoSaveSubscription?: Subscription;
  hasRestoredDraft = false;
  lastAutoSaveTime: Date | null = null;

  // Lotes de animales vivos
  pendingBatchItems: { productId: string; description: string; quantity: number; category: string }[] = [];
  showBatchPriceModal = false;
  currentBatchItem: { productId: string; description: string; quantity: number } | null = null;
  batchSalePrice: number = 0;
  batchPriceValidityDays: number = 8; // Días de validez del precio (configurable)

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
    
    // Verificar si estamos en modo edición
    const invoiceId = this.route.snapshot.paramMap.get('id');
    if (invoiceId) {
      this.isEditMode = true;
      this.editingInvoiceId = invoiceId;
      this.loadInvoiceForEdit(invoiceId);
    } else {
      // Modo creación: verificar si hay borrador guardado
      this.checkForDraft();
      this.addItem();
    }
    
    // Configurar autoguardado (solo en modo creación)
    if (!this.isEditMode) {
      this.setupAutoSave();
    }
  }

  ngOnDestroy() {
    this.autoSaveSubscription?.unsubscribe();
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
      totalCost: [{ value: 0, disabled: true }],
      category: ['']
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
        description: mappedProduct.description,
        category: mappedProduct.category || ''
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
      description: mappedProduct.description,
      category: mappedProduct.category || ''
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
    // En modo edición, validar que haya nuevos items para agregar
    const hasNewItems = this.itemsArray.controls.some(ctrl => {
      const g = ctrl as FormGroup;
      return g.get('description')?.value && g.get('presentationId')?.value;
    });

    if (this.isEditMode) {
      if (!hasNewItems) {
        toast.warning('Agregue al menos un nuevo producto para guardar');
        return;
      }
    } else {
      if (this.form.invalid || (this.itemsArray.length === 0)) {
        this.form.markAllAsTouched();
        toast.warning('Complete datos obligatorios y agregue al menos un ítem');
        return;
      }
    }

    const raw = this.form.getRawValue();
    
    // Filtrar items vacíos
    const validItems = raw.items.filter((it: any) => it.description && it.presentationId);
    
    if (validItems.length === 0) {
      toast.warning('Agregue al menos un producto válido');
      return;
    }

    const selectedSupplier = this.suppliers.find(s => s.id === raw.supplierId);
    
    if (!selectedSupplier) {
      toast.error('Error: No se encontró el proveedor seleccionado');
      return;
    }

    const mappedItems = validItems.map((it: any) => ({
      productId: it.productId,
      presentationId: it.presentationId,
      presentationBarcode: it.presentationBarcode,
      description: it.description,
      quantity: Number(it.quantity),
      unitCost: this.normalizeToNumber(it.unitCost),
      totalCost: Number(it.quantity) * this.normalizeToNumber(it.unitCost)
    }));

    if (this.isEditMode && this.editingInvoiceId) {
      // Modo edición: agregar nuevos items a factura existente
      this.addItemsToExistingInvoice(mappedItems, validItems);
    } else {
      // Modo creación: crear nueva factura
      this.createNewInvoice(raw, selectedSupplier, mappedItems, validItems);
    }
  }

  private createNewInvoice(raw: any, selectedSupplier: any, mappedItems: any[], validItems: any[]): void {
    const payload: any = {
      supplier: {
        id: selectedSupplier.id,
        name: selectedSupplier.name
      },
      invoiceNumber: raw.invoiceNumber,
      invoiceDate: raw.emissionDate,
      paymentType: raw.paymentType,
      items: mappedItems,
      total: mappedItems.reduce((acc: number, it: any) => acc + it.totalCost, 0),
      notes: raw.notes || '',
      supportDocument: raw.supportDocument || undefined
    };

    this.purchasesService.create(payload).subscribe({
      next: (response) => {
        toast.success('Compra registrada');
        this.clearDraft();
        
        // Detectar productos de ANIMALES VIVOS para crear lotes
        const batchItems = validItems.filter((it: any) => 
          it.category?.toUpperCase() === BATCH_REQUIRED_CATEGORY
        );
        
        if (batchItems.length > 0) {
          this.pendingBatchItems = batchItems.map((it: any) => ({
            productId: it.productId,
            description: it.description,
            quantity: Number(it.quantity),
            category: it.category
          }));
          this.processNextBatchItem();
        } else {
          this.resetForm();
        }
      },
      error: (error) => {
        console.error('Error al guardar:', error);
        toast.error('Error al guardar la factura');
      }
    });
  }

  private addItemsToExistingInvoice(mappedItems: any[], validItems: any[]): void {
    this.purchasesService.addItems(this.editingInvoiceId!, mappedItems).subscribe({
      next: (response) => {
        toast.success(`${mappedItems.length} producto(s) agregado(s) a la factura`);
        
        // Detectar productos de ANIMALES VIVOS para crear lotes
        const batchItems = validItems.filter((it: any) => 
          it.category?.toUpperCase() === BATCH_REQUIRED_CATEGORY
        );
        
        if (batchItems.length > 0) {
          this.pendingBatchItems = batchItems.map((it: any) => ({
            productId: it.productId,
            description: it.description,
            quantity: Number(it.quantity),
            category: it.category
          }));
          this.processNextBatchItem();
        } else {
          this.router.navigate(['/main/compras/facturas/list']);
        }
      },
      error: (error) => {
        console.error('Error al agregar items:', error);
        toast.error('Error al agregar productos a la factura');
      }
    });
  }

  // Procesar siguiente item de lote pendiente
  private processNextBatchItem(): void {
    if (this.pendingBatchItems.length === 0) {
      toast.success('Todos los lotes han sido creados');
      this.resetForm();
      return;
    }

    this.currentBatchItem = this.pendingBatchItems.shift()!;
    this.batchSalePrice = 0;
    this.showBatchPriceModal = true;
  }

  // Confirmar precio de venta del lote
  confirmBatchPrice(): void {
    if (!this.currentBatchItem || this.batchSalePrice <= 0) {
      toast.warning('Ingrese un precio de venta válido para el lote');
      return;
    }

    const request: CreateBatchRequest = {
      productId: this.currentBatchItem.productId,
      productDescription: this.currentBatchItem.description,
      salePrice: this.batchSalePrice,
      initialStock: this.currentBatchItem.quantity,
      priceValidityDays: this.batchPriceValidityDays,
      unitMeasure: 'UNIDAD',
      notes: `Lote creado automáticamente desde compra`
    };

    this.batchService.create(request).subscribe({
      next: (batch) => {
        toast.success(`Lote #${batch.batchNumber} creado para ${this.currentBatchItem?.description}`);
        this.showBatchPriceModal = false;
        this.currentBatchItem = null;
        this.batchSalePrice = 0;
        this.batchPriceValidityDays = 8; // Reset al valor por defecto
        this.processNextBatchItem();
      },
      error: () => {
        toast.error('Error al crear el lote. Puede crearlo manualmente desde Inventario > Lotes');
        this.showBatchPriceModal = false;
        this.processNextBatchItem();
      }
    });
  }

  // Cancelar creación de lote actual
  skipBatchCreation(): void {
    toast.info(`Lote para ${this.currentBatchItem?.description} omitido. Puede crearlo manualmente.`);
    this.showBatchPriceModal = false;
    this.currentBatchItem = null;
    this.batchSalePrice = 0;
    this.processNextBatchItem();
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
    this.existingItems = [];
    this.isEditMode = false;
    this.editingInvoiceId = null;
    this.clearDraft();
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

  // ==================== MODO EDICIÓN ====================

  private loadInvoiceForEdit(invoiceId: string): void {
    this.purchasesService.getById(invoiceId).subscribe({
      next: (invoice) => {
        // Guardar items existentes (solo lectura)
        this.existingItems = invoice.items || [];
        
        // Cargar datos del encabezado
        const supplier = this.suppliers.find(s => s.id === invoice.supplier?.id);
        if (supplier) {
          this.selectedSupplier = supplier;
          this.supplierSearchText = `${supplier.name} (${supplier.documentType} ${supplier.idNumber})`;
        }
        
        // Mapear invoiceDate a emissionDate si es necesario
        const emissionDate = (invoice as any).invoiceDate || invoice.emissionDate;
        
        this.form.patchValue({
          supplierId: invoice.supplier?.id || '',
          invoiceNumber: invoice.invoiceNumber,
          emissionDate: emissionDate?.split('T')[0] || this.todayIso(),
          paymentType: invoice.paymentType || 'CONTADO',
          notes: invoice.notes || '',
          supportDocument: invoice.supportDocument || ''
        });
        
        // Agregar una fila vacía para nuevos items
        this.addItem();
        
        toast.info('Factura cargada. Puede agregar nuevos productos.');
      },
      error: () => {
        toast.error('Error al cargar la factura');
        this.router.navigate(['/main/compras/facturas/list']);
      }
    });
  }

  get existingItemsTotal(): number {
    return this.existingItems.reduce((acc, item) => acc + (item.totalCost || 0), 0);
  }

  get grandTotal(): number {
    return this.existingItemsTotal + this.itemsTotal;
  }

  // ==================== AUTOGUARDADO ====================

  private setupAutoSave(): void {
    this.autoSaveSubscription = this.form.valueChanges
      .pipe(debounceTime(3000)) // Guardar 3 segundos después del último cambio
      .subscribe(() => {
        this.saveDraft();
      });
  }

  private saveDraft(): void {
    try {
      const draft = {
        formData: this.form.getRawValue(),
        supplierSearchText: this.supplierSearchText,
        selectedSupplier: this.selectedSupplier,
        timestamp: new Date().toISOString()
      };
      localStorage.setItem(this.AUTOSAVE_KEY, JSON.stringify(draft));
      this.lastAutoSaveTime = new Date();
    } catch (e) {
      console.warn('Error al guardar borrador:', e);
    }
  }

  private checkForDraft(): void {
    try {
      const draftStr = localStorage.getItem(this.AUTOSAVE_KEY);
      if (!draftStr) return;
      
      const draft = JSON.parse(draftStr);
      const draftTime = new Date(draft.timestamp);
      const now = new Date();
      const hoursDiff = (now.getTime() - draftTime.getTime()) / (1000 * 60 * 60);
      
      // Solo restaurar si el borrador tiene menos de 24 horas
      if (hoursDiff > 24) {
        this.clearDraft();
        return;
      }
      
      // Verificar si hay datos significativos
      const hasData = draft.formData?.invoiceNumber || 
                      draft.formData?.items?.some((i: any) => i.description || i.productId);
      
      if (hasData) {
        this.hasRestoredDraft = true;
        toast.info('Se encontró un borrador guardado. ¿Desea restaurarlo?', {
          duration: 10000,
          action: {
            label: 'Restaurar',
            onClick: () => this.restoreDraft(draft)
          }
        });
      }
    } catch (e) {
      console.warn('Error al verificar borrador:', e);
      this.clearDraft();
    }
  }

  private restoreDraft(draft: any): void {
    try {
      // Restaurar proveedor
      if (draft.selectedSupplier) {
        this.selectedSupplier = draft.selectedSupplier;
        this.supplierSearchText = draft.supplierSearchText || '';
      }
      
      // Restaurar formulario
      const formData = draft.formData;
      this.form.patchValue({
        supplierId: formData.supplierId || '',
        invoiceNumber: formData.invoiceNumber || '',
        emissionDate: formData.emissionDate || this.todayIso(),
        paymentType: formData.paymentType || 'CONTADO',
        notes: formData.notes || '',
        supportDocument: formData.supportDocument || ''
      });
      
      // Restaurar items
      this.form.setControl('items', this.fb.array([]));
      if (formData.items && formData.items.length > 0) {
        formData.items.forEach((item: any) => {
          const g = this.fb.group({
            productId: [item.productId || ''],
            presentationId: [item.presentationId || '', [Validators.required]],
            presentationBarcode: [item.presentationBarcode || ''],
            description: [item.description || '', [Validators.required]],
            quantity: [item.quantity || 1, [Validators.required, Validators.min(0.01)]],
            unitCost: [item.unitCost || '0', [Validators.required]],
            totalCost: [{ value: item.totalCost || 0, disabled: true }],
            category: [item.category || '']
          });
          g.valueChanges.subscribe(() => this.recalcItem(g));
          this.itemsArray.push(g);
        });
      }
      
      if (this.itemsArray.length === 0) {
        this.addItem();
      }
      
      toast.success('Borrador restaurado correctamente');
    } catch (e) {
      console.warn('Error al restaurar borrador:', e);
      toast.error('Error al restaurar el borrador');
    }
  }

  clearDraft(): void {
    try {
      localStorage.removeItem(this.AUTOSAVE_KEY);
      this.hasRestoredDraft = false;
      this.lastAutoSaveTime = null;
    } catch (e) {
      console.warn('Error al limpiar borrador:', e);
    }
  }

  discardDraft(): void {
    this.clearDraft();
    this.resetForm();
    toast.info('Borrador descartado');
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
