import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  inject,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { toast } from 'ngx-sonner';

import { Product, Presentation, UnitMeasure, UnitMeasureLabels } from '../../../producto/producto';
import { ProductoService } from '../../../producto/producto.service';
import { CatalogService } from '../../../producto/catalog.service';
import { getPackageTypes, findPackageType, PackageTypeConfig } from '../../../producto/package-type.config';
import { LoginUserService } from '../../../auth/login/loginUser.service';
import { InventoryCountService } from '../../services/inventory-count.service';
import {
  BulkCountRequest,
  InventoryCountEntryDto,
  InventoryCountSessionDto,
  RecordCountRequest,
} from '../../models/inventory-count';
import jsPDF from 'jspdf';
import JsBarcode from 'jsbarcode';
import { LabelConfig } from '../../models/label-config';
import { LabelConfigService } from '../../services/label-config.service';
import { LabelConfigModalComponent } from '../../components/label-config-modal/label-config-modal.component';

interface LabelSheetItem {
  barcode: string;
  description: string;
  brand: string;
  salePrice: number | string;
  copies: number;
}

const UNIT_ABBREVIATIONS: Record<string, string> = {
  [UnitMeasure.KILOGRAMOS]: 'Kg',
  [UnitMeasure.METROS]: 'Metro',
  [UnitMeasure.CENTIMETROS]: 'Cm',
  [UnitMeasure.LITROS]: 'Lt',
  [UnitMeasure.MILILITROS]: 'CC',
  [UnitMeasure.UNIDAD]: 'Und',
};

