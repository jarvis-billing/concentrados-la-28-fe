import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProductoService } from '../../producto/producto.service';
import { PurchasesService } from '../services/purchases.service';
import { Product, Presentation } from '../../producto/producto';
import { PurchaseLastCostInfo } from '../models/purchase-cost-history';
import { BulkPresentationPriceUpdateRequest, PresentationPriceUpdate } from '../../producto/models/bulk-price-update.model';
import { toast } from 'ngx-sonner';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ReportRow {
  productId: string;
  productDescription: string;
  category: string;
  brand: string;
  barcode: string;
  presentationLabel: string;
  salePrice: number;
  presentationCostPrice: number;  // costo registrado en la entidad producto (fallback)
  isFixedAmount: boolean;
  fixedAmount: number | null;
  lastUnitTotalCost: number | null;
  lastInvoiceDate: string | null;
  newSalePrice: number | null;
}

type ColumnKey = 'category' | 'brand' | 'product' | 'presentation' | 'salePrice' | 'cost' | 'entityCost' | 'newSalePrice';

interface ColumnConfig {
  key: ColumnKey;
  label: string;
  defaultVisible: boolean;
}

@Component({
  selector: 'app-purchase-cost-report-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './purchase-cost-report-page.component.html',
  styleUrls: ['./purchase-cost-report-page.component.css']
})
export class PurchaseCostReportPageComponent implements OnInit {
  private productService = inject(ProductoService);
  private purchasesService = inject(PurchasesService);

  products: Product[] = [];
  rows: ReportRow[] = [];
  filteredRows: ReportRow[] = [];
  isLoading = false;
  isGeneratingPdf = false;

  get today(): Date {
    return new Date();
  }

  // Filtros
  searchText = '';
  selectedCategory = '';
  selectedBrand = '';

  categories: string[] = [];
  brands: string[] = [];

  // Paginación
  pageSize = 50;
  currentPage = 1;

  // Filtro bultos completos
  showOnlyFullPacks = false;
  addBlankPdfColumn = true;

  // Ajuste de costo global (flete/u + IVA %)
  reportFreightPerUnit = 0;
  reportVatPercent = 0;

  // Ordenamiento
  sortColumn: ColumnKey | null = null;
  sortDirection: 'asc' | 'desc' = 'asc';

  // Columnas configurables
  private readonly STORAGE_KEY = 'costReportColumns';

  private readonly allColumns: ColumnConfig[] = [
    { key: 'category', label: 'Categoría', defaultVisible: true },
    { key: 'brand', label: 'Marca', defaultVisible: true },
    { key: 'product', label: 'Producto', defaultVisible: true },
    { key: 'presentation', label: 'Presentación', defaultVisible: true },
    { key: 'salePrice', label: 'Precio venta', defaultVisible: true },
    { key: 'cost', label: 'Costo/u', defaultVisible: true },
    { key: 'entityCost', label: 'Costo entidad', defaultVisible: true },
    { key: 'newSalePrice', label: 'Nuevo precio venta', defaultVisible: true },
  ];

  columnVisibility: Record<ColumnKey, boolean> = this.loadColumnVisibility();

  get visibleColumns(): ColumnConfig[] {
    return this.allColumns.filter(c => this.columnVisibility[c.key]);
  }

  get visibleColumnKeys(): ColumnKey[] {
    return this.allColumns.filter(c => this.columnVisibility[c.key]).map(c => c.key);
  }

  getColumnLabel(key: ColumnKey): string {
    return this.allColumns.find(c => c.key === key)?.label ?? key;
  }

