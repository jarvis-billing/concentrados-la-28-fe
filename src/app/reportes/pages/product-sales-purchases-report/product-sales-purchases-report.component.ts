import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { FacturaService } from '../../../factura/factura.service';
import { PurchasesService } from '../../../compras/services/purchases.service';
import { ProductoService } from '../../../producto/producto.service';
import { Billing, BillingReportFilter } from '../../../factura/billing';
import { PurchaseInvoice } from '../../../compras/models/purchase-invoice';
import { Product } from '../../../producto/producto';
import { toast } from 'ngx-sonner';
import { formatInTimeZone } from 'date-fns-tz';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

interface PresentationSummary {
  barcode: string;
  label: string;
  unitMeasure: string;
  qtySold: number;
  qtyPurchased: number;
  saleValue: number;
  costValue: number;
}

interface ProductSummaryRow {
  productId: string;
  description: string;
  brand: string;
  category: string;
  presentations: PresentationSummary[];
  totalSold: number;
  totalPurchased: number;
  totalSaleValue: number;
  totalCostValue: number;
  profit: number;
  profitPct: number;
  expanded: boolean;
}

interface ReportSummary {
  totalProducts: number;
  totalSold: number;
  totalPurchased: number;
  totalSaleValue: number;
  totalCostValue: number;
  totalProfit: number;
}

@Component({
  selector: 'app-product-sales-purchases-report',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './product-sales-purchases-report.component.html',
  styleUrls: ['./product-sales-purchases-report.component.css']
})
export class ProductSalesPurchasesReportComponent implements OnInit {
  private facturaService = inject(FacturaService);
  private purchasesService = inject(PurchasesService);
  private productService = inject(ProductoService);

  // Filtros de fecha
  fromDate = '';
  toDate = '';

  // Filtros de tabla (client-side)
  brandFilter = '';
  categoryFilter = '';

  // Selector de producto con autocompletado
  productSearchText = '';
  selectedProduct: Product | null = null;
  productSuggestions: Product[] = [];
  showSuggestions = false;
  highlightedIndex = -1;

  // Datos crudos y procesados
  allRows: ProductSummaryRow[] = [];
  filteredRows: ProductSummaryRow[] = [];
  products: Product[] = [];
  brands: string[] = [];
  categories: string[] = [];

  // Estado de UI
  isLoading = false;
  hasLoaded = false;
  isExporting = false;

  // Resumen totales
  summary: ReportSummary = {
    totalProducts: 0, totalSold: 0, totalPurchased: 0,
    totalSaleValue: 0, totalCostValue: 0, totalProfit: 0
  };

  // Ordenamiento
  sortColumn = 'totalSaleValue';
  sortDirection: 'asc' | 'desc' = 'desc';

  ngOnInit(): void {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    this.fromDate = this.formatDate(firstDay);
    this.toDate = this.formatDate(today);

    this.productService.getAll().subscribe(products => {
      this.products = products;
      this.brands = [...new Set(products.map(p => p.brand).filter(Boolean))].sort();
      this.categories = [...new Set(products.map(p => p.category).filter(Boolean))].sort();
    });
  }

  loadReport(): void {
    if (!this.fromDate || !this.toDate) {
      toast.warning('Seleccione un rango de fechas');
      return;
    }

    this.isLoading = true;
    this.hasLoaded = true;

    // Si hay producto seleccionado, filtra en el servidor por su _id
    const salesFilter: BillingReportFilter = {
      fromDate: this.fromDate,
      toDate: this.toDate,
      billNumber: '', userSale: '', client: '',
      product: this.selectedProduct?.id ?? '',
      saleType: '', paymentMethod: ''
    };

    // Para compras, filtra por barcode si el producto tiene una sola presentación
    const firstBarcode = this.selectedProduct?.presentations?.[0]?.barcode ?? '';
    const purchaseFilter = {
      createdAtFrom: this.fromDate,
      createdAtTo: this.toDate,
      ...(this.selectedProduct && firstBarcode ? { productBarcode: firstBarcode } : {}),
      size: 2000
    };

    forkJoin({
      sales: this.facturaService.findAllBilling(salesFilter).pipe(
        catchError(() => of([] as Billing[]))
      ),
      purchases: this.purchasesService.listPaged(purchaseFilter).pipe(
        map(res => res.content),
        catchError(() => of([] as PurchaseInvoice[]))
      )
    }).subscribe({
      next: ({ sales, purchases }) => {
        this.buildReport(sales, purchases);
        this.isLoading = false;
      },
      error: () => {
        toast.error('Error al cargar los datos del reporte');
        this.isLoading = false;
      }
    });
  }