@Component({
  selector: 'app-inventory-count-page',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, DecimalPipe, LabelConfigModalComponent],
  templateUrl: './inventory-count-page.component.html',
  styleUrl: './inventory-count-page.component.css',
})
export class InventoryCountPageComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('searchInputRef') searchInputRef!: ElementRef<HTMLInputElement>;
  @ViewChild('labelConfigModal') labelConfigModal!: LabelConfigModalComponent;

  private countService        = inject(InventoryCountService);
  private productoService     = inject(ProductoService);
  private catalogService      = inject(CatalogService);
  private loginUserService    = inject(LoginUserService);
  private labelConfigService  = inject(LabelConfigService);
  private router              = inject(Router);
  private fb                  = inject(FormBuilder);

  // Catálogo de marcas y categorías para los selects del editor
  brands$     = this.catalogService.brands$;
  categories$ = this.catalogService.categories$;

  // Estado sesión
  session: InventoryCountSessionDto | null = null;
  isLoading  = false;
  isCreating = false;
  isSaving   = false;

  // Búsqueda
  searchQuery = '';
  searchResults: { product: Product; presentation: Presentation }[] = [];
  showSearchResults = false;
  activeSearchIndex = -1;

  // Producto seleccionado para contar (modo single)
  selectedProduct: { product: Product; presentation: Presentation } | null = null;
  countedQty: number | null = null;

  // Modo bulk — producto con múltiples presentaciones activas
  isBulkMode = false;
  bulkProduct: Product | null = null;
  bulkPresentations: Presentation[] = [];
  bulkQtys: { [barcode: string]: number | null } = {};

  // Escáner HID
  private barcodeBuffer = '';
  private barcodeStartTime = 0;
  private barcodeClearTimer: ReturnType<typeof setTimeout> | null = null;

  // Bottom sheet — edición rápida de producto/presentación
  showEditSheet           = false;
  isSavingEdit            = false;
  editForm!: FormGroup;
  availablePackageTypes: PackageTypeConfig[] = [];

  // Flag para saber si el sheet se abrió desde modo bulk y restaurar después
  private editFromBulkMode = false;

  // ── Hoja de impresión de etiquetas ───────────────────────────────────────
  showLabelSheet     = false;
  labelSheetItems:   LabelSheetItem[] = [];
  isGeneratingLabels = false;
  labelConfig: LabelConfig = {} as LabelConfig;

  // Touch — distinguir scroll de tap para no cerrar el dropdown mientras se hace scroll
  private touchStartY = 0;
  private touchMoved  = false;

  private allProducts: Product[] = [];

  ngOnInit(): void {
    this.loadProducts();
    this.loadActiveSession();
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.searchInputRef?.nativeElement?.focus(), 300);
  }

  ngOnDestroy(): void {
    if (this.barcodeClearTimer) clearTimeout(this.barcodeClearTimer);
  }

  // ── Escáner HID ──────────────────────────────────────────────────────────

  @HostListener('document:keydown', ['$event'])
  onGlobalKeyDown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

    if (event.key === 'Enter' && this.barcodeBuffer.length > 2) {
      event.preventDefault();
      this.processBarcode(this.barcodeBuffer);
      this.barcodeBuffer = '';
      return;
    }
    if (event.key.length === 1) {
      const now = Date.now();
      if (now - this.barcodeStartTime > 80) {
        this.barcodeBuffer = event.key;
      } else {
        this.barcodeBuffer += event.key;
      }
      this.barcodeStartTime = now;
      if (this.barcodeClearTimer) clearTimeout(this.barcodeClearTimer);
      this.barcodeClearTimer = setTimeout(() => { this.barcodeBuffer = ''; }, 400);
    }
  }

  // Registramos touchstart para saber si luego hubo movimiento
  @HostListener('document:touchstart', ['$event'])
  onTouchStart(event: TouchEvent): void {
    this.touchStartY = event.touches[0]?.clientY ?? 0;
    this.touchMoved  = false;
  }

  @HostListener('document:touchmove', ['$event'])
  onTouchMove(event: TouchEvent): void {
    const dy = Math.abs((event.touches[0]?.clientY ?? 0) - this.touchStartY);
    if (dy > 8) this.touchMoved = true;
  }

  // Solo cerramos el dropdown si el toque fue un tap (sin scroll)
  @HostListener('document:touchend', ['$event'])
  onTouchEnd(event: TouchEvent): void {
    if (this.touchMoved) return;
    const target = event.target as HTMLElement;
    const searchSection = document.querySelector('.search-section');
    if (searchSection && !searchSection.contains(target)) {
      this.showSearchResults = false;
    }
  }

  // Fallback para mouse (desktop)
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (event instanceof PointerEvent && event.pointerType === 'touch') return; // ya lo maneja touchend
    const target = event.target as HTMLElement;
    const searchSection = document.querySelector('.search-section');
    if (searchSection && !searchSection.contains(target)) {
      this.showSearchResults = false;
    }
  }

  // ── Sesión ────────────────────────────────────────────────────────────────

  loadActiveSession(): void {
    this.isLoading = true;
    this.countService.getActiveSession().subscribe({
      next: (s) => { this.session = s; this.isLoading = false; },
      error: () => { this.session = null; this.isLoading = false; },
    });
  }

  createSession(): void {
    this.isCreating = true;
    this.countService.createSession().subscribe({
      next: (s) => {
        this.session = s;
        this.isCreating = false;
        toast.success(`Sesión ${s.sessionNumber} iniciada`);
        setTimeout(() => this.searchInputRef?.nativeElement?.focus(), 200);
      },
      error: (err) => {
        this.isCreating = false;
        toast.error(err?.error?.message || 'Error al crear la sesión');
      },
    });
  }

  pauseSession(): void {
    if (!this.session) return;
    this.countService.pauseSession(this.session.id).subscribe({
      next: (s) => { this.session = s; toast.info(`Sesión ${s.sessionNumber} pausada`); },
      error: () => toast.error('Error al pausar la sesión'),
    });
  }

  completeSession(): void {
    if (!this.session) return;
    toast.warning(`¿Finalizar sesión ${this.session.sessionNumber}?`, {
      description: 'No podrás agregar más conteos después.',
      action: {
        label: 'Sí, finalizar',
        onClick: () => {
          this.countService.completeSession(this.session!.id).subscribe({
            next: (s) => { this.session = s; toast.success(`Sesión ${s.sessionNumber} completada`); },
            error: () => toast.error('Error al finalizar la sesión'),
          });
        },
      },
    });
  }

  // ── Búsqueda ─────────────────────────────────────────────────────────────

  onSearchInput(): void {
    this.activeSearchIndex = -1;
    const q = this.searchQuery.trim().toLowerCase();
    if (q.length < 2) {
      this.showSearchResults = false;
      this.searchResults = [];
      return;
    }
    const results: { product: Product; presentation: Presentation }[] = [];
    for (const prod of this.allProducts) {
      for (const pres of prod.presentations || []) {
        const combined = this.buildLabel(prod.description, pres.label).toLowerCase();
        const barcode  = (pres.barcode || '').toLowerCase();
        if ((combined.includes(q) || barcode.includes(q)) && pres.active !== false) {
          results.push({ product: prod, presentation: pres });
        }
      }
    }
    this.searchResults = results.slice(0, 15);
    this.showSearchResults = this.searchResults.length > 0;
  }

  onSearchKeyDown(event: KeyboardEvent): void {
    if (this.showSearchResults && this.searchResults.length > 0) {
      if (event.key === 'ArrowDown') { event.preventDefault(); this.activeSearchIndex = Math.min(this.activeSearchIndex + 1, this.searchResults.length - 1); return; }
      if (event.key === 'ArrowUp')   { event.preventDefault(); this.activeSearchIndex = Math.max(this.activeSearchIndex - 1, -1); return; }
      if (event.key === 'Enter' && this.activeSearchIndex >= 0) { event.preventDefault(); this.selectResult(this.searchResults[this.activeSearchIndex]); return; }
      if (event.key === 'Escape') { this.showSearchResults = false; return; }
    }
    if (event.key === 'Enter') {
      const q = this.searchQuery.trim();
      if (q) this.processBarcode(q);
    }
  }

  selectResult(result: { product: Product; presentation: Presentation }): void {
    this.searchQuery       = '';
    this.showSearchResults = false;

    const activePres = (result.product.presentations || []).filter(p => p.active !== false);

    if (activePres.length >= 2) {
      // ── Modo bulk: mostrar todas las presentaciones activas del producto ──
      this.isBulkMode       = true;
      this.bulkProduct      = result.product;
      this.bulkPresentations = activePres;
      this.bulkQtys         = {};
      this.selectedProduct  = null;
      this.countedQty       = null;

      // Pre-llenar con lo que ya se haya contado en esta sesión
      for (const pres of activePres) {
        const counted = this.session?.entries.find(e => e.barcode === pres.barcode);
        this.bulkQtys[pres.barcode!] = counted ? counted.countedQty : null;
      }
    } else {
      // ── Modo single: comportamiento original ──
      this.isBulkMode      = false;
      this.bulkProduct     = null;
      this.selectedProduct = result;
      this.countedQty      = null;

      const existing = this.session?.entries.find(e => e.barcode === result.presentation.barcode);
      if (existing) this.countedQty = existing.countedQty;

      setTimeout(() => document.getElementById('qty-input')?.focus(), 100);
    }
  }

  private processBarcode(barcode: string): void {
    const found = this.findByBarcode(barcode);
    if (!found) { toast.warning(`Código no encontrado: ${barcode}`); return; }
    this.selectResult(found);
  }

  // ── Cantidad — adaptada a la unidad de medida ─────────────────────────────

  /** true si la presentación seleccionada se mide por unidades enteras */
  get isUnitBased(): boolean {
    return this.selectedProduct?.presentation?.unitMeasure === UnitMeasure.UNIDAD;
  }

  /** Paso del input y los botones +/- según la unidad */
  get qtyStep(): number {
    return this.isUnitBased ? 1 : 0.5;
  }

  /** Etiqueta de unidad para mostrar junto al input */
  get unitLabel(): string {
    const um = this.selectedProduct?.presentation?.unitMeasure;
    if (!um) return '';
    return UnitMeasureLabels[um] ?? um;
  }

  incrementQty(): void {
    this.countedQty = parseFloat(((this.countedQty ?? 0) + this.qtyStep).toFixed(3));
  }

  decrementQty(): void {
    this.countedQty = parseFloat((Math.max(0, (this.countedQty ?? 0) - this.qtyStep)).toFixed(3));
  }

  // ── Confirmar conteo ─────────────────────────────────────────────────────

  confirmCount(): void {
    if (!this.session || !this.selectedProduct || this.countedQty == null) return;
    if (this.isSaving) return;

    const { product, presentation } = this.selectedProduct;
    const request: RecordCountRequest = {
      barcode: presentation.barcode,
      productId: product.id,
      description: this.buildLabel(product.description, presentation.label),
      presentationLabel: presentation.label || '',
      countedQty: this.countedQty,
    };

    this.isSaving = true;
    this.countService.recordCount(this.session.id, request).subscribe({
      next: (s) => {
        this.session  = s;
        this.isSaving = false;
        toast.success(`✓ ${request.description} — ${this.countedQty} ${this.unitLabel}`);
        this.clearSelection();
        setTimeout(() => this.searchInputRef?.nativeElement?.focus(), 150);
      },
      error: () => { this.isSaving = false; toast.error('Error al registrar el conteo'); },
    });
  }

  clearSelection(): void {
    this.selectedProduct = null;
    this.countedQty      = null;
    this.searchQuery     = '';
    this.showSearchResults = false;
    this.clearBulkMode();
  }

  // ── Conteo bulk (múltiples presentaciones) ───────────────────────────────

  confirmBulkCount(): void {
    if (!this.session || !this.bulkProduct || this.isSaving) return;

    // Validar que TODAS las presentaciones estén llenas (0 es válido, null/undefined no)
    const unfilled = this.bulkPresentations.filter(p => this.bulkQtys[p.barcode!] == null);
    if (unfilled.length > 0) {
      toast.warning(
        `Faltan ${unfilled.length} presentación(es) por llenar. Ingresa 0 si no hay existencias.`
      );
      return;
    }

    // Incluir TODAS las presentaciones (incluso las que tienen qty=0)
    const requests: RecordCountRequest[] = this.bulkPresentations.map(pres => ({
      barcode:           pres.barcode!,
      productId:         this.bulkProduct!.id,
      description:       this.buildLabel(this.bulkProduct!.description, pres.label),
      presentationLabel: pres.label || '',
      countedQty:        this.bulkQtys[pres.barcode!]!,
    }));

    const bulkRequest: BulkCountRequest = { entries: requests };
    this.isSaving = true;

    this.countService.recordBulkCount(this.session.id, bulkRequest).subscribe({
      next: (s) => {
        this.session  = s;
        this.isSaving = false;
        toast.success(`✓ ${this.bulkProduct!.description} — ${requests.length} presentación(es) guardadas`);
        this.clearBulkMode();
        setTimeout(() => this.searchInputRef?.nativeElement?.focus(), 150);
      },
      error: () => { this.isSaving = false; toast.error('Error al registrar el conteo'); },
    });
  }

  clearBulkMode(): void {
    this.isBulkMode        = false;
    this.bulkProduct       = null;
    this.bulkPresentations = [];
    this.bulkQtys          = {};
  }

  incrementBulkQty(barcode: string, step: number): void {
    const current = this.bulkQtys[barcode] ?? 0;
    this.bulkQtys[barcode] = parseFloat((current + step).toFixed(3));
  }

  decrementBulkQty(barcode: string, step: number): void {
    const current = this.bulkQtys[barcode] ?? 0;
    this.bulkQtys[barcode] = parseFloat((Math.max(0, current - step)).toFixed(3));
  }

  bulkQtyStep(pres: Presentation): number {
    return pres.unitMeasure === UnitMeasure.UNIDAD ? 1 : 0.5;
  }

  bulkUnitLabel(pres: Presentation): string {
    return pres.unitMeasure ? (UnitMeasureLabels[pres.unitMeasure] ?? pres.unitMeasure) : '';
  }

  // ── Editor rápido (bottom sheet) ─────────────────────────────────────────

  /** Abre el sheet de edición para una presentación específica del modo bulk */
  openEditSheetForPresentation(pres: Presentation): void {
    if (!this.bulkProduct) return;
    this.editFromBulkMode = true;
    this.selectedProduct  = { product: this.bulkProduct, presentation: pres };
    this.openEditSheet();
  }

  openEditSheet(): void {
    if (!this.selectedProduct) return;
    const { product, presentation } = this.selectedProduct;
    this.availablePackageTypes = getPackageTypes(product.saleType ?? 'OTHER');
    this.editForm = this.fb.group({
      // Producto
      description: [product.description, Validators.required],
      brand:       [product.brand || ''],
      category:    [product.category || ''],
      // Presentación
      label:         [presentation.label || ''],
      unitMeasure:   [presentation.unitMeasure || 'UNIDAD'],
      barcode:       [presentation.barcode, Validators.required],
      salePrice:     [this._formatPrice(presentation.salePrice)],
      costPrice:     [this._formatPrice(presentation.costPrice)],
      packageType:   [presentation.packageType || ''],
      isBulk:        [presentation.isBulk ?? false],
      isFixedAmount: [presentation.isFixedAmount ?? false],
      fixedAmount:   [presentation.fixedAmount ?? null],
      active:        [presentation.active !== false],
    });
    this.showEditSheet = true;
  }

  /** Cuando cambia el embalaje, deriva isBulk e isFixedAmount automáticamente */
  onPackageTypeChange(): void {
    const key = this.editForm.get('packageType')?.value;
    if (!key || !this.selectedProduct) return;
    const cfg = findPackageType(this.selectedProduct.product.saleType ?? 'OTHER', key);
    if (!cfg) return;
    const isFixed = cfg.saleMode === 'FIXED_FULL' || cfg.saleMode === 'FIXED_HALF';
    this.editForm.patchValue({
      isBulk:        cfg.saleMode === 'BULK',
      isFixedAmount: isFixed,
      fixedAmount:   isFixed ? (this.editForm.get('fixedAmount')?.value ?? null) : null,
    });
  }

  get isFixedAmountSelected(): boolean {
    return !!this.editForm?.get('isFixedAmount')?.value;
  }

  closeEditSheet(): void {
    if (this.editFromBulkMode && this.selectedProduct) {
      this._restoreBulkMode(this.selectedProduct.product);
      this.editFromBulkMode = false;
    }
    this.showEditSheet = false;
  }

  /** Restaura el modo bulk con el producto actualizado, preservando las qtys ingresadas */
  private _restoreBulkMode(prod: Product): void {
    const activePres = (prod.presentations || []).filter(p => p.active !== false);
    const newQtys: { [barcode: string]: number | null } = {};
    for (const pres of activePres) {
      newQtys[pres.barcode!] = this.bulkQtys[pres.barcode!] ??
        (this.session?.entries.find(e => e.barcode === pres.barcode)?.countedQty ?? null);
    }
    this.isBulkMode        = true;
    this.bulkProduct       = prod;
    this.bulkPresentations = activePres;
    this.bulkQtys          = newQtys;
    this.selectedProduct   = null;
  }

  saveEdit(): void {
    if (!this.selectedProduct || this.editForm.invalid || this.isSavingEdit) return;
    const { product, presentation } = this.selectedProduct;
    const v = this.editForm.getRawValue();
    this.isSavingEdit = true;

    // 1) Actualizar campos del producto (PUT con objeto completo)
    const updatedProduct: Product = {
      ...product,
      description: v.description,
      brand:       v.brand,
      category:    v.category,
    };

    this.productoService.update(updatedProduct, product.id).subscribe({
      next: (savedProd) => {
        // 2) Actualizar presentación vía PATCH
        const presPatch: Partial<Presentation> = {
          label:         v.label,
          barcode:       v.barcode,
          salePrice:     this._parsePrice(v.salePrice),
          costPrice:     this._parsePrice(v.costPrice),
          unitMeasure:   v.unitMeasure,
          packageType:   v.packageType || undefined,
          isBulk:        v.isBulk,
          isFixedAmount: v.isFixedAmount,
          fixedAmount:   v.isFixedAmount && v.fixedAmount != null ? +v.fixedAmount : undefined,
          active:        v.active,
        };

        if (!presentation.id) {
          // Sin ID de presentación: solo refleja cambios en memoria
          this._applyUpdate(savedProd, undefined, presPatch);
          this.isSavingEdit = false;
          this.showEditSheet = false;
          toast.success('Producto actualizado');
          return;
        }

        this.productoService.updatePresentation(product.id, presentation.id, presPatch).subscribe({
          next: (finalProd) => {
            this._applyUpdate(finalProd, presentation.id);
            this.isSavingEdit = false;
            if (this.editFromBulkMode && this.selectedProduct) {
              this._restoreBulkMode(finalProd);
              this.editFromBulkMode = false;
            }
            this.showEditSheet = false;
            toast.success('Producto actualizado correctamente');
          },
          error: () => {
            this.isSavingEdit = false;
            toast.error('Error al actualizar la presentación');
          },
        });
      },
      error: () => {
        this.isSavingEdit = false;
        toast.error('Error al actualizar el producto');
      },
    });
  }

  // ── Helpers de formato de precios ────────────────────────────────────────

  /** Formatea un número como moneda COP (ej. 1250000 → "1.250.000") */
  _formatPrice(value: number | null | undefined): string {
    const n = Number(value) || 0;
    if (n === 0) return '';
    return new Intl.NumberFormat('es-CO', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(n);
  }

  /** Parsea string formateado de vuelta a número ("1.250.000" → 1250000) */
  private _parsePrice(val: any): number {
    if (typeof val === 'number') return val;
    const digits = String(val ?? '').replace(/\./g, '').replace(',', '.');
    return parseFloat(digits) || 0;
  }

  /** Formatea en tiempo real mientras el usuario escribe en un campo de precio */
  onPriceInput(event: Event, controlName: string): void {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '');
    const num    = parseInt(digits, 10) || 0;
    const formatted = num > 0
      ? new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num)
      : '';
    // Actualizar el input visualmente y el control del formulario
    input.value = formatted;
    this.editForm.get(controlName)?.setValue(formatted, { emitEvent: false });
  }

  /** Actualiza allProducts y selectedProduct con la respuesta del servidor */
  private _applyUpdate(prod: Product, presId?: string, fallbackPatch?: Partial<Presentation>): void {
    const idx = this.allProducts.findIndex(p => p.id === prod.id);
    if (idx >= 0) this.allProducts[idx] = prod;

    const pres = presId
      ? prod.presentations?.find(p => p.id === presId)
      : prod.presentations?.find(p => p.barcode === this.selectedProduct?.presentation.barcode);

    if (pres) {
      this.selectedProduct = { product: prod, presentation: pres };
    } else if (fallbackPatch) {
      this.selectedProduct = {
        product: prod,
        presentation: { ...this.selectedProduct!.presentation, ...fallbackPatch } as Presentation,
      };
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private loadProducts(): void {
    this.productoService.getAll().subscribe({
      next: (products) => { this.allProducts = products; },
      error: () => toast.error('Error al cargar el catálogo de productos'),
    });
  }

  /** Abre la tarjeta de conteo para editar un conteo ya registrado */
  editEntry(entry: InventoryCountEntryDto): void {
    const found = this.findByBarcodeIncludingInactive(entry.barcode);
    if (!found) { toast.warning('Producto no encontrado en el catálogo'); return; }
    this.selectResult(found);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  private findByBarcode(barcode: string): { product: Product; presentation: Presentation } | null {
    const code = barcode.trim().toLowerCase();
    for (const prod of this.allProducts) {
      for (const pres of prod.presentations || []) {
        if ((pres.barcode || '').toLowerCase() === code && pres.active !== false) {
          return { product: prod, presentation: pres };
        }
      }
    }
    return null;
  }

  /** Como findByBarcode pero también incluye presentaciones inactivas (para editar conteos) */
  private findByBarcodeIncludingInactive(barcode: string): { product: Product; presentation: Presentation } | null {
    const code = barcode.trim().toLowerCase();
    for (const prod of this.allProducts) {
      for (const pres of prod.presentations || []) {
        if ((pres.barcode || '').toLowerCase() === code) {
          return { product: prod, presentation: pres };
        }
      }
    }
    return null;
  }

  buildLabel(description: string, label?: string): string {
    return label ? `${description} - ${label}` : description;
  }

  statusLabel(status: string): string {
    const map: Record<string, string> = { IN_PROGRESS: 'En progreso', PAUSED: 'Pausada', COMPLETED: 'Completada', CANCELLED: 'Cancelada' };
    return map[status] ?? status;
  }

  differenceClass(entry: InventoryCountEntryDto): string {
    if (entry.difference > 0) return 'text-success';
    if (entry.difference < 0) return 'text-danger';
    return 'text-muted';
  }

  goBack(): void { this.router.navigate(['/main/inicio']); }

  // ── Impresión de etiquetas ─────────────────────────────────────────────────

  /** Abre el label sheet para una entrada ya contada (desde la lista de contados) */
  printEntryLabel(entry: InventoryCountEntryDto): void {
    const found = this.findByBarcodeIncludingInactive(entry.barcode);
    const items: LabelSheetItem[] = [];

    if (found) {
      const { product, presentation } = found;
      const unitAbbr = UNIT_ABBREVIATIONS[presentation.unitMeasure] || presentation.unitMeasure;
      items.push({
        barcode:     presentation.barcode || entry.barcode,
        description: entry.description,
        brand:       product.brand || '',
        salePrice:   presentation.isBulk
                       ? (presentation.salePrice || 0) + ' ' + unitAbbr
                       : (presentation.salePrice || 0),
        copies: 1,
      });
    } else {
      // Fallback si el producto ya no está en catálogo
      items.push({ barcode: entry.barcode, description: entry.description, brand: '', salePrice: 0, copies: 1 });
    }

    this.openLabelSheet(items);
  }

  openLabelSheet(items: LabelSheetItem[]): void {
    this.labelConfig    = this.labelConfigService.getConfig();
    this.labelSheetItems = items;
    this.showLabelSheet  = true;
  }

  closeLabelSheet(): void {
    this.showLabelSheet  = false;
    this.labelSheetItems = [];
    setTimeout(() => this.searchInputRef?.nativeElement?.focus(), 150);
  }

  onLabelConfigSaved(config: LabelConfig): void {
    this.labelConfig = config;
  }

  decrementLabelCopies(item: LabelSheetItem): void {
    item.copies = Math.max(1, item.copies - 1);
  }

  incrementLabelCopies(item: LabelSheetItem): void {
    item.copies = item.copies + 1;
  }

  generateAndPrintLabels(): void {
    if (!this.labelSheetItems.length || this.isGeneratingLabels) return;
    this.isGeneratingLabels = true;

    const config  = this.labelConfig;
    const columns = config.columns || 1;
    const labelW  = config.labelWidth;
    const labelH  = config.labelHeight;
    const colGap  = config.columnGap || 0;

    // Expandir según copias
    const expanded: LabelSheetItem[] = [];
    this.labelSheetItems.forEach(item => {
      for (let i = 0; i < (item.copies || 1); i++) expanded.push(item);
    });

    const rollWidth  = config.marginLeft + (labelW * columns) + (colGap * (columns - 1)) + config.marginRight;
    const pageHeight = config.marginTop + labelH + config.marginBottom;

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [pageHeight, rollWidth] });

    let idx = 0;
    let firstPage = true;
    while (idx < expanded.length) {
      if (!firstPage) doc.addPage([pageHeight, rollWidth], 'landscape');
      firstPage = false;
      for (let col = 0; col < columns && idx < expanded.length; col++) {
        const x = config.marginLeft + col * (labelW + colGap);
        this._drawLabel(doc, expanded[idx], x, config.marginTop);
        idx++;
      }
    }

    // Abrir en nueva pestaña para imprimir
    const blob = doc.output('blob');
    const url  = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);

    this.isGeneratingLabels = false;
    this.closeLabelSheet();
    toast.success('PDF abierto — usa Ctrl+P para imprimir');
  }

  private _drawLabel(doc: jsPDF, item: LabelSheetItem, x: number, y: number): void {
    const config  = this.labelConfig;
    const w       = config.labelWidth;
    const h       = config.labelHeight;
    const centerX = x + w / 2;
    let   curY    = y + 1;
    const ls      = h / 6;

    if (config.showCompanyName) {
      doc.setFontSize(Math.max(4, Math.min(6, w / 10)));
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text(config.companyName || 'CONCENTRADOS LA 28', centerX, curY + 2.5, { align: 'center' });
      curY += ls * 0.8;
    }

    if (config.showBarcode && item.barcode) {
      try {
        const canvas = document.createElement('canvas');
        JsBarcode(canvas, item.barcode, { format: 'CODE128', width: 2, height: 40, displayValue: false, margin: 0, background: '#ffffff' });
        const bw = Math.min(w - 4, w * 0.85);
        const bh = Math.min(h * 0.25, 6);
        doc.addImage(canvas.toDataURL('image/png'), 'PNG', x + (w - bw) / 2, curY, bw, bh);
        curY += bh + 1;
      } catch (e) { console.warn('Barcode error', item.barcode, e); }
    }

    if (config.showBarcodeNumber) {
      doc.setFontSize(Math.max(5, Math.min(8, w / 7)));
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text(item.barcode, centerX, curY + 2, { align: 'center' });
      curY += ls * 0.7;
    }

    if (config.showDescription) {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      let lines: string[] = doc.splitTextToSize(item.description || '', w - 2);
      if (lines.length > 4) { lines = lines.slice(0, 4); lines[3] = lines[3].substring(0, lines[3].length - 3) + '...'; }
      lines.forEach((l: string, i: number) => doc.text(l, centerX, curY + 2.5 + i * 2.5, { align: 'center' }));
      curY += 2.5 * lines.length;
    }

    if (config.showBrand && item.brand) {
      doc.setFontSize(Math.max(4, Math.min(6, w / 10)));
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(80, 80, 80);
      doc.text(item.brand, centerX, curY + 2, { align: 'center' });
      doc.setTextColor(0, 0, 0);
      curY += ls * 0.6;
    }

    if (config.showPrice) {
      doc.setFontSize(Math.max(8, Math.min(9, w / 6)));
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text(this._formatLabelPrice(item.salePrice), centerX, Math.min(curY + 3, y + h - 2), { align: 'center' });
    }
  }

  private _formatLabelPrice(price: number | string): string {
    if (typeof price === 'string') {
      const parts = price.split(' ');
      const num   = parseFloat(parts[0]);
      const unit  = parts.slice(1).join(' ');
      const fmt   = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num);
      return unit ? `${fmt}/${unit}` : fmt;
    }
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(price);
  }

  get reversedEntries(): InventoryCountEntryDto[] {
    return this.session ? [...this.session.entries].reverse() : [];
  }

  /** Busca el producto en allProducts a partir de cualquier barcode de sus presentaciones */
  getProductForBarcode(barcode: string): Product | null {
    const code = barcode.toLowerCase();
    for (const prod of this.allProducts) {
      for (const pres of prod.presentations || []) {
        if ((pres.barcode || '').toLowerCase() === code) return prod;
      }
    }
    return null;
  }

  getCountedQty(barcode: string): number | null {
    const entry = this.session?.entries.find(e => e.barcode === barcode);
    return entry ? entry.countedQty : null;
  }
}
