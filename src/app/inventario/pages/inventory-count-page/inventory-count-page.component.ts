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
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { toast } from 'ngx-sonner';

import { Product, Presentation, UnitMeasure, UnitMeasureLabels } from '../../../producto/producto';
import { ProductoService } from '../../../producto/producto.service';
import { LoginUserService } from '../../../auth/login/loginUser.service';
import { InventoryCountService } from '../../services/inventory-count.service';
import {
  InventoryCountEntryDto,
  InventoryCountSessionDto,
  RecordCountRequest,
} from '../../models/inventory-count';

@Component({
  selector: 'app-inventory-count-page',
  standalone: true,
  imports: [CommonModule, FormsModule, DecimalPipe],
  templateUrl: './inventory-count-page.component.html',
  styleUrl: './inventory-count-page.component.css',
})
export class InventoryCountPageComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('searchInputRef') searchInputRef!: ElementRef<HTMLInputElement>;

  private countService    = inject(InventoryCountService);
  private productoService = inject(ProductoService);
  private loginUserService = inject(LoginUserService);
  private router = inject(Router);

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

  // Producto seleccionado para contar
  selectedProduct: { product: Product; presentation: Presentation } | null = null;
  countedQty: number | null = null;

  // Escáner HID
  private barcodeBuffer = '';
  private barcodeStartTime = 0;
  private barcodeClearTimer: ReturnType<typeof setTimeout> | null = null;

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
        if (combined.includes(q) || barcode.includes(q)) {
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
    this.selectedProduct = result;
    this.countedQty = null;
    this.searchQuery = '';
    this.showSearchResults = false;

    const existing = this.session?.entries.find(e => e.barcode === result.presentation.barcode);
    if (existing) this.countedQty = existing.countedQty;

    setTimeout(() => document.getElementById('qty-input')?.focus(), 100);
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
        this.session = s;
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
    this.countedQty = null;
    this.searchQuery = '';
    this.showSearchResults = false;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private loadProducts(): void {
    this.productoService.getAll().subscribe({
      next: (products) => { this.allProducts = products; },
      error: () => toast.error('Error al cargar el catálogo de productos'),
    });
  }

  private findByBarcode(barcode: string): { product: Product; presentation: Presentation } | null {
    const code = barcode.trim().toLowerCase();
    for (const prod of this.allProducts) {
      for (const pres of prod.presentations || []) {
        if ((pres.barcode || '').toLowerCase() === code) return { product: prod, presentation: pres };
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

  get reversedEntries(): InventoryCountEntryDto[] {
    return this.session ? [...this.session.entries].reverse() : [];
  }

  getCountedQty(barcode: string): number | null {
    const entry = this.session?.entries.find(e => e.barcode === barcode);
    return entry ? entry.countedQty : null;
  }
}