  private buildReport(billings: Billing[], purchases: any[]): void {
    // Map barcode -> PresentationSummary acumulada
    const presMap = new Map<string, PresentationSummary & { productIdHint: string }>();

    // ── Ventas ──────────────────────────────────────────────────────────
    billings.forEach(billing => {
      (billing.saleDetails || []).forEach((detail: any) => {
        const barcode = detail.product?.barcode || '';
        if (!barcode) return;

        const entry = presMap.get(barcode) ?? {
          barcode,
          label: detail.product?.selectedPresentationLabel || detail.product?.barcode || barcode,
          unitMeasure: detail.product?.selectedUnitMeasure || '',
          qtySold: 0, qtyPurchased: 0, saleValue: 0, costValue: 0,
          productIdHint: detail.id || ''
        };
        entry.qtySold += detail.amount || 0;
        entry.saleValue += detail.subTotal || ((detail.amount || 0) * (detail.unitPrice || 0));
        presMap.set(barcode, entry);
      });
    });

    // ── Compras ─────────────────────────────────────────────────────────
    purchases.forEach((purchase: any) => {
      (purchase.items || []).forEach((item: any) => {
        const barcode = item.presentationBarcode || item.barcode || '';
        if (!barcode) return;

        const entry = presMap.get(barcode) ?? {
          barcode,
          label: item.description || barcode,
          unitMeasure: '',
          qtySold: 0, qtyPurchased: 0, saleValue: 0, costValue: 0,
          productIdHint: item.productId || ''
        };
        entry.qtyPurchased += item.quantity || 0;
        entry.costValue += item.totalCost || ((item.quantity || 0) * (item.unitCost || 0));
        presMap.set(barcode, entry);
      });
    });

    // ── Agrupar por producto ────────────────────────────────────────────
    const productMap = new Map<string, ProductSummaryRow>();

    presMap.forEach((pres) => {
      // Buscar el producto en allProducts por barcode
      const product = this.products.find(p =>
        (p.presentations || []).some(pr => pr.barcode === pres.barcode)
      );

      const productId = product?.id || pres.productIdHint || pres.barcode;
      const description = product?.description || pres.label;

      // Enriquecer label con datos del producto
      if (product) {
        const matchedPres = product.presentations?.find(pr => pr.barcode === pres.barcode);
        if (matchedPres) {
          pres.label = matchedPres.label || matchedPres.unitMeasure || pres.barcode;
          pres.unitMeasure = matchedPres.unitMeasure || '';
        }
      }

      let row = productMap.get(productId);
      if (!row) {
        row = {
          productId,
          description,
          brand: product?.brand || '',
          category: product?.category || '',
          presentations: [],
          totalSold: 0, totalPurchased: 0,
          totalSaleValue: 0, totalCostValue: 0,
          profit: 0, profitPct: 0,
          expanded: false
        };
        productMap.set(productId, row);
      }

      row.presentations.push(pres);
      row.totalSold += pres.qtySold;
      row.totalPurchased += pres.qtyPurchased;
      row.totalSaleValue += pres.saleValue;
      row.totalCostValue += pres.costValue;
    });

    productMap.forEach(row => {
      row.profit = row.totalSaleValue - row.totalCostValue;
      row.profitPct = row.totalSaleValue > 0 ? row.profit / row.totalSaleValue : 0;
    });

    this.allRows = [...productMap.values()];
    this.applyFilters();
  }

