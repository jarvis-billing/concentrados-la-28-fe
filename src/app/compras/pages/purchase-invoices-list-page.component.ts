import { Component, ElementRef, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { PurchaseInvoice } from '../models/purchase-invoice';
import { PurchaseItem } from '../models/purchase-item';
import { Supplier } from '../models/supplier';
import { BulkLastCostItem } from '../models/purchase-cost-history';
import { PurchasesService, PurchaseListFilter } from '../services/purchases.service';
import { SupplierService } from '../services/supplier.service';
import { toast } from 'ngx-sonner';
import { Router } from '@angular/router';
import { ProductsSearchModalComponent } from '../../producto/components/products-search-modal/products-search-modal.component';
import { Product } from '../../producto/producto';
import { LinkPaymentsModalComponent } from '../components/link-payments-modal/link-payments-modal.component';

@Component({
  selector: 'app-purchase-invoices-list-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, ProductsSearchModalComponent, LinkPaymentsModalComponent],
  templateUrl: './purchase-invoices-list-page.component.html',
  styles: [`
    .trend-tip { position: relative; display: inline-flex; align-items: center; cursor: default; }
    .trend-tip-box {
      display: none;
      position: absolute;
      bottom: calc(100% + 8px);
      left: 50%;
      transform: translateX(-50%);
      background: #212529;
      color: #fff;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 12px;
      white-space: nowrap;
      z-index: 9999;
      min-width: 230px;
      text-align: left;
      box-shadow: 0 4px 14px rgba(0,0,0,.35);
      line-height: 1.7;
      pointer-events: none;
    }
    .trend-tip-box::after {
      content: '';
      position: absolute;
      top: 100%;
      left: 50%;
      transform: translateX(-50%);
      border: 6px solid transparent;
      border-top-color: #212529;
    }
    .trend-tip:hover .trend-tip-box { display: block; }
    .tip-row { display: flex; justify-content: space-between; gap: 16px; }
    .tip-lbl { opacity: .7; }
  `]
})
export class PurchaseInvoicesListPageComponent implements OnInit {
  private fb               = inject(FormBuilder);
  private purchasesService = inject(PurchasesService);
  private supplierService  = inject(SupplierService);
  private router           = inject(Router);

  // ── Datos ─────────────────────────────────────────────────────────────────
  invoices: PurchaseInvoice[] = [];
  suppliers: Supplier[] = [];
  isLoading = false;

  // ── Paginación ────────────────────────────────────────────────────────────
  currentPage   = 0;
  pageSize      = 20;
  totalElements = 0;
  totalPages    = 0;

  // ── Filtro de proveedor ───────────────────────────────────────────────────
  filteredSuppliersForFilter: Supplier[] = [];
  supplierFilterSearchText  = '';
  showSupplierFilterDropdown = false;
  selectedSupplierForFilter: Supplier | null = null;
  supplierActiveIndex = -1;
  @ViewChild('supplierDropdownEl') supplierDropdownEl?: ElementRef;

  // ── Producto seleccionado ─────────────────────────────────────────────────
  selectedProduct: Product | null = null;

  // ── Detalle expandido ─────────────────────────────────────────────────────
  expandedInvoiceId: string | null = null;

  // ── Tendencias de costo por presentación (para fila expandida) ────────────
  lastCostForExpanded: Map<string, BulkLastCostItem> = new Map();
  expandedTrendSummary: { up: number; down: number; same: number; first: number } = { up: 0, down: 0, same: 0, first: 0 };
  loadingCostsForInvoiceId: string | null = null;

  @ViewChild(ProductsSearchModalComponent, { static: false }) productsSearchModalComp!: ProductsSearchModalComponent;
  @ViewChild(LinkPaymentsModalComponent,   { static: false }) linkPaymentsModal!: LinkPaymentsModalComponent;

  filterForm: FormGroup = this.fb.group({
    startDate:     [''],
    endDate:       [''],
    supplierId:    [''],
    productSearch: [''],
    invoiceNumber: [''],
  });

  ngOnInit() {
    this.loadSuppliers();
    this.loadPage();
  }

  /** Buscar con los filtros actuales (botón Buscar / Enter en campos de texto) */
  search(): void {
    this.currentPage = 0;
    this.loadPage();
  }

  // ── Carga ─────────────────────────────────────────────────────────────────

  loadPage(): void {
    this.isLoading = true;
    const v = this.filterForm.value;

    const filter: PurchaseListFilter = {
      page: this.currentPage,
      size: this.pageSize,
    };

    if (v.startDate)     filter.createdAtFrom  = v.startDate;
    if (v.endDate)       filter.createdAtTo    = v.endDate;
    if (v.supplierId)    filter.supplierId     = v.supplierId;
    if (v.invoiceNumber) filter.invoiceNumber  = v.invoiceNumber;
    if (this.selectedProduct?.barcode) filter.productBarcode = this.selectedProduct.barcode;

    this.purchasesService.listPaged(filter).subscribe({
      next: (res) => {
        this.invoices = res.content.map((inv: any) => {
          // Backend: invoiceDate (LocalDate) → FE model: emissionDate
          if (inv.invoiceDate && !inv.emissionDate) {
            inv.emissionDate = inv.invoiceDate;
          }
          // Backend: totalAmount (BigDecimal) → FE model: total
          if (!inv.total || inv.total === 0) {
            inv.total = inv.totalAmount
              ?? (inv.items || []).reduce((sum: number, item: any) =>
                  sum + ((item.totalCost || 0) + (item.vatAmount || 0) + (item.freightAmount || 0)), 0);
          }
          return inv;
        });
        this.totalElements = res.totalElements;
        this.totalPages    = res.totalPages;
        this.isLoading     = false;
        this.expandedInvoiceId = null;
      },
      error: () => {
        this.isLoading = false;
        toast.error('Error al cargar las facturas');
      }
    });
  }

  loadSuppliers(): void {
    this.supplierService.list().subscribe(res => {
      this.suppliers = res;
      this.filteredSuppliersForFilter = res;
    });
  }

  // ── Paginación ────────────────────────────────────────────────────────────

  goToPage(page: number): void {
    if (page < 0 || page >= this.totalPages) return;
    this.currentPage = page;
    this.loadPage();
  }

  get pages(): number[] {
    const total = this.totalPages;
    const cur   = this.currentPage;
    const delta = 2;
    const range: number[] = [];
    for (let i = Math.max(0, cur - delta); i <= Math.min(total - 1, cur + delta); i++) {
      range.push(i);
    }
    return range;
  }

  get startRecord(): number { return this.totalElements === 0 ? 0 : this.currentPage * this.pageSize + 1; }
  get endRecord():   number { return Math.min((this.currentPage + 1) * this.pageSize, this.totalElements); }

  // ── Filtros ───────────────────────────────────────────────────────────────

  filterSuppliersForFilter(searchText: string): void {
    this.supplierFilterSearchText = searchText;
    this.supplierActiveIndex = -1;
    if (!searchText.trim()) {
      this.filteredSuppliersForFilter = this.suppliers;
      this.showSupplierFilterDropdown = false;
      return;
    }
    const q = searchText.toLowerCase();
    this.filteredSuppliersForFilter = this.suppliers.filter(s =>
      (s.name || '').toLowerCase().includes(q) ||
      (s.idNumber || '').toLowerCase().includes(q)
    );
    this.showSupplierFilterDropdown = this.filteredSuppliersForFilter.length > 0;
  }

  selectSupplierForFilter(supplier: Supplier): void {
    this.selectedSupplierForFilter = supplier;
    this.supplierFilterSearchText  = `${supplier.name} (${supplier.documentType} ${supplier.idNumber})`;
    this.filterForm.patchValue({ supplierId: supplier.id });
    this.showSupplierFilterDropdown = false;
  }

  clearSupplierFilterSelection(): void {
    this.selectedSupplierForFilter = null;
    this.supplierFilterSearchText  = '';
    this.filterForm.patchValue({ supplierId: '' });
    this.filteredSuppliersForFilter = this.suppliers;
  }

  onSupplierKeydown(event: KeyboardEvent): void {
    if (!this.showSupplierFilterDropdown) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.supplierActiveIndex = Math.min(this.supplierActiveIndex + 1, this.filteredSuppliersForFilter.length - 1);
      this.scrollDropdownItem(this.supplierDropdownEl, this.supplierActiveIndex);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.supplierActiveIndex = Math.max(this.supplierActiveIndex - 1, -1);
      this.scrollDropdownItem(this.supplierDropdownEl, this.supplierActiveIndex);
    } else if (event.key === 'Enter' && this.supplierActiveIndex >= 0) {
      event.preventDefault();
      this.selectSupplierForFilter(this.filteredSuppliersForFilter[this.supplierActiveIndex]);
    } else if (event.key === 'Escape') {
      this.showSupplierFilterDropdown = false;
      this.supplierActiveIndex = -1;
    }
  }

  private scrollDropdownItem(ref: ElementRef | undefined, index: number): void {
    if (!ref || index < 0) return;
    const item = ref.nativeElement.children[index] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }

  hideSupplierDropdownDelayed(): void {
    setTimeout(() => { this.showSupplierFilterDropdown = false; this.supplierActiveIndex = -1; }, 200);
  }

  openProductModal(): void { this.productsSearchModalComp?.openModal(); }

  onProductSelected(product: Product): void {
    this.selectedProduct = product;
    this.filterForm.patchValue({ productSearch: `${product.description || ''} - ${product.barcode || ''}` });
    // No dispara búsqueda automática — el usuario usa el botón Buscar
  }

  clearProductFilter(): void {
    this.selectedProduct = null;
    this.filterForm.patchValue({ productSearch: '' });
  }

  clearFilters(): void {
    this.selectedProduct            = null;
    this.selectedSupplierForFilter  = null;
    this.supplierFilterSearchText   = '';
    this.filteredSuppliersForFilter = this.suppliers;
    this.filterForm.reset({ startDate: '', endDate: '', supplierId: '', productSearch: '', invoiceNumber: '' });
    this.currentPage = 0;
    this.loadPage(); // Limpiar sí recarga inmediatamente
  }

  // ── Detalle ───────────────────────────────────────────────────────────────

  toggleInvoiceDetails(invoiceId: string | undefined): void {
    if (!invoiceId) return;
    const wasExpanded = this.expandedInvoiceId === invoiceId;
    this.expandedInvoiceId = wasExpanded ? null : invoiceId;
    if (!wasExpanded) {
      const invoice = this.invoices.find(i => i.id === invoiceId);
      if (invoice) this.loadCostsForInvoice(invoice);
    }
  }

  isExpanded(invoiceId: string | undefined): boolean { return invoiceId === this.expandedInvoiceId; }

  // ── Tendencias de costo ──────────────────────────────────────────────────

  loadCostsForInvoice(invoice: PurchaseInvoice): void {
    const barcodes = (invoice.items || [])
      .map(i => i.presentationBarcode)
      .filter((b): b is string => !!b);
    if (!barcodes.length) return;
    this.loadingCostsForInvoiceId = invoice.id ?? null;
    this.lastCostForExpanded.clear();
    this.purchasesService.bulkGetLastCost(barcodes).subscribe({
      next: (results) => {
        // Backend sets presentationId = barcode (not MongoDB ObjectId), so key by barcode
        results.forEach(r => this.lastCostForExpanded.set(r.barcode, r));
        this.loadingCostsForInvoiceId = null;
        this.computeTrendSummary(invoice);
      },
      error: () => { this.loadingCostsForInvoiceId = null; }
    });
  }

  computeTrendSummary(invoice: PurchaseInvoice): void {
    const s = { up: 0, down: 0, same: 0, first: 0 };
    (invoice.items || []).forEach(item => {
      const t = this.getItemTrend(item, invoice);
      if (t === 'up')    s.up++;
      else if (t === 'down')  s.down++;
      else if (t === 'same')  s.same++;
      else if (t === 'first') s.first++;
    });
    this.expandedTrendSummary = s;
  }

  /**
   * Compara el costo total de este ítem en ESTA factura vs el costo total MÁS RECIENTE
   * conocido para esa presentación.
   * - Si son iguales (lastInvoiceId === invoice.id): esta ES la compra más reciente → 'same'
   * - Si el costo de esta factura > costo actual: desde entonces bajó el precio → badge 'down'
   * - Si el costo de esta factura < costo actual: desde entonces subió el precio → badge 'up'
   */
  getItemTrend(item: PurchaseItem, invoice: PurchaseInvoice): 'up' | 'down' | 'same' | 'first' | 'none' {
    const lc = this.lastCostForExpanded.get(item.presentationBarcode);
    if (!lc) return 'none';
    if (lc.lastUnitTotalCost == null) return 'first';
    const itemTotal = this.resolveItemUnitTotal(item, invoice);
    if (itemTotal <= 0) return 'none';
    // Si esta factura es la más reciente, lc.lastUnitTotalCost === itemTotal → 'same'
    const diff = itemTotal - lc.lastUnitTotalCost;
    if (Math.abs(diff) < 0.5) return 'same';
    // itemTotal > lc → en esta factura pagamos más de lo que cuesta ahora → precio bajó desde entonces
    return diff > 0 ? 'down' : 'up';
  }

  getItemDeltaPercent(item: PurchaseItem, invoice: PurchaseInvoice): number | null {
    const lc = this.lastCostForExpanded.get(item.presentationBarcode);
    if (!lc || !lc.lastUnitTotalCost) return null;
    const itemTotal = this.resolveItemUnitTotal(item, invoice);
    if (itemTotal <= 0) return null;
    // Base = precio de ESTA factura (el punto de referencia)
    return Math.abs(((lc.lastUnitTotalCost - itemTotal) / itemTotal) * 100);
  }

  /** Diferencia absoluta en pesos (valor de esta factura − precio actual). */
  getItemDeltaAmount(item: PurchaseItem, invoice: PurchaseInvoice): number | null {
    const lc = this.lastCostForExpanded.get(item.presentationBarcode);
    if (!lc || !lc.lastUnitTotalCost) return null;
    const itemTotal = this.resolveItemUnitTotal(item, invoice);
    if (itemTotal <= 0) return null;
    return Math.abs(itemTotal - lc.lastUnitTotalCost);
  }

  /** Resuelve el costo total/u del ítem: usa el campo almacenado si existe, sino lo calcula. */
  resolveItemUnitTotal(item: PurchaseItem, invoice: PurchaseInvoice): number {
    if (item.unitTotalCost != null && item.unitTotalCost > 0) return item.unitTotalCost;
    const freightPerUnit = item.applyFreight && invoice.freightRate > 0 ? invoice.freightRate : 0;
    return item.unitCost + item.unitCost * (item.vatRate / 100) + freightPerUnit;
  }

  getLastCostInfoForItem(item: PurchaseItem): BulkLastCostItem | null {
    // Backend keys BulkLastCostItem by barcode, not by presentationId (ObjectId)
    return this.lastCostForExpanded.get(item.presentationBarcode) ?? null;
  }

  // ── Navegación ────────────────────────────────────────────────────────────

  goToCreateInvoice():  void { this.router.navigate(['/main/compras/facturas']); }
  goToCostHistory():    void { this.router.navigate(['/main/compras/facturas/historial-costos']); }
  editInvoice(id: string | undefined): void { if (id) this.router.navigate(['/main/compras/facturas/editar', id]); }

  openLinkPaymentsModal(invoice: PurchaseInvoice): void { this.linkPaymentsModal?.open(invoice); }
  onPaymentsLinked(): void { this.loadPage(); }

  // ── Helpers display ───────────────────────────────────────────────────────

  getSupplierName(invoice: PurchaseInvoice): string { return invoice?.supplier?.name || 'N/A'; }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const datePart = dateStr.split('T')[0];
    const [year, month, day] = datePart.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    return date.toLocaleDateString('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }

  formatCurrency(value: number | undefined | null): string {
    const n = Number(value) || 0;
    if (!isFinite(n)) return '$ 0';
    return '$ ' + new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
  }

  getPaymentStatusBadgeClass(status: string | undefined): string {
    switch (status) {
      case 'PAGADO':      return 'badge bg-success';
      case 'SOBREPAGADO': return 'badge bg-danger';
      case 'PARCIAL':     return 'badge bg-warning text-dark';
      default:            return 'badge bg-secondary';
    }
  }

  getPaymentStatusLabel(status: string | undefined): string {
    const labels: Record<string, string> = { PENDIENTE: 'Pendiente', PARCIAL: 'Parcial', PAGADO: 'Pagado', SOBREPAGADO: 'Sobrepagado' };
    return labels[status || ''] || 'Pendiente';
  }
}