  private loadColumnVisibility(): Record<ColumnKey, boolean> {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        const result: Record<string, boolean> = {};
        this.allColumns.forEach(c => {
          result[c.key] = parsed[c.key] !== undefined ? !!parsed[c.key] : c.defaultVisible;
        });
        return result as Record<ColumnKey, boolean>;
      }
    } catch { /* ignore */ }
    const defaults: Record<string, boolean> = {};
    this.allColumns.forEach(c => defaults[c.key] = c.defaultVisible);
    return defaults as Record<ColumnKey, boolean>;
  }

  private saveColumnVisibility(): void {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.columnVisibility));
  }

  toggleColumn(key: ColumnKey, visible: boolean): void {
    this.columnVisibility[key] = visible;
    this.saveColumnVisibility();
  }

  applyPreset(preset: 'full' | 'costAndNewPrice' | 'minimal'): void {
    if (preset === 'full') {
      this.allColumns.forEach(c => this.columnVisibility[c.key] = true);
    } else if (preset === 'costAndNewPrice') {
      this.allColumns.forEach(c => this.columnVisibility[c.key] = false);
      this.columnVisibility['product'] = true;
      this.columnVisibility['presentation'] = true;
      this.columnVisibility['cost'] = true;
      this.columnVisibility['newSalePrice'] = true;
    } else if (preset === 'minimal') {
      this.allColumns.forEach(c => this.columnVisibility[c.key] = false);
      this.columnVisibility['product'] = true;
      this.columnVisibility['cost'] = true;
      this.columnVisibility['newSalePrice'] = true;
    }
    this.saveColumnVisibility();
  }

  isColumnVisible(key: ColumnKey): boolean {
    return this.columnVisibility[key] ?? false;
  }

  get visibleColumnsCount(): number {
    return this.visibleColumnKeys.length;
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredRows.length / this.pageSize));
  }

  get startIndex(): number {
    return (this.currentPage - 1) * this.pageSize;
  }

  get endIndex(): number {
    return Math.min(this.startIndex + this.pageSize, this.filteredRows.length);
  }

  get sortedRows(): ReportRow[] {
    if (!this.sortColumn) return this.filteredRows;
    const dir = this.sortDirection === 'asc' ? 1 : -1;
    return [...this.filteredRows].sort((a, b) => {
      const va = this.getSortValue(a);
      const vb = this.getSortValue(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1 * dir;
      if (vb == null) return -1 * dir;
      if (typeof va === 'number' && typeof vb === 'number') {
        return (va - vb) * dir;
      }
      return String(va).localeCompare(String(vb), 'es-CO') * dir;
    });
  }

  private getSortValue(row: ReportRow): string | number | null {
    switch (this.sortColumn) {
      case 'category': return row.category;
      case 'brand': return row.brand;
      case 'product': return row.productDescription;
      case 'presentation': return row.presentationLabel;
      case 'salePrice': return row.salePrice;
      case 'cost': return this.getReportCost(row);
      case 'entityCost': return row.presentationCostPrice;
      case 'newSalePrice': return row.newSalePrice ?? row.salePrice;
      default: return null;
    }
  }

  toggleSort(column: ColumnKey): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }
  }

  sortIcon(column: ColumnKey): string {
    if (this.sortColumn !== column) return 'bi-chevron-expand';
    return this.sortDirection === 'asc' ? 'bi-chevron-up' : 'bi-chevron-down';
  }

  get pagedRows(): ReportRow[] {
    return this.sortedRows.slice(this.startIndex, this.endIndex);
  }

  ngOnInit(): void {
    this.loadProducts();
  }

  private loadProducts(): void {
    this.isLoading = true;
    this.productService.getAll().subscribe({
      next: (products) => {
        this.products = products;
        this.buildRowsAndFetchCosts(products);
      },
      error: () => {
        toast.error('Error al cargar productos');
        this.isLoading = false;
      }
    });
  }

  private buildRowsAndFetchCosts(products: Product[]): void {
    const rows: ReportRow[] = [];
    products.forEach(p => {
      (p.presentations || []).forEach(pres => {
        rows.push({
          productId: p.id,
          productDescription: p.description || '',
          category: p.category || 'Sin categoría',
          brand: p.brand || 'Sin marca',
          barcode: pres.barcode,
          presentationLabel: pres.label || pres.barcode,
          salePrice: pres.salePrice || 0,
          presentationCostPrice: pres.costPrice || 0,
          isFixedAmount: pres.isFixedAmount ?? false,
          fixedAmount: pres.fixedAmount ?? null,
          lastUnitTotalCost: null,
          lastInvoiceDate: null,
          newSalePrice: null
        });
      });
    });
    this.rows = rows;

    // Extraer filtros únicos
    this.categories = [...new Set(rows.map(r => r.category).filter(Boolean))].sort();
    this.brands = [...new Set(rows.map(r => r.brand).filter(Boolean))].sort();

    // Consultar costos en paralelo (batch de 20 para no saturar)
    this.fetchCostsInBatches(rows, 20);
  }

  private fetchCostsInBatches(rows: ReportRow[], batchSize: number): void {
    const pending = [...rows];
    const processBatch = () => {
      if (pending.length === 0) {
        this.isLoading = false;
        this.applyFilters();
        return;
      }
      const batch = pending.splice(0, batchSize);
      const requests = batch.map(r =>
        this.purchasesService.getLastCost(r.barcode).pipe(
          catchError(() => of(null))
        )
      );
      forkJoin(requests).subscribe({
        next: (results) => {
          results.forEach((info, idx) => {
            const row = batch[idx];
            if (info) {
              // Costo total por unidad = costo base + IVA/u + flete/u
              const baseUnitCost = info.lastUnitCost || 0;
              const vatPerUnit = info.lastVatPerUnit || 0;
              const freightPerUnit = info.lastFreightPerUnit || 0;
              const computedTotal = baseUnitCost + vatPerUnit + freightPerUnit;
              row.lastUnitTotalCost = info.lastUnitTotalCost || computedTotal;
              row.lastInvoiceDate = info.lastInvoiceDate ? info.lastInvoiceDate.split('T')[0] : null;
            }
          });
          processBatch();
        },
        error: () => processBatch()
      });
    };
    processBatch();
  }

  applyFilters(): void {
    let filtered = this.rows;
    if (this.selectedCategory) {
      filtered = filtered.filter(r => r.category === this.selectedCategory);
    }
    if (this.selectedBrand) {
      filtered = filtered.filter(r => r.brand === this.selectedBrand);
    }
    if (this.searchText.trim()) {
      const q = this.searchText.toLowerCase();
      filtered = filtered.filter(r =>
        r.productDescription.toLowerCase().includes(q) ||
        r.presentationLabel.toLowerCase().includes(q) ||
        r.barcode.includes(q)
      );
    }
    if (this.showOnlyFullPacks) {
      // Para cada producto, conservar solo la presentación con mayor fixedAmount (bulto completo)
      const productMaxFixed: Record<string, number> = {};
      filtered.forEach(r => {
        if (r.isFixedAmount && r.fixedAmount != null) {
          productMaxFixed[r.productId] = Math.max(productMaxFixed[r.productId] ?? 0, r.fixedAmount);
        }
      });
      filtered = filtered.filter(r => {
        if (!r.isFixedAmount || r.fixedAmount == null) return false;
        return r.fixedAmount === productMaxFixed[r.productId];
      });
    }
    this.filteredRows = filtered;
    this.currentPage = 1;
  }

  clearFilters(): void {
    this.searchText = '';
    this.selectedCategory = '';
    this.selectedBrand = '';
    this.showOnlyFullPacks = false;
    this.sortColumn = null;
    this.sortDirection = 'asc';
    this.reportFreightPerUnit = 0;
    this.reportVatPercent = 0;
    this.applyFilters();
  }

  // Paginación helpers
  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
  }

  goToFirst(): void { this.currentPage = 1; }
  goToLast(): void { this.currentPage = this.totalPages; }
  goToPrev(): void { if (this.currentPage > 1) this.currentPage--; }
  goToNext(): void { if (this.currentPage < this.totalPages) this.currentPage++; }

  getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, this.currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(this.totalPages, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  get hasPendingChanges(): boolean {
    return this.rows.some(r => r.newSalePrice != null && r.newSalePrice !== r.salePrice);
  }

  get pendingChangeCount(): number {
    return this.rows.filter(r => r.newSalePrice != null && r.newSalePrice !== r.salePrice).length;
  }

  onNewPriceChange(row: ReportRow, value: number): void {
    if (value > 0 && Math.abs(value - row.salePrice) > 0.01) {
      row.newSalePrice = value;
    } else {
      row.newSalePrice = null;
    }
  }

  savePrices(): void {
    const updates: PresentationPriceUpdate[] = this.rows
      .filter(r => r.newSalePrice != null && r.newSalePrice !== r.salePrice)
      .map(r => ({
        productId: r.productId,
        barcode: r.barcode,
        salePrice: r.newSalePrice!
      }));

    if (updates.length === 0) {
      toast.warning('No hay precios modificados');
      return;
    }

    const payload: BulkPresentationPriceUpdateRequest = { updates };
    this.productService.bulkUpdatePresentationPrices(payload).subscribe({
      next: (res) => {
        if (res.failed > 0) {
          toast.warning(`${res.updated} actualizados, ${res.failed} fallidos`);
          console.warn('Errores:', res.errors);
        } else {
          toast.success(`${res.updated} precio(s) de venta actualizado(s)`);
        }
        // Refrescar datos
        this.loadProducts();
      },
      error: () => toast.error('Error al actualizar precios')
    });
  }

  /**
   * Costo mostrado = última compra (unitTotalCost) o fallback al costPrice de la presentación
   */
  getDisplayCost(row: ReportRow): number | null {
    if (row.lastUnitTotalCost != null) return row.lastUnitTotalCost;
    if (row.presentationCostPrice > 0) return row.presentationCostPrice;
    return null;
  }

  /**
   * Costo mostrado en el reporte: base + flete/u + IVA%
   */
  getReportCost(row: ReportRow): number | null {
    const base = this.getDisplayCost(row);
    if (base == null) return null;
    const freight = this.reportFreightPerUnit || 0;
    const vat = (base + freight) * (this.reportVatPercent || 0) / 100;
    return base + freight + vat;
  }

  isLastCost(row: ReportRow): boolean {
    return row.lastUnitTotalCost != null;
  }

  // PDF generation
  generatePdf(): void {
    if (this.filteredRows.length === 0) {
      toast.warning('No hay productos para generar el reporte');
      return;
    }
    this.isGeneratingPdf = true;
    try {
      const doc = new jsPDF('landscape', 'mm', 'letter');
      const pageW = doc.internal.pageSize.getWidth();
      const marginL = 10;
      const marginR = 10;
      const primaryColor: [number, number, number] = [33, 37, 41];

      // Header
      doc.setFontSize(16);
      doc.setTextColor(...primaryColor);
      doc.text('Reporte de Costos y Precios de Venta', marginL, 15);

      doc.setFontSize(10);
      doc.setTextColor(100);
      const filters: string[] = [];
      if (this.selectedCategory) filters.push(`Categoría: ${this.selectedCategory}`);
      if (this.selectedBrand) filters.push(`Marca: ${this.selectedBrand}`);
      if (this.searchText.trim()) filters.push(`Búsqueda: ${this.searchText}`);
      if (this.reportFreightPerUnit > 0) filters.push(`Flete/u: ${this.formatNumber(this.reportFreightPerUnit)}`);
      if (this.reportVatPercent > 0) filters.push(`IVA: ${this.reportVatPercent}%`);
      const filterText = filters.length > 0 ? filters.join('  |  ') : 'Todos los productos';
      doc.text(filterText, marginL, 22);
      doc.text(`Generado: ${new Date().toLocaleString('es-CO')}`, pageW - marginR, 22, { align: 'right' });

      const pdfCols = this.visibleColumnKeys;
      const headRow = ['#', ...pdfCols.map(k => this.getColumnLabel(k)), ...(this.addBlankPdfColumn ? ['Obs.'] : [])];
      const tableData = this.filteredRows.map((r, idx) => {
        const rowCells: (string | number)[] = [idx + 1];
        pdfCols.forEach(k => {
          switch (k) {
            case 'category': rowCells.push(r.category); break;
            case 'brand': rowCells.push(r.brand); break;
            case 'product': rowCells.push(r.productDescription); break;
            case 'presentation': rowCells.push(r.presentationLabel); break;
            case 'salePrice': rowCells.push(this.formatNumber(r.salePrice)); break;
            case 'cost': rowCells.push(this.formatNumber(this.getReportCost(r)) + (this.isLastCost(r) ? '' : '*')); break;
            case 'entityCost': rowCells.push(this.formatNumber(r.presentationCostPrice)); break;
            case 'newSalePrice': rowCells.push(r.newSalePrice != null && r.newSalePrice !== r.salePrice ? this.formatNumber(r.newSalePrice) : ''); break;
          }
        });
        if (this.addBlankPdfColumn) rowCells.push('');
        return rowCells;
      });

      // Column widths map (in mm, approximate)
      const colWidthMap: Record<ColumnKey, number | 'auto'> = {
        category: 30,
        brand: 25,
        product: 'auto',
        presentation: 35,
        salePrice: 28,
        cost: 28,
        entityCost: 28,
        newSalePrice: 28,
      };
      const columnStyles: Record<number, any> = { 0: { halign: 'center', cellWidth: 10 } };
      pdfCols.forEach((k, i) => {
        const w = colWidthMap[k];
        columnStyles[i + 1] = w === 'auto' ? { cellWidth: 'auto' } : { cellWidth: w, halign: ['salePrice', 'cost', 'entityCost', 'newSalePrice'].includes(k) ? 'right' : 'left' };
      });
      if (this.addBlankPdfColumn) {
        columnStyles[pdfCols.length + 1] = { cellWidth: 35 };
      }

      autoTable(doc, {
        startY: 28,
        head: [headRow],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: primaryColor, textColor: 255, fontSize: 9, halign: 'center' },
        styles: { fontSize: 8, cellPadding: 1.5 },
        columnStyles,
        margin: { left: marginL, right: marginR },
        didDrawPage: (data) => {
          const pageCount = doc.getNumberOfPages();
          doc.setFontSize(8);
          doc.setTextColor(120);
          doc.text(`Página ${data.pageNumber} de ${pageCount}`, pageW - marginR, doc.internal.pageSize.getHeight() - 8, { align: 'right' });
        }
      });

      // Footnote
      const finalY = (doc as any).lastAutoTable?.finalY || 180;
      if (finalY < doc.internal.pageSize.getHeight() - 20) {
        doc.setFontSize(8);
        doc.setTextColor(120);
        let footnote = '* Costo/u: valor de última compra. Sin *: costo registrado en la entidad producto.';
        if (this.reportFreightPerUnit > 0 || this.reportVatPercent > 0) {
          const adjParts: string[] = [];
          if (this.reportFreightPerUnit > 0) adjParts.push(`flete/u $${this.formatNumber(this.reportFreightPerUnit)}`);
          if (this.reportVatPercent > 0) adjParts.push(`IVA ${this.reportVatPercent}%`);
          footnote += `  |  Costo ajustado incluye ${adjParts.join(' + ')}.`;
        }
        doc.text(footnote, marginL, finalY + 6);
      }

      const fileName = `reporte_costos_venta_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
      toast.success(`PDF generado (${this.filteredRows.length} productos)`);
    } catch (err) {
      console.error('Error generando PDF:', err);
      toast.error('Error al generar PDF');
    } finally {
      this.isGeneratingPdf = false;
    }
  }

  formatCurrency(value: number | null): string {
    if (value == null) return '-';
    return new Intl.NumberFormat('es-CO', {
      style: 'currency', currency: 'COP',
      minimumFractionDigits: 0, maximumFractionDigits: 0
    }).format(value);
  }

  formatNumber(value: number | null): string {
    if (value == null) return '-';
    return new Intl.NumberFormat('es-CO', {
      minimumFractionDigits: 0, maximumFractionDigits: 0
    }).format(value);
  }
}
