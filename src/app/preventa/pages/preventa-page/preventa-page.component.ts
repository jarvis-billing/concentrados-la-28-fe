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
import { CommonModule, CurrencyPipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { toast } from 'ngx-sonner';

import { Presentation, Product, UnitMeasure } from '../../../producto/producto';
import { ESaleType } from '../../../producto/producto';
import { ProductoService } from '../../../producto/producto.service';
import { LoginUserService } from '../../../auth/login/loginUser.service';
import { PreSaleService } from '../../services/pre-sale.service';
import {
  CreatePreSaleRequest,
  PreSaleDto,
  PreSaleItemDto,
} from '../../models/pre-sale';

@Component({
  selector: 'app-preventa-page',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyPipe, DecimalPipe, RouterLink],
  templateUrl: './preventa-page.component.html',
  styleUrl: './preventa-page.component.css',
})
export class PreventaPageComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('barcodeInputRef') barcodeInputRef!: ElementRef<HTMLInputElement>;
  @ViewChild('bulkAmountInputRef') bulkAmountInputRef!: ElementRef<HTMLInputElement>;
  sellerName = '';
  isVendedor = false;
  showUserMenu = false;
  items: PreSaleItemDto[] = [];
  totalAmount = 0;
  isSaving = false;
  savedPreSale: PreSaleDto | null = null;

  barcodeInputValue = '';
  scannerActive = true;
  searchResults: { product: Product; presentation: Presentation }[] = [];
  showSearchResults = false;
  activeSearchIndex = -1;

  itemsSortOrder: 'desc' | 'asc' = 'desc';

  get displayItems(): { item: PreSaleItemDto; idx: number }[] {
    const indexed = this.items.map((item, idx) => ({ item, idx }));
    return this.itemsSortOrder === 'desc' ? [...indexed].reverse() : indexed;
  }

  toggleItemsSort(): void {
    this.itemsSortOrder = this.itemsSortOrder === 'desc' ? 'asc' : 'desc';
  }

  showBulkDrawer = false;
  pendingBulkProduct: Product | null = null;
  pendingBulkEditIndex: number | null = null;
  bulkAmountValue: number | null = null;
  bulkComputedQty = 0;
  bulkQuickAmounts: number[] = [];

  pendingPreSales: PreSaleDto[] = [];
  showPendingPanel = false;
  isPendingLoading = false;
  canDismiss = false;

  private allProducts: Product[] = [];
  private sessionAmountsMap = new Map<string, number[]>();

  private barcodeBuffer = '';
  private barcodeStartTime = 0;
  private barcodeClearTimer: ReturnType<typeof setTimeout> | null = null;

  private preSaleService = inject(PreSaleService);
  private productoService = inject(ProductoService);
  private router = inject(Router);
  private loginUserService = inject(LoginUserService);

  ngOnInit(): void {
    const user = this.loginUserService.getUserFromToken();
    if (user) {
      this.sellerName = `${user.name || ''} ${user.lastName || ''}`.trim() || user.username || 'Vendedor';
      const rol: string = user.rol || '';
      this.canDismiss = rol.includes('ADMIN') || rol.includes('FACTURADOR');
      this.isVendedor = !this.canDismiss;
      this.loadPendingPreSales();
    }
    this.productoService.getAll().subscribe({
      next: (products) => { this.allProducts = products; },
      error: () => toast.error('Error al cargar el catálogo de productos'),
    });
  }

  ngAfterViewInit(): void {
    // Scanner inicia activo: input deshabilitado, HID captura barcodes
    this.barcodeInputRef?.nativeElement?.setAttribute('disabled', 'true');
  }

  ngOnDestroy(): void {
    if (this.barcodeClearTimer) clearTimeout(this.barcodeClearTimer);
  }

  // =============================================
  // LECTOR CÓDIGO DE BARRAS (HID keyboard device)
  // =============================================

  @HostListener('document:keydown', ['$event'])
  onGlobalKeyDown(event: KeyboardEvent): void {
    if (!this.scannerActive || this.showBulkDrawer || this.showPendingPanel) return;
    const target = event.target as HTMLElement;
    if (target === this.barcodeInputRef?.nativeElement) return;
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

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const scannerSection = document.querySelector('.scanner-section');
    if (scannerSection && !scannerSection.contains(target)) {
      this.showSearchResults = false;
    }
    const userMenu = document.querySelector('.user-menu-container');
    if (userMenu && !userMenu.contains(target)) {
      this.showUserMenu = false;
    }
  }

  toggleUserMenu(): void {
    this.showUserMenu = !this.showUserMenu;
  }

  logout(): void {
    localStorage.removeItem('authToken');
    this.router.navigate(['/login']);
  }

  onBarcodeEnter(): void {
    const code = this.barcodeInputValue.trim();
    if (!code) return;
    this.processBarcode(code);
    this.barcodeInputValue = '';
  }

  private processBarcode(barcode: string): void {
    const found = this.findPresentationByBarcode(barcode);
    if (!found) {
      toast.warning(`Código no encontrado: ${barcode}`);
      return;
    }
    const mapped = this.mapPresentation(found.product, found.presentation);
    this.addOrAccumulate(mapped);
  }

  private addOrAccumulate(product: Product): void {
    const code = (product.barcode || '').toLowerCase();
    const existingIdx = this.items.findIndex(
      (i) => (i.barcode || '').toLowerCase() === code
    );

    if (existingIdx >= 0 && !this.items[existingIdx].isBulk) {
      this.items[existingIdx].amount += 1;
      this.items[existingIdx].subTotal =
        this.items[existingIdx].amount * this.items[existingIdx].price;
      this.recalcTotal();
      toast.success(
        `+1 · ${this.items[existingIdx].description} → ${this.items[existingIdx].amount} uds.`
      );
      return;
    }

    if (product.isBulk) {
      this.pendingBulkProduct = product;
      this.pendingBulkEditIndex = existingIdx >= 0 ? existingIdx : null;
      this.bulkAmountValue =
        existingIdx >= 0 ? (this.items[existingIdx].bulkInputAmount ?? null) : null;
      this.bulkComputedQty = existingIdx >= 0 ? this.items[existingIdx].amount : 0;
      this.showBulkDrawer = true;
      setTimeout(() => {
        this.buildQuickAmounts();
        this.bulkAmountInputRef?.nativeElement?.focus();
      }, 300);
      return;
    }

    this.items.push({
      barcode: product.barcode,
      productId: product.id,
      description: product.description,
      saleType: product.saleType,
      unitMeasure: product.selectedUnitMeasure ?? UnitMeasure.UNIDAD,
      presentationLabel: product.selectedPresentationLabel ?? '',
      price: product.price,
      amount: 1,
      isBulk: false,
      subTotal: product.price,
    });
    this.recalcTotal();
    toast.success(`✓ ${product.description}`);
  }

  // =============================================
  // GRANEL — BOTTOM DRAWER
  // =============================================

  onBulkAmountChange(): void {
    const v = Number(this.bulkAmountValue) || 0;
    const price = Number(this.pendingBulkProduct?.price) || 0;
    this.bulkComputedQty =
      price > 0 ? Math.round((v / price) * 10000) / 10000 : 0;
  }

  confirmBulkInput(): void {
    const totalMoney = Number(this.bulkAmountValue) || 0;
    if (totalMoney <= 0 || !this.pendingBulkProduct) return;

    const price = Number(this.pendingBulkProduct.price) || 0;
    const amount =
      price > 0 ? Math.round((totalMoney / price) * 10000) / 10000 : 0;

    if (this.pendingBulkEditIndex !== null && this.pendingBulkEditIndex >= 0) {
      this.items[this.pendingBulkEditIndex].amount = amount;
      this.items[this.pendingBulkEditIndex].bulkInputAmount = totalMoney;
      this.items[this.pendingBulkEditIndex].subTotal = totalMoney;
    } else {
      this.items.push({
        barcode: this.pendingBulkProduct.barcode,
        productId: this.pendingBulkProduct.id,
        description: this.pendingBulkProduct.description,
        saleType: this.pendingBulkProduct.saleType,
        unitMeasure: this.pendingBulkProduct.selectedUnitMeasure ?? UnitMeasure.UNIDAD,
        presentationLabel: this.pendingBulkProduct.selectedPresentationLabel ?? '',
        price,
        amount,
        isBulk: true,
        bulkInputAmount: totalMoney,
        subTotal: totalMoney,
      });
    }
    const productId = this.pendingBulkProduct.id;
    const hist = this.sessionAmountsMap.get(productId) ?? [];
    if (!hist.includes(totalMoney)) {
      this.sessionAmountsMap.set(productId, [totalMoney, ...hist].slice(0, 5));
    }
    this.recalcTotal();
    this.closeBulkDrawer();
  }

  cancelBulkInput(): void {
    this.closeBulkDrawer();
  }

  private closeBulkDrawer(): void {
    this.showBulkDrawer = false;
    this.pendingBulkProduct = null;
    this.pendingBulkEditIndex = null;
    this.bulkAmountValue = null;
    this.bulkComputedQty = 0;
    // Si scanner está pausado, devolver foco al input de búsqueda
    if (!this.scannerActive) {
      setTimeout(() => this.focusBarcodeInput(), 150);
    }
  }

  // =============================================
  // CONTROLES DE ÍTEM
  // =============================================

  incrementItem(index: number): void {
    this.items[index].amount += 1;
    this.items[index].subTotal = this.items[index].amount * this.items[index].price;
    this.recalcTotal();
  }

  decrementItem(index: number): void {
    if (this.items[index].amount > 1) {
      this.items[index].amount -= 1;
      this.items[index].subTotal = this.items[index].amount * this.items[index].price;
      this.recalcTotal();
    }
  }

  editBulkItem(index: number): void {
    const item = this.items[index];
    const mock = new Product();
    mock.barcode = item.barcode;
    mock.id = item.productId;
    mock.description = item.description;
    mock.price = item.price;
    mock.isBulk = true;
    mock.saleType = item.saleType as ESaleType;
    mock.selectedUnitMeasure = item.unitMeasure as UnitMeasure;
    mock.selectedPresentationLabel = item.presentationLabel;

    this.pendingBulkProduct = mock;
    this.pendingBulkEditIndex = index;
    this.bulkAmountValue = item.bulkInputAmount ?? null;
    this.bulkComputedQty = item.amount;
    this.showBulkDrawer = true;
    setTimeout(() => {
      this.buildQuickAmounts();
      this.bulkAmountInputRef?.nativeElement?.focus();
    }, 300);
  }

  removeItem(index: number): void {
    this.items.splice(index, 1);
    this.recalcTotal();
  }

  // =============================================
  // ACCIONES PRINCIPALES
  // =============================================

  finalizePreventa(): void {
    if (this.items.length === 0 || this.isSaving) return;
    this.isSaving = true;

    const request: CreatePreSaleRequest = {
      sellerName: this.sellerName,
      items: this.items,
      totalAmount: this.totalAmount,
    };

    this.preSaleService.create(request).subscribe({
      next: (preSale) => {
        this.isSaving = false;
        this.savedPreSale = preSale;
        toast.success(`Preventa ${preSale.preSaleNumber} enviada al facturador`);
        this.items = [];
        this.totalAmount = 0;
        this.loadPendingPreSales();
      },
      error: () => {
        this.isSaving = false;
        toast.error('Error al enviar la preventa. Verifique la conexión.');
      },
    });
  }

  cancelPreventa(): void {
    if (this.items.length === 0) {
      this.newPreventa();
      return;
    }
    toast.warning('¿Cancelar la preventa?', {
      description: 'Se perderán todos los ítems agregados.',
      action: {
        label: 'Sí, cancelar',
        onClick: () => {
          this.items = [];
          this.totalAmount = 0;
          this.savedPreSale = null;
        },
      },
    });
  }

  newPreventa(): void {
    this.savedPreSale = null;
    this.items = [];
    this.totalAmount = 0;
    this.focusBarcodeInput();
  }

  toggleScanner(): void {
    this.scannerActive = !this.scannerActive;
    if (this.scannerActive) {
      toast.info('Escáner activado — HID listo');
      this.barcodeInputRef?.nativeElement?.setAttribute('disabled', 'true');
      this.barcodeInputRef?.nativeElement?.blur();
      this.showSearchResults = false;
      this.searchResults = [];
    } else {
      toast.info('Escáner pausado — busca por descripción');
      this.barcodeInputRef?.nativeElement?.removeAttribute('disabled');
      setTimeout(() => this.barcodeInputRef?.nativeElement?.focus(), 100);
    }
  }

  goBack(): void {
    this.router.navigate(['/main/inicio']);
  }

  // =============================================
  // UTILIDADES PRIVADAS
  // =============================================

  private recalcTotal(): void {
    this.totalAmount = this.items.reduce((s, i) => s + i.subTotal, 0);
  }

  onSearchInput(): void {
    this.activeSearchIndex = -1;
    const query = this.barcodeInputValue.trim().toLowerCase();
    if (query.length < 2) {
      this.showSearchResults = false;
      this.searchResults = [];
      return;
    }
    const results: { product: Product; presentation: Presentation }[] = [];
    for (const prod of this.allProducts) {
      const rootDesc = (prod.description || '').toLowerCase();
      for (const pres of prod.presentations || []) {
        const label = (pres.label || '').toLowerCase();
        const barcode = (pres.barcode || '').toLowerCase();
        const combined = label ? `${rootDesc} - ${label}` : rootDesc;
        if (combined.includes(query) || barcode.includes(query)) {
          results.push({ product: prod, presentation: pres });
        }
      }
    }
    this.searchResults = results.slice(0, 15);
    this.showSearchResults = this.searchResults.length > 0;
  }

  selectSearchResult(result: { product: Product; presentation: Presentation }): void {
    this.activeSearchIndex = -1;
    const mapped = this.mapPresentation(result.product, result.presentation);
    this.addOrAccumulate(mapped);
    this.barcodeInputValue = '';
    this.showSearchResults = false;
    this.searchResults = [];
    if (!this.scannerActive) {
      setTimeout(() => this.barcodeInputRef?.nativeElement?.focus(), 50);
    }
  }

  onSearchKeyDown(event: KeyboardEvent): void {
    if (this.showSearchResults && this.searchResults.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.activeSearchIndex = Math.min(this.activeSearchIndex + 1, this.searchResults.length - 1);
        this.scrollActiveResultIntoView();
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.activeSearchIndex = Math.max(this.activeSearchIndex - 1, -1);
        this.scrollActiveResultIntoView();
        return;
      }
      if (event.key === 'Enter' && this.activeSearchIndex >= 0) {
        event.preventDefault();
        this.selectSearchResult(this.searchResults[this.activeSearchIndex]);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        this.showSearchResults = false;
        this.activeSearchIndex = -1;
        return;
      }
    }
    if (event.key === 'Enter') {
      this.onBarcodeEnter();
    }
  }

  private scrollActiveResultIntoView(): void {
    setTimeout(() => {
      const el = document.getElementById(`search-result-${this.activeSearchIndex}`);
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 0);
  }

  private focusBarcodeInput(): void {
    // Solo enfocar si scanner está pausado (input habilitado para búsqueda)
    if (this.scannerActive) return;
    setTimeout(() => this.barcodeInputRef?.nativeElement?.focus(), 100);
  }

  private findPresentationByBarcode(
    barcode: string
  ): { product: Product; presentation: Presentation } | null {
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

  private mapPresentation(product: Product, presentation: Presentation): Product {
    const mapped: Product = { ...product };
    mapped.barcode = presentation.barcode;
    mapped.price = presentation.salePrice;
    mapped.selectedUnitMeasure = presentation.unitMeasure;
    mapped.selectedPresentationLabel = presentation.label || '';
    const rootDesc = (product.description || '').trim();
    const label = (presentation.label || '').trim();
    mapped.description = label ? `${rootDesc} - ${label}` : rootDesc;
    mapped.isBulk = presentation.isBulk ?? /granel/i.test(label);
    if (!mapped.amount || mapped.amount < 1) mapped.amount = 1;
    return mapped;
  }

  // =============================================
  // PREVENTAS PENDIENTES
  // =============================================

  loadPendingPreSales(): void {
    this.isPendingLoading = true;
    this.preSaleService.list({ status: 'PENDING', sellerName: this.sellerName }).subscribe({
      next: (data) => {
        this.pendingPreSales = data;
        this.isPendingLoading = false;
      },
      error: () => { this.isPendingLoading = false; },
    });
  }

  togglePendingPanel(): void {
    if (this.showBulkDrawer) return;
    this.showPendingPanel = !this.showPendingPanel;
    if (this.showPendingPanel) this.loadPendingPreSales();
  }

  resendPreSale(preSale: PreSaleDto): void {
    this.preSaleService.resendNotification(preSale.id).subscribe({
      next: () => toast.success(`Preventa ${preSale.preSaleNumber} reenviada al facturador`),
      error: () => toast.error('Error al reenviar la preventa'),
    });
  }

  dismissPreSale(preSale: PreSaleDto, event: Event): void {
    event.stopPropagation();
    toast.warning(`¿Desestimar ${preSale.preSaleNumber}?`, {
      description: 'El facturador no podrá importarla. Esta acción no se puede deshacer.',
      action: {
        label: 'Desestimar',
        onClick: () => {
          this.preSaleService.cancel(preSale.id).subscribe({
            next: () => {
              this.pendingPreSales = this.pendingPreSales.filter(p => p.id !== preSale.id);
              toast.success(`Preventa ${preSale.preSaleNumber} desestimada`);
            },
            error: () => toast.error('Error al desestimar la preventa'),
          });
        },
      },
    });
  }

  // =============================================
  // GRANEL — QUICK AMOUNTS
  // =============================================

  selectQuickAmount(amount: number): void {
    this.bulkAmountValue = amount;
    this.onBulkAmountChange();
  }

  private buildQuickAmounts(): void {
    if (!this.pendingBulkProduct) { this.bulkQuickAmounts = []; return; }
    const price = this.pendingBulkProduct.price;
    const productId = this.pendingBulkProduct.id;
    const multiples = [1, 2, 5, 10, 20].map(x => Math.round(x * price));
    const history = this.sessionAmountsMap.get(productId) ?? [];
    const combined = [...new Set([...history, ...multiples])].sort((a, b) => a - b);
    this.bulkQuickAmounts = combined.slice(0, 8);
  }
}