  applyFilters(): void {
    let filtered = [...this.allRows];

    if (this.brandFilter) {
      filtered = filtered.filter(r => r.brand === this.brandFilter);
    }
    if (this.categoryFilter) {
      filtered = filtered.filter(r => r.category === this.categoryFilter);
    }
    if (this.selectedProduct) {
      filtered = filtered.filter(r => r.productId === this.selectedProduct!.id);
    } else if (this.productSearchText.trim()) {
      const q = this.productSearchText.toLowerCase();
      filtered = filtered.filter(r =>
        r.description.toLowerCase().includes(q) ||
        r.brand.toLowerCase().includes(q) ||
        r.presentations.some(p => p.label.toLowerCase().includes(q) || p.barcode.toLowerCase().includes(q))
      );
    }

    this.sortRows(filtered);
    this.filteredRows = filtered;
    this.calculateSummary();
  }

  private sortRows(rows: ProductSummaryRow[]): void {
    const dir = this.sortDirection === 'asc' ? 1 : -1;
    rows.sort((a: any, b: any) => {
      const va = a[this.sortColumn];
      const vb = b[this.sortColumn];
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va || '').localeCompare(String(vb || ''), 'es-CO') * dir;
    });
  }

  toggleSort(column: string): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'desc';
    }
    this.applyFilters();
  }

  sortIcon(column: string): string {
    if (this.sortColumn !== column) return 'bi-chevron-expand';
    return this.sortDirection === 'asc' ? 'bi-chevron-up' : 'bi-chevron-down';
  }

  private calculateSummary(): void {
    this.summary = {
      totalProducts: this.filteredRows.length,
      totalSold: this.filteredRows.reduce((s, r) => s + r.totalSold, 0),
      totalPurchased: this.filteredRows.reduce((s, r) => s + r.totalPurchased, 0),
      totalSaleValue: this.filteredRows.reduce((s, r) => s + r.totalSaleValue, 0),
      totalCostValue: this.filteredRows.reduce((s, r) => s + r.totalCostValue, 0),
      totalProfit: this.filteredRows.reduce((s, r) => s + r.profit, 0)
    };
  }

  // ── Autocompletado de producto ────────────────────────────────────────
  onProductInput(): void {
    const q = this.productSearchText.trim().toLowerCase();
    this.highlightedIndex = -1;
    if (!q) {
      this.productSuggestions = [];
      this.showSuggestions = false;
      if (this.selectedProduct) {
        this.selectedProduct = null;
        this.applyFilters();
      }
      return;
    }
    this.selectedProduct = null;
    this.productSuggestions = this.products
      .filter(p =>
        (p.description || '').toLowerCase().includes(q) ||
        (p.brand || '').toLowerCase().includes(q) ||
        (p.presentations || []).some(pr => (pr.barcode || '').toLowerCase().includes(q))
      )
      .slice(0, 10);
    this.showSuggestions = this.productSuggestions.length > 0;
    this.applyFilters();
  }

  onKeyDown(event: KeyboardEvent): void {
    if (!this.showSuggestions || this.productSuggestions.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.highlightedIndex = Math.min(this.highlightedIndex + 1, this.productSuggestions.length - 1);
      this.scrollActiveIntoView();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.highlightedIndex = Math.max(this.highlightedIndex - 1, -1);
      this.scrollActiveIntoView();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (this.highlightedIndex >= 0) {
        this.selectProduct(this.productSuggestions[this.highlightedIndex]);
      }
    } else if (event.key === 'Escape') {
      this.showSuggestions = false;
      this.highlightedIndex = -1;
    }
  }

  private scrollActiveIntoView(): void {
    // Espera un tick para que Angular actualice el DOM antes de scrollear
    setTimeout(() => {
      const el = document.querySelector('.spr-suggestion-active') as HTMLElement | null;
      el?.scrollIntoView({ block: 'nearest' });
    }, 0);
  }

  selectProduct(product: Product): void {
    this.selectedProduct = product;
    this.productSearchText = product.description || '';
    this.showSuggestions = false;
    this.productSuggestions = [];
    this.highlightedIndex = -1;
    this.applyFilters();
  }

  clearProductSearch(): void {
    this.productSearchText = '';
    this.selectedProduct = null;
    this.productSuggestions = [];
    this.showSuggestions = false;
    this.highlightedIndex = -1;
    this.applyFilters();
  }

  hideSuggestions(): void {
    // Pequeño delay para que el click en la sugerencia se procese primero
    setTimeout(() => { this.showSuggestions = false; this.highlightedIndex = -1; }, 150);
  }

  clearFilters(): void {
    this.brandFilter = '';
    this.categoryFilter = '';
    this.clearProductSearch();
    this.applyFilters();
  }

  toggleExpand(row: ProductSummaryRow): void {
    row.expanded = !row.expanded;
  }

  exportExcel(): void {
    if (this.filteredRows.length === 0) {
      toast.warning('No hay datos para exportar');
      return;
    }

    this.isExporting = true;

    try {
      const bom = '﻿'; // UTF-8 BOM para que Excel reconozca acentos
      const headers = [
        'Producto', 'Marca', 'Categoría', 'Presentación', 'Código de Barras',
        'Cant. Vendida', 'Cant. Comprada', '$ Ventas (COP)', '$ Compras (COP)',
        'Utilidad (COP)', 'Margen %'
      ];

      const rows: (string | number)[][] = [];

      for (const prod of this.filteredRows) {
        // Fila resumen del producto
        rows.push([
          prod.description,
          prod.brand,
          prod.category,
          'TOTAL',
          '',
          prod.totalSold,
          prod.totalPurchased,
          prod.totalSaleValue,
          prod.totalCostValue,
          prod.profit,
          prod.totalSaleValue > 0 ? +((prod.profit / prod.totalSaleValue) * 100).toFixed(2) : 0
        ]);

        // Fila por presentación
        for (const pres of prod.presentations) {
          const presProfit = pres.saleValue - pres.costValue;
          rows.push([
            '',
            '',
            '',
            pres.label,
            pres.barcode,
            pres.qtySold,
            pres.qtyPurchased,
            pres.saleValue,
            pres.costValue,
            presProfit,
            pres.saleValue > 0 ? +((presProfit / pres.saleValue) * 100).toFixed(2) : 0
          ]);
        }
      }

      // Fila de totales
      rows.push([
        'TOTALES', '', '', '', '',
        this.summary.totalSold,
        this.summary.totalPurchased,
        this.summary.totalSaleValue,
        this.summary.totalCostValue,
        this.summary.totalProfit,
        this.summary.totalSaleValue > 0
          ? +((this.summary.totalProfit / this.summary.totalSaleValue) * 100).toFixed(2)
          : 0
      ]);

      const escape = (v: string | number): string => `"${String(v).replace(/"/g, '""')}"`;
      const csvContent = bom + [headers, ...rows]
        .map(r => r.map(escape).join(','))
        .join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ventas_compras_${this.fromDate}_${this.toDate}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Archivo exportado correctamente');
    } catch {
      toast.error('Error al exportar el archivo');
    } finally {
      this.isExporting = false;
    }
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency', currency: 'COP',
      minimumFractionDigits: 0, maximumFractionDigits: 0
    }).format(value);
  }

  formatNumber(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      minimumFractionDigits: 0, maximumFractionDigits: 0
    }).format(value);
  }

  formatPct(value: number): string {
    return (value * 100).toFixed(1) + '%';
  }

  profitClass(value: number): string {
    return value >= 0 ? 'text-success' : 'text-danger';
  }

  private formatDate(date: Date): string {
    return formatInTimeZone(date, 'America/Bogota', 'yyyy-MM-dd');
  }
}
