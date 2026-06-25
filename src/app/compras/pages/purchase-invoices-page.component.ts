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
import { Presentation, Product } from '../../producto/producto';
import { BatchService } from '../../lotes/services/batch.service';
import { BATCH_REQUIRED_CATEGORY, CreateBatchRequest } from '../../lotes/models/batch';
import { BatchExpirationAlertComponent } from '../../lotes/components/batch-expiration-alert/batch-expiration-alert.component';
import { Subscription, debounceTime } from 'rxjs';
import { PurchaseLastCostInfo } from '../models/purchase-cost-history';
import { ProductoService } from '../../producto/producto.service';
import { BulkPresentationPriceUpdateRequest, PresentationPriceUpdate } from '../../producto/models/bulk-price-update.model';

interface ProductSuggestion {
  product: Product;
  presentation: Presentation;
  displayName: string;
  barcode: string;
  costPrice: number;
  brand: string;
}

@Component({
  selector: 'app-purchase-invoices-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, ExpensesFabComponent, CurrencyFormatDirective, ProductsSearchModalComponent, BatchExpirationAlertComponent],
  templateUrl: './purchase-invoices-page.component.html',
  styleUrls: ['./purchase-invoices-page.component.css']
})
export class PurchaseInvoicesPageComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private purchasesService = inject(PurchasesService);
  private supplierService = inject(SupplierService);
  private productService = inject(ProductoService);
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

  // Product inline autocomplete state
  allProducts: Product[] = [];
  productSuggestions: ProductSuggestion[] = [];
  showProductDropdown = false;
  activeRowIndex = -1;
  productActiveIndex = -1;
  productSearchTexts: string[] = [];
  selectedFile: File | null = null;
  uploadedFileUrl: string | null = null;

  // Modo edición
  isEditMode = false;
  editingInvoiceId: string | null = null;
  existingItems: any[] = []; // Items originales de la factura (solo lectura)

  // Apariencia
  isDarkMode = false;

  // Filtro y orden de items
  itemSortOrder: 'newest' | 'az' | 'za' = 'newest';
  itemFilterText = '';

  /** Devuelve pares {idx, ctrl} en el orden visual (newest-first por defecto). */
  get displayedItems(): { idx: number; ctrl: FormGroup }[] {
    const controls = this.itemsArray.controls;
    let pairs = controls.map((ctrl, i) => ({ idx: i, ctrl: ctrl as FormGroup }));

    // Filtrar por descripción (ítems vacíos siempre aparecen)
    const q = this.itemFilterText.trim().toLowerCase();
    if (q) {
      pairs = pairs.filter(p => {
        const desc = (p.ctrl.get('description')?.value || '').toLowerCase();
        return !desc || desc.includes(q);
      });
    }

    // Ordenar
    if (this.itemSortOrder === 'newest') {
      return [...pairs].reverse();
    } else if (this.itemSortOrder === 'az') {
      return [...pairs].sort((a, b) =>
        (a.ctrl.get('description')?.value || '').localeCompare(b.ctrl.get('description')?.value || '', 'es')
      );
    } else {
      return [...pairs].sort((a, b) =>
        (b.ctrl.get('description')?.value || '').localeCompare(a.ctrl.get('description')?.value || '', 'es')
      );
    }
  }

  toggleDarkMode(): void {
    this.isDarkMode = !this.isDarkMode;
    try { localStorage.setItem('pi_dark_mode', this.isDarkMode ? '1' : '0'); } catch {}
  }

  // Autoguardado
  private readonly AUTOSAVE_KEY = 'purchase_invoice_draft';
  private autoSaveSubscription?: Subscription;
  hasRestoredDraft = false;
  lastAutoSaveTime: Date | null = null;

  // Costo de última compra por presentación (cache para mostrar tendencia)
  // Map<presentationId, PurchaseLastCostInfo | null>
  // null = ya consultado, sin historial previo (primera compra)
  // undefined (no en mapa) = aún no consultado
  lastCostByPresentation: Map<string, PurchaseLastCostInfo | null> = new Map();

  // Precio de venta actual por presentación (para permitir ajuste rápido al confirmar)
  currentSalePriceByPresentation: Map<string, number> = new Map();
  // Precio de venta pendiente de actualizar (editado por el usuario en modal de confirmación)
  pendingSalePriceUpdates: Map<string, number> = new Map();

  // Confirmación de guardado con resumen de costos
  showConfirmSaveModal = false;
  confirmSaveItems: { description: string; presentationId: string; unitTotalCost: number; trend: string; deltaPercent: number | null; lastCost: number | null }[] = [];
  private pendingSavePayload: any = null;
  private pendingSaveValidItems: any[] = [];

  // Lotes de animales vivos
  pendingBatchItems: { productId: string; description: string; quantity: number; category: string }[] = []
  showBatchPriceModal = false;
  currentBatchItem: { productId: string; description: string; quantity: number } | null = null;
  batchSalePrice: number = 0;
  batchPriceValidityDays: number = 8; // Días de validez del precio (configurable)

  form: FormGroup = this.fb.group({
    supplierId: ['', [Validators.required]],
    invoiceNumber: ['', [Validators.required]],
    emissionDate: [this.todayIso(), [Validators.required]],
    paymentType: ['CONTADO', [Validators.required]],
    freightRate: [0],
    globalVatRate: [null as number | null],  // IVA % fijo para todos los ítems (null = sin fijar)
    items: this.fb.array([]),
    notes: [''],
    supportDocument: ['']
  });

  ngOnInit() {
    try { this.isDarkMode = localStorage.getItem('pi_dark_mode') === '1'; } catch {}
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

    this.productService.productos$.subscribe(products => {
      this.allProducts = products || [];
    });

    // Recalcular flete cuando cambie la tarifa de flete en el encabezado
    this.form.get('freightRate')?.valueChanges.subscribe(() => this.recalcFreight());

    // Cuando cambia el IVA global, aplicarlo a todos los ítems existentes
    this.form.get('globalVatRate')?.valueChanges.subscribe(() => this.applyGlobalVatToAll());
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
      const total = this.getItemSubtotal(g);
      return acc + (isFinite(total) ? total : 0);
    }, 0);
  }

  get itemsVatTotal(): number {
    return this.itemsArray.controls.reduce((acc, ctrl) => {
      const g = ctrl as FormGroup;
      const vat = this.getItemVat(g);
      return acc + (isFinite(vat) ? vat : 0);
    }, 0);
  }

  get freightCost(): number {
    return this.itemsArray.controls.reduce((acc, ctrl) => {
      const g = ctrl as FormGroup;
      const v = this.getItemFreight(g);
      return acc + (isFinite(v) ? v : 0);
    }, 0);
  }

  get grandTotalWithVatAndFreight(): number {
    return this.itemsTotal + this.itemsVatTotal + this.freightCost;
  }

  /** Conteos de tendencia para el banner resumen */
  get trendUpCount(): number {
    return this.itemsArray.controls.filter(g => this.getCostTrend(g as FormGroup) === 'up').length;
  }
  get trendDownCount(): number {
    return this.itemsArray.controls.filter(g => this.getCostTrend(g as FormGroup) === 'down').length;
  }
  get trendSameCount(): number {
    return this.itemsArray.controls.filter(g => this.getCostTrend(g as FormGroup) === 'same').length;
  }
  get trendFirstCount(): number {
    return this.itemsArray.controls.filter(g => this.getCostTrend(g as FormGroup) === 'first').length;
  }
  get hasAnyCostTrend(): boolean {
    return this.itemsArray.controls.some(g => this.getCostTrend(g as FormGroup) !== 'none');
  }

  addItem() {
    // IVA: usa el global fijado en el encabezado, si no el del proveedor, si no 0
    const globalVat = this.form.get('globalVatRate')?.value;
    const defaultVat = (globalVat !== null && globalVat !== undefined && globalVat !== '')
      ? Number(globalVat)
      : (this.selectedSupplier?.defaultVatRate ?? 0);

    // Flete: si hay tarifa de flete establecida, marcar el check por defecto
    const freightRate = this.normalizeToNumber(this.form.get('freightRate')?.value) || 0;
    const applyFreightDefault = freightRate > 0;

    const g = this.fb.group({
      productId: [''],
      presentationId: ['', [Validators.required]],
      presentationBarcode: [''],
      description: ['', [Validators.required]],
      quantity: [1, [Validators.required, Validators.min(0.01)]],
      unitCost: ['0', [Validators.required]],
      vatRate: [defaultVat],
      vatAmount: [{ value: 0, disabled: true }],
      totalCost: [{ value: 0, disabled: true }],
      applyFreight: [applyFreightDefault],
      freightAmount: [{ value: 0, disabled: true }],
      category: ['']
    });
    g.valueChanges.subscribe(() => this.recalcItem(g));
    this.itemsArray.push(g);
    this.productSearchTexts.push('');
    if (applyFreightDefault) this.recalcFreight();
  }

  removeItem(index: number) {
    this.itemsArray.removeAt(index);
    this.productSearchTexts.splice(index, 1);
    this.ensureEmptyItem();
  }

  /** Garantiza que siempre haya al menos un ítem vacío disponible para ingresar. */
  private ensureEmptyItem(): void {
    const hasEmpty = this.itemsArray.controls.some(c => !c.get('presentationId')?.value);
    if (!hasEmpty) {
      this.addItem();
    }
  }

  openProductsModalForRow(index: number) {
    this.selectedItemIndexForProductSearch = index;
    this.productsSearchModalComp?.openModal();
  }

  onRowSearchFocus(index: number): void {
    this.activeRowIndex = index;
    const query = (this.productSearchTexts[index] || '').trim().toLowerCase();
    if (query.length >= 2) {
      this.filterProductSuggestions(query);
    }
  }

  onProductSearchInput(index: number, value: string): void {
    this.productSearchTexts[index] = value;
    this.activeRowIndex = index;
    this.productActiveIndex = -1;
    const query = value.trim().toLowerCase();
    if (query.length < 2) {
      this.productSuggestions = [];
      this.showProductDropdown = false;
      return;
    }
    this.filterProductSuggestions(query);
  }

  private filterProductSuggestions(query: string): void {
    const suggestions: ProductSuggestion[] = [];
    for (const prod of this.allProducts) {
      for (const pres of (prod.presentations || [])) {
        const barcode = (pres.barcode || '').toLowerCase();
        const rootDesc = (prod.description || '').toLowerCase();
        const label = (pres.label || '').toLowerCase();
        const productCode = (prod.productCode || '').toLowerCase();
        const combined = `${rootDesc} ${label}`.trim();
        if (barcode.includes(query) || combined.includes(query) || productCode.includes(query)) {
          const labelPart = (pres.label || '').trim();
          const rootPart = (prod.description || '').trim();
          suggestions.push({
            product: prod,
            presentation: pres,
            displayName: labelPart ? `${rootPart} - ${labelPart}` : rootPart,
            barcode: pres.barcode || '',
            costPrice: pres.costPrice || 0,
            brand: prod.brand || ''
          });
        }
        if (suggestions.length >= 10) break;
      }
      if (suggestions.length >= 10) break;
    }
    this.productSuggestions = suggestions.slice(0, 10);
    this.showProductDropdown = this.productSuggestions.length > 0;
  }

  selectProductSuggestion(s: ProductSuggestion, rowIndex: number): void {
    this.productSearchTexts[rowIndex] = '';
    this.showProductDropdown = false;
    this.productSuggestions = [];
    this.productActiveIndex = -1;
    this.applyProductToRow(s.product, s.presentation, rowIndex);
  }

  private scrollActiveSuggestion(): void {
    setTimeout(() => {
      const container = document.querySelector('.purchase-autocomplete-dropdown');
      if (!container) return;
      const items = container.querySelectorAll('.purchase-suggestion-item');
      const target = items[this.productActiveIndex] as HTMLElement | undefined;
      target?.scrollIntoView({ block: 'nearest' });
    }, 0);
  }

  onProductKeydown(event: KeyboardEvent, rowIndex: number): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!this.showProductDropdown) {
        this.filterProductSuggestions((this.productSearchTexts[rowIndex] || '').trim().toLowerCase());
        return;
      }
      this.productActiveIndex = Math.min(this.productActiveIndex + 1, this.productSuggestions.length - 1);
      this.scrollActiveSuggestion();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.productActiveIndex = Math.max(this.productActiveIndex - 1, -1);
      this.scrollActiveSuggestion();
    } else if (event.key === 'Enter') {
      if (this.productActiveIndex >= 0) {
        event.preventDefault();
        this.selectProductSuggestion(this.productSuggestions[this.productActiveIndex], rowIndex);
      } else {
        const query = this.productSearchTexts[rowIndex] || '';
        const found = this.findPresentationByBarcode(query);
        if (found) {
          event.preventDefault();
          this.applyProductToRow(found.product, found.presentation, rowIndex);
          this.productSearchTexts[rowIndex] = '';
          this.showProductDropdown = false;
        } else if (this.productSuggestions.length === 1) {
          event.preventDefault();
          this.selectProductSuggestion(this.productSuggestions[0], rowIndex);
        }
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.showProductDropdown = false;
      this.productActiveIndex = -1;
    }
  }

  hideProductDropdownDelayed(): void {
    setTimeout(() => {
      this.showProductDropdown = false;
      this.productActiveIndex = -1;
    }, 200);
  }

  private findPresentationByBarcode(barcode: string): { product: Product; presentation: Presentation } | null {
    if (!barcode) return null;
    for (const prod of this.allProducts) {
      for (const pres of (prod.presentations || [])) {
        if (pres.barcode === barcode) {
          return { product: prod, presentation: pres };
        }
      }
    }
    return null;
  }

  private applyProductToRow(product: Product, presentation: Presentation, index: number): void {
    const group = this.itemsArray.at(index) as FormGroup | undefined;
    if (!group) return;
    const description = (presentation.label || '').trim()
      ? `${product.description} - ${presentation.label}`
      : product.description;
    group.patchValue({
      productId: product.id,
      presentationId: presentation.barcode,
      presentationBarcode: presentation.barcode,
      description: description,
      category: product.category || '',
      unitCost: presentation.costPrice || 0
    });
    this.currentSalePriceByPresentation.set(presentation.barcode, presentation.salePrice || 0);
    this.fetchLastCostForPresentation(presentation.barcode, description);
    this.ensureEmptyItem();
  }

  onPresentationSelected(mappedProduct: Product) {
    const index = this.selectedItemIndexForProductSearch ?? (this.itemsArray.length > 0 ? this.itemsArray.length - 1 : null);
    if (index === null || index < 0) {
      this.addItem();
      const lastIndex = this.itemsArray.length - 1;
      const presentation = mappedProduct.presentations?.find(p => p.barcode === mappedProduct.barcode);
      if (presentation) {
        this.applyProductToRow(mappedProduct, presentation, lastIndex);
      }
      this.selectedItemIndexForProductSearch = null;
      return;
    }

    const group = this.itemsArray.at(index) as FormGroup | undefined;
    if (!group) return;

    const presentation = mappedProduct.presentations?.find(p => p.barcode === mappedProduct.barcode);
    if (presentation) {
      this.applyProductToRow(mappedProduct, presentation, index);
    } else {
      // Fallback: modal may have already mapped the description
      group.patchValue({
        productId: mappedProduct.id,
        presentationId: mappedProduct.barcode,
        presentationBarcode: mappedProduct.barcode,
        description: mappedProduct.description,
        category: mappedProduct.category || ''
      });
      this.fetchLastCostForPresentation(mappedProduct.barcode, mappedProduct.description);
    }
    this.selectedItemIndexForProductSearch = null;
  }

  /**
   * Consulta al backend el último costo total por unidad de la presentación y notifica
   * al usuario con la información histórica para que pueda comparar.
   */
  private fetchLastCostForPresentation(presentationId: string, description?: string): void {
    if (!presentationId) return;
    // Evitar consultas duplicadas si ya está cacheado
    if (this.lastCostByPresentation.has(presentationId)) {
      const cached = this.lastCostByPresentation.get(presentationId);
      this.notifyLastCost(cached || null, description);
      return;
    }
    this.purchasesService.getLastCost(presentationId).subscribe({
      next: (info) => {
        this.lastCostByPresentation.set(presentationId, info || null);
        this.notifyLastCost(info || null, description);
      },
      error: () => {
        // No bloquear el flujo si falla; marcar como consultado vacío
        this.lastCostByPresentation.set(presentationId, null);
      }
    });
  }

  private notifyLastCost(info: PurchaseLastCostInfo | null, description?: string): void {
    const productName = description || info?.productDescription || 'producto';
    if (!info || info.lastUnitTotalCost == null) {
      toast.info(`Primera compra registrada de ${productName}`, { duration: 4500 });
      return;
    }
    const formatted = this.formatCurrency(info.lastUnitTotalCost);
    const dateStr = info.lastInvoiceDate ? info.lastInvoiceDate.split('T')[0] : '';
    const supplier = info.lastSupplierName ? ` (${info.lastSupplierName})` : '';
    toast.info(`Última compra de ${productName}: ${formatted}/u el ${dateStr}${supplier}`, { duration: 6000 });
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
  }

  /**
   * Devuelve la info del último costo para una fila (lookup por presentationId).
   */
  getLastCostForRow(g: FormGroup): PurchaseLastCostInfo | null {
    const id = g.get('presentationId')?.value;
    if (!id) return null;
    return this.lastCostByPresentation.get(id) || null;
  }

  /**
   * Tendencia del costo BASE respecto a la última compra.
   * Compara unitCost (base ingresado) vs lastUnitCost (base anterior) para no
   * contaminar la señal con variaciones de IVA o flete que son configurables.
   * 'up' = subió, 'down' = bajó, 'same' = igual, 'first' = primera vez, 'none' = aún no consultado.
   */
  getCostTrend(g: FormGroup): 'up' | 'down' | 'same' | 'first' | 'none' {
    const id = g.get('presentationId')?.value;
    if (!id) return 'none';
    if (!this.lastCostByPresentation.has(id)) return 'none';
    const info = this.lastCostByPresentation.get(id);
    if (!info || info.lastUnitCost == null) return 'first';
    const currentBase = this.normalizeToNumber(g.get('unitCost')?.value);
    if (currentBase <= 0) return 'none';
    const diff = currentBase - info.lastUnitCost;
    if (Math.abs(diff) < 0.5) return 'same';   // tolerancia de $0.5 para redondeos
    return diff > 0 ? 'up' : 'down';
  }

  /**
   * Diferencia porcentual del costo BASE (positivo = subió, negativo = bajó).
   * Devuelve valor absoluto — el signo lo indica la flecha del badge.
   */
  getCostDeltaPercent(g: FormGroup): number | null {
    const info = this.getLastCostForRow(g);
    if (!info || !info.lastUnitCost) return null;
    const currentBase = this.normalizeToNumber(g.get('unitCost')?.value);
    if (currentBase <= 0) return null;
    return Math.abs(((currentBase - info.lastUnitCost) / info.lastUnitCost) * 100);
  }

  recalcItem(g: FormGroup) {
    const qty = Number(g.get('quantity')?.value || 0);
    const unit = this.normalizeToNumber(g.get('unitCost')?.value);
    const vatRate = Number(g.get('vatRate')?.value || 0);
    const subtotal = qty * (unit || 0);
    const vatAmount = subtotal * (vatRate / 100);
    g.get('vatAmount')?.setValue(vatAmount, { emitEvent: false });
    g.get('totalCost')?.setValue(subtotal, { emitEvent: false });
    this.recalcFreight();
  }

  getUnitTotal(g: FormGroup): number {
    const unit = this.normalizeToNumber(g.get('unitCost')?.value) || 0;
    const vatRate = Number(g.get('vatRate')?.value || 0);
    const applies = g.get('applyFreight')?.value === true;
    const freightRate = this.normalizeToNumber(this.form.get('freightRate')?.value) || 0;
    return unit + unit * (vatRate / 100) + (applies ? freightRate : 0);
  }

  /** Computa subtotal directamente desde controles habilitados (sin depender de totalCost disabled). */
  getItemSubtotal(g: FormGroup): number {
    const qty = Number(g.get('quantity')?.value || 0);
    const unit = this.normalizeToNumber(g.get('unitCost')?.value) || 0;
    return qty * unit;
  }

  /** Computa IVA del ítem desde controles habilitados. */
  getItemVat(g: FormGroup): number {
    const subtotal = this.getItemSubtotal(g);
    const vatRate = Number(g.get('vatRate')?.value || 0);
    return subtotal * (vatRate / 100);
  }

  /** Computa flete del ítem desde controles habilitados. */
  getItemFreight(g: FormGroup): number {
    const applies = g.get('applyFreight')?.value === true;
    const freightRate = this.normalizeToNumber(this.form.get('freightRate')?.value) || 0;
    const qty = Number(g.get('quantity')?.value || 0);
    return (applies && freightRate > 0) ? freightRate * qty : 0;
  }

  recalcFreight() {
    const freightRate = this.normalizeToNumber(this.form.get('freightRate')?.value) || 0;
    this.itemsArray.controls.forEach(ctrl => {
      const g = ctrl as FormGroup;
      const applies = g.get('applyFreight')?.value === true;
      const qty = Number(g.get('quantity')?.value || 0);
      const freightAmount = (applies && freightRate > 0) ? freightRate * qty : 0;
      g.get('freightAmount')?.setValue(Math.round(freightAmount), { emitEvent: false });
    });
  }

  /**
   * Aplica el IVA % global a todos los ítems de la tabla.
   * El usuario puede seguir sobreescribiendo por fila.
   */
  applyGlobalVatToAll(): void {
    const raw = this.form.get('globalVatRate')?.value;
    if (raw === null || raw === undefined || raw === '') return;
    const vatRate = Number(raw);
    if (isNaN(vatRate)) return;
    this.itemsArray.controls.forEach(ctrl => {
      const g = ctrl as FormGroup;
      g.get('vatRate')?.setValue(vatRate, { emitEvent: false });
      this.recalcItem(g);
    });
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

    // Pre-rellenar IVA global con el del proveedor (solo si no hay uno fijado ya)
    const currentGlobal = this.form.get('globalVatRate')?.value;
    if (currentGlobal === null || currentGlobal === undefined || currentGlobal === '') {
      const defaultVat = supplier.defaultVatRate ?? 0;
      this.form.get('globalVatRate')?.setValue(defaultVat, { emitEvent: true });
      // applyGlobalVatToAll() se llama via valueChanges, no duplicar aquí
    } else {
      // Ya hay un IVA global fijado: aplicarlo a los ítems que se acaban de agregar
      this.applyGlobalVatToAll();
    }
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
    console.log('[saveInvoice] isEditMode:', this.isEditMode, 'editingInvoiceId:', this.editingInvoiceId);
    // En modo edición, validar que haya nuevos items para agregar
    const hasNewItems = this.itemsArray.controls.some(ctrl => {
      const g = ctrl as FormGroup;
      return g.get('description')?.value && g.get('presentationId')?.value;
    });
    console.log('[saveInvoice] hasNewItems:', hasNewItems, 'itemsArray.length:', this.itemsArray.length);

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
    console.log('[saveInvoice] raw items:', JSON.stringify(raw.items));
    
    // Filtrar items vacíos
    const validItems = raw.items.filter((it: any) => it.description && it.presentationId);
    console.log('[saveInvoice] validItems count:', validItems.length);
    
    if (validItems.length === 0) {
      toast.warning('Agregue al menos un producto válido');
      return;
    }

    const selectedSupplier = this.suppliers.find(s => s.id === raw.supplierId);
    console.log('[saveInvoice] supplierId:', raw.supplierId, 'suppliers count:', this.suppliers.length, 'found:', !!selectedSupplier);
    
    if (!selectedSupplier) {
      toast.error('Error: No se encontró el proveedor seleccionado');
      return;
    }

    // getRawValue() ya incluye los campos disabled (vatAmount, totalCost, freightAmount)
    const mappedItems = this.mapItemsForSave(validItems);

    // Preparar resumen de tendencias para el modal de confirmación
    const trendSummary = this.buildTrendSummary(mappedItems);

    if (trendSummary.length > 0) {
      // Hay productos con historial: mostrar modal de confirmación
      this.confirmSaveItems = trendSummary;
      this.pendingSavePayload = { raw, selectedSupplier, mappedItems, validItems };
      this.showConfirmSaveModal = true;
      return;
    }

    // Sin tendencias (todo sin historial): guardar directamente
    this.executeSave(raw, selectedSupplier, mappedItems, validItems);
  }

  private mapItemsForSave(validItems: any[]): any[] {
    return validItems.map((it: any) => {
      const qty = Number(it.quantity);
      const unit = this.normalizeToNumber(it.unitCost);
      const vatRate = Number(it.vatRate || 0);
      const totalCost = qty * unit;
      const vatAmount = totalCost * (vatRate / 100);
      const freightAmount = Number(it.freightAmount || 0);
      // Costo total por unidad (para trazabilidad histórica)
      const vatPerUnit = qty > 0 ? vatAmount / qty : unit * (vatRate / 100);
      const freightPerUnit = qty > 0 ? freightAmount / qty : 0;
      const unitTotalCost = unit + vatPerUnit + freightPerUnit;
      return {
        productId: it.productId,
        presentationId: it.presentationId,
        presentationBarcode: it.presentationBarcode,
        description: it.description,
        quantity: qty,
        unitCost: unit,
        totalCost: totalCost,
        vatRate: vatRate,
        vatAmount: vatAmount,
        applyFreight: it.applyFreight || false,
        freightAmount: freightAmount,
        unitTotalCost: unitTotalCost
      };
    });
  }

  /**
   * Construye resumen de tendencias para el modal de confirmación.
   * Incluye solo ítems que tienen historial consultado (excluye 'none').
   */
  private buildTrendSummary(mappedItems: any[]): { description: string; presentationId: string; unitTotalCost: number; trend: string; deltaPercent: number | null; lastCost: number | null }[] {
    return mappedItems.map(it => {
      const info = this.lastCostByPresentation.get(it.presentationId);
      if (!info) return null; // sin consultar, no incluir
      const current = it.unitTotalCost;
      let trend = 'first';
      let deltaPercent: number | null = null;
      let lastCost: number | null = null;
      if (info.lastUnitTotalCost != null) {
        lastCost = info.lastUnitTotalCost;
        const diff = current - info.lastUnitTotalCost;
        if (Math.abs(diff) < 0.01) trend = 'same';
        else trend = diff > 0 ? 'up' : 'down';
        deltaPercent = ((current - info.lastUnitTotalCost) / info.lastUnitTotalCost) * 100;
      }
      return {
        description: it.description,
        presentationId: it.presentationId,
        unitTotalCost: current,
        trend,
        deltaPercent,
        lastCost
      };
    }).filter((x): x is NonNullable<typeof x> => x !== null);
  }

  confirmSave(): void {
    if (!this.pendingSavePayload) return;
    const { raw, selectedSupplier, mappedItems, validItems } = this.pendingSavePayload;
    this.showConfirmSaveModal = false;

    // Aplicar actualizaciones de precio de venta pendientes (si las hay)
    const updates: PresentationPriceUpdate[] = [];
    this.pendingSalePriceUpdates.forEach((newPrice, barcode) => {
      const item = mappedItems.find((it: any) => it.presentationBarcode === barcode || it.presentationId === barcode);
      if (item && newPrice > 0) {
        updates.push({ productId: item.productId, barcode, salePrice: newPrice });
      }
    });

    if (updates.length > 0) {
      const payload: BulkPresentationPriceUpdateRequest = { updates };
      this.productService.bulkUpdatePresentationPrices(payload).subscribe({
        next: (res) => {
          if (res.failed > 0) {
            console.warn('Algunos precios no se actualizaron:', res.errors);
          }
          toast.success(`${res.updated} precio(s) de venta actualizado(s)`);
          this.pendingSavePayload = null;
          this.executeSave(raw, selectedSupplier, mappedItems, validItems);
        },
        error: () => {
          toast.error('Error al actualizar precios de venta. La compra no se guardó.');
          this.showConfirmSaveModal = true; // reabrir para que el usuario decida
        }
      });
      this.pendingSalePriceUpdates.clear();
      return;
    }

    this.pendingSavePayload = null;
    this.pendingSalePriceUpdates.clear();
    this.executeSave(raw, selectedSupplier, mappedItems, validItems);
  }

  cancelConfirmSave(): void {
    this.showConfirmSaveModal = false;
    this.pendingSavePayload = null;
    this.confirmSaveItems = [];
  }

  getCurrentSalePrice(presentationId: string): number {
    return this.currentSalePriceByPresentation.get(presentationId) || 0;
  }

  setPendingSalePrice(presentationId: string, value: number): void {
    const current = this.getCurrentSalePrice(presentationId);
    if (value > 0 && Math.abs(value - current) > 0.01) {
      this.pendingSalePriceUpdates.set(presentationId, value);
    } else {
      this.pendingSalePriceUpdates.delete(presentationId);
    }
  }

  hasPendingSalePriceChange(presentationId: string): boolean {
    return this.pendingSalePriceUpdates.has(presentationId);
  }

  private updateProductCostPrices(mappedItems: any[]): void {
    const updates: PresentationPriceUpdate[] = mappedItems
      .filter(it => it.productId && it.presentationBarcode && it.unitTotalCost > 0)
      .map(it => ({
        productId: it.productId,
        barcode: it.presentationBarcode,
        costPrice: it.unitTotalCost   // costo total/u = base + IVA/u + flete/u (por producto)
      }));
    if (updates.length === 0) return;
    this.productService.bulkUpdatePresentationPrices({ updates }).subscribe({
      next: () => {},
      error: () => {}
    });
  }

  private executeSave(raw: any, selectedSupplier: any, mappedItems: any[], validItems: any[]): void {
    if (this.isEditMode && this.editingInvoiceId) {
      // Modo edición: agregar nuevos items a factura existente
      this.addItemsToExistingInvoice(mappedItems, validItems);
    } else {
      // Modo creación: crear nueva factura
      this.createNewInvoice(raw, selectedSupplier, mappedItems, validItems);
    }
  }

  private createNewInvoice(raw: any, selectedSupplier: any, mappedItems: any[], validItems: any[]): void {
    const subtotal = mappedItems.reduce((acc: number, it: any) => acc + it.totalCost, 0);
    const totalVat = mappedItems.reduce((acc: number, it: any) => acc + it.vatAmount, 0);
    const freightRate = this.normalizeToNumber(raw.freightRate) || 0;
    const freightCost = mappedItems.reduce((acc: number, it: any) => acc + (it.freightAmount || 0), 0);
    const payload: any = {
      supplier: {
        id: selectedSupplier.id,
        name: selectedSupplier.name
      },
      invoiceNumber: raw.invoiceNumber,
      invoiceDate: raw.emissionDate,
      paymentType: raw.paymentType,
      items: mappedItems,
      subtotal: subtotal,
      totalVat: totalVat,
      freightRate: freightRate,
      freightCost: freightCost,
      total: subtotal + totalVat + freightCost,
      notes: raw.notes || '',
      supportDocument: raw.supportDocument || undefined
    };

    this.purchasesService.create(payload).subscribe({
      next: (response) => {
        toast.success('Compra registrada');
        this.updateProductCostPrices(mappedItems);
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
        this.updateProductCostPrices(mappedItems);
        
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
      freightRate: 0,
      globalVatRate: null,
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
    this.productSearchTexts = [];
    this.showProductDropdown = false;
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
      this.productSearchTexts = [];
      if (formData.items && formData.items.length > 0) {
        formData.items.forEach((item: any) => {
          const g = this.fb.group({
            productId: [item.productId || ''],
            presentationId: [item.presentationId || '', [Validators.required]],
            presentationBarcode: [item.presentationBarcode || ''],
            description: [item.description || '', [Validators.required]],
            quantity: [item.quantity || 1, [Validators.required, Validators.min(0.01)]],
            unitCost: [item.unitCost || '0', [Validators.required]],
            vatRate: [item.vatRate ?? (this.selectedSupplier?.defaultVatRate ?? 0)],
            vatAmount: [{ value: item.vatAmount || 0, disabled: true }],
            totalCost: [{ value: item.totalCost || 0, disabled: true }],
            applyFreight: [item.applyFreight || false],
            freightAmount: [{ value: item.freightAmount || 0, disabled: true }],
            category: [item.category || '']
          });
          g.valueChanges.subscribe(() => this.recalcItem(g));
          this.itemsArray.push(g);
          this.productSearchTexts.push('');
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
      // Si hay datos significativos, guardar borrador y pedir confirmación
      const raw = this.form.getRawValue();
      const hasData = raw.invoiceNumber || raw.supplierId ||
        raw.items?.some((i: any) => i.description || i.productId);
      if (hasData) {
        this.saveDraft();
        if (!confirm('¿Desea cancelar? Los datos se guardaron como borrador y podrá restaurarlos al volver.')) {
          return;
        }
      }
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
