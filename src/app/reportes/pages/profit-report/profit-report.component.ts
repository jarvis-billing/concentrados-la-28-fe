import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ReportsService } from '../../services/reports.service';
import { FacturaService } from '../../../factura/factura.service';
import { ProductoService } from '../../../producto/producto.service';
import { ProfitReportFilter } from '../../models/report-filters';
import { ProfitReportRow, ProfitReportSummary } from '../../models/report-responses';
import { Billing, BillingReportFilter } from '../../../factura/billing';
import { Product } from '../../../producto/producto';
import { toast } from 'ngx-sonner';
import { formatInTimeZone } from 'date-fns-tz';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ReportChartModalComponent, ChartConfig } from '../../components/report-chart-modal/report-chart-modal.component';

@Component({
  selector: 'app-profit-report',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, ReportChartModalComponent],
  templateUrl: './profit-report.component.html',
  styleUrls: ['./profit-report.component.css']
})
export class ProfitReportComponent implements OnInit {
  private reportsService = inject(ReportsService);
  private facturaService = inject(FacturaService);
  private productService = inject(ProductoService);

  // Filtros
  fromDate: string = '';
  toDate: string = '';
  selectedCategory: string = '';
  selectedBrand: string = '';
  selectedClient: string = '';
  selectedProduct: string = '';
  selectedSaleType: string = '';
  searchText: string = '';

  // Datos
  rows: ProfitReportRow[] = [];
  filteredRows: ProfitReportRow[] = [];
  summary: ProfitReportSummary = { totalSales: 0, totalCost: 0, totalGrossProfit: 0, averageMargin: 0, invoiceCount: 0, itemCount: 0 };
  products: Product[] = [];
  categories: string[] = [];
  brands: string[] = [];
  isLoading = false;
  isGeneratingPdf = false;
  hasLoaded = false;

  // Gráficos
  showChart = false;
  chartConfigs: ChartConfig[] = [];

  // Paginación
  pageSize = 50;
  currentPage = 1;

  // Ordenamiento
  sortColumn: string = '';
  sortDirection: 'asc' | 'desc' = 'desc';

  ngOnInit(): void {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    this.fromDate = this.formatDate(firstDay);
    this.toDate = this.formatDate(today);

    this.productService.getAll().subscribe(products => {
      this.products = products;
      this.categories = [...new Set(products.map(p => p.category).filter(Boolean))].sort();
      this.brands = [...new Set(products.map(p => p.brand).filter(Boolean))].sort();
    });
  }

  loadReport(): void {
    if (!this.fromDate || !this.toDate) {
      toast.warning('Seleccione un rango de fechas');
      return;
    }

    this.isLoading = true;
    this.hasLoaded = true;

    const filter: BillingReportFilter = {
      fromDate: this.fromDate,
      toDate: this.toDate,
      billNumber: '',
      userSale: '',
      client: this.selectedClient,
      product: this.selectedProduct,
      saleType: this.selectedSaleType,
      paymentMethod: ''
    };

    this.facturaService.findAllBilling(filter).subscribe({
      next: (billings) => {
        this.buildProfitRows(billings);
        this.isLoading = false;
      },
      error: () => {
        toast.error('Error al cargar el reporte');
        this.isLoading = false;
      }
    });
  }

  private buildProfitRows(billings: Billing[]): void {
    const rows: ProfitReportRow[] = [];

    billings.forEach(billing => {
      (billing.saleDetails || []).forEach(detail => {
        const unitCost = detail.unitCost || this.getFallbackCost(detail.product?.barcode || detail.id) || 0;
        const subtotal = detail.subTotal || (detail.amount * detail.unitPrice);
        const totalCost = unitCost * detail.amount;
        const grossProfit = subtotal - totalCost;
        const profitMargin = subtotal > 0 ? (grossProfit / subtotal) * 100 : 0;

        const matchedProduct = this.products.find(p => p.id === detail.id);

        rows.push({
          billNumber: billing.billNumber,
          dateTimeRecord: billing.dateTimeRecord,
          clientName: billing.client?.fullName || billing.client?.name || 'Consumidor Final',
          productDescription: detail.product?.description || matchedProduct?.description || '',
          presentationLabel: detail.product?.selectedPresentationLabel || detail.product?.barcode || '',
          barcode: detail.product?.barcode || '',
          category: matchedProduct?.category || detail.product?.category || '',
          brand: matchedProduct?.brand || detail.product?.brand || '',
          amount: detail.amount,
          unitPrice: detail.unitPrice,
          unitCost: unitCost,
          subtotal: subtotal,
          totalCost: totalCost,
          grossProfit: grossProfit,
          profitMargin: profitMargin,
          saleType: billing.saleType || '',
          userId: billing.creationUser?.fullName || billing.creationUser?.name || ''
        });
      });
    });

    this.rows = rows;
    this.applyFilters();
    this.calculateSummary();
  }

  private getFallbackCost(barcode: string): number {
    for (const p of this.products) {
      const pres = (p.presentations || []).find(pr => pr.barcode === barcode);
      if (pres && pres.costPrice > 0) return pres.costPrice;
    }
    return 0;
  }

  applyFilters(): void {
    let filtered = [...this.rows];

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
        r.clientName.toLowerCase().includes(q) ||
        r.barcode.includes(q) ||
        r.billNumber.toLowerCase().includes(q)
      );
    }

    this.filteredRows = filtered;
    this.currentPage = 1;
    this.calculateSummary();
  }

  private calculateSummary(): void {
    const data = this.filteredRows;
    this.summary = {
      totalSales: data.reduce((sum, r) => sum + r.subtotal, 0),
      totalCost: data.reduce((sum, r) => sum + r.totalCost, 0),
      totalGrossProfit: data.reduce((sum, r) => sum + r.grossProfit, 0),
      averageMargin: 0,
      invoiceCount: new Set(data.map(r => r.billNumber)).size,
      itemCount: data.length
    };
    this.summary.averageMargin = this.summary.totalSales > 0
      ? (this.summary.totalGrossProfit / this.summary.totalSales) * 100
      : 0;
  }

  clearFilters(): void {
    this.selectedCategory = '';
    this.selectedBrand = '';
    this.selectedClient = '';
    this.selectedProduct = '';
    this.selectedSaleType = '';
    this.searchText = '';
    this.sortColumn = '';
    this.applyFilters();
  }

  // Ordenamiento
  toggleSort(column: string): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'desc';
    }
    this.sortRows();
  }

  private sortRows(): void {
    if (!this.sortColumn) return;
    const dir = this.sortDirection === 'asc' ? 1 : -1;
    this.filteredRows.sort((a: any, b: any) => {
      const va = a[this.sortColumn];
      const vb = b[this.sortColumn];
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va || '').localeCompare(String(vb || ''), 'es-CO') * dir;
    });
  }

  sortIcon(column: string): string {
    if (this.sortColumn !== column) return 'bi-chevron-expand';
    return this.sortDirection === 'asc' ? 'bi-chevron-up' : 'bi-chevron-down';
  }

  // Paginación
  get totalPages(): number { return Math.max(1, Math.ceil(this.filteredRows.length / this.pageSize)); }
  get startIndex(): number { return (this.currentPage - 1) * this.pageSize; }
  get endIndex(): number { return Math.min(this.startIndex + this.pageSize, this.filteredRows.length); }
  get pagedRows(): ProfitReportRow[] { return this.filteredRows.slice(this.startIndex, this.endIndex); }

  goToPage(page: number): void { if (page >= 1 && page <= this.totalPages) this.currentPage = page; }
  goToPrev(): void { if (this.currentPage > 1) this.currentPage--; }
  goToNext(): void { if (this.currentPage < this.totalPages) this.currentPage++; }

  getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, this.currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(this.totalPages, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) start = Math.max(1, end - maxVisible + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  // PDF
  generatePdf(): void {
    if (this.filteredRows.length === 0) {
      toast.warning('No hay datos para generar PDF');
      return;
    }
    this.isGeneratingPdf = true;
    try {
      const doc = new jsPDF('landscape', 'mm', 'letter');
      const pageW = doc.internal.pageSize.getWidth();

      doc.setFontSize(14);
      doc.text('Reporte de Utilidad por Ventas', 10, 15);
      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text(`Periodo: ${this.fromDate} a ${this.toDate}`, 10, 21);
      doc.text(`Generado: ${new Date().toLocaleString('es-CO')}`, pageW - 10, 21, { align: 'right' });

      // Summary
      doc.setFontSize(9);
      doc.text(`Total Ventas: ${this.formatCurrency(this.summary.totalSales)} | Total Costo: ${this.formatCurrency(this.summary.totalCost)} | Utilidad Bruta: ${this.formatCurrency(this.summary.totalGrossProfit)} | Margen: ${this.summary.averageMargin.toFixed(1)}%`, 10, 27);

      const head = [['#', 'Factura', 'Fecha', 'Cliente', 'Producto', 'Cant', 'P.Venta', 'Costo', 'Subtotal', 'Costo Total', 'Utilidad', 'Margen %']];
      const body = this.filteredRows.map((r, i) => [
        i + 1,
        r.billNumber,
        r.dateTimeRecord?.split('T')[0] || '',
        r.clientName?.substring(0, 20),
        r.productDescription?.substring(0, 25),
        r.amount,
        this.formatNumber(r.unitPrice),
        this.formatNumber(r.unitCost),
        this.formatNumber(r.subtotal),
        this.formatNumber(r.totalCost),
        this.formatNumber(r.grossProfit),
        r.profitMargin.toFixed(1) + '%'
      ]);

      autoTable(doc, {
        startY: 32,
        head,
        body,
        theme: 'grid',
        headStyles: { fillColor: [33, 37, 41], fontSize: 7 },
        styles: { fontSize: 7, cellPadding: 1 },
        margin: { left: 10, right: 10 }
      });

      doc.save(`utilidad_ventas_${this.fromDate}_${this.toDate}.pdf`);
      toast.success('PDF generado correctamente');
    } catch (err) {
      toast.error('Error al generar PDF');
    } finally {
      this.isGeneratingPdf = false;
    }
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
  }

  formatNumber(value: number): string {
    return new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
  }

  private formatDate(date: Date): string {
    return formatInTimeZone(date, 'America/Bogota', 'yyyy-MM-dd');
  }

  // ============ GRÁFICOS ============

  openCharts(): void {
    this.buildCharts();
    this.showChart = true;
  }

  private buildCharts(): void {
    const data = this.filteredRows;
    if (data.length === 0) { this.chartConfigs = []; return; }

    // 1. Utilidad por día
    const byDate = new Map<string, { sales: number; cost: number; profit: number }>();
    data.forEach(r => {
      const date = r.dateTimeRecord?.split('T')[0] || 'Sin fecha';
      const entry = byDate.get(date) || { sales: 0, cost: 0, profit: 0 };
      entry.sales += r.subtotal;
      entry.cost += r.totalCost;
      entry.profit += r.grossProfit;
      byDate.set(date, entry);
    });
    const sortedDates = [...byDate.keys()].sort();

    const profitByDay: ChartConfig = {
      title: 'Utilidad por Día',
      labels: sortedDates,
      datasets: [
        { label: 'Ventas', data: sortedDates.map(d => byDate.get(d)!.sales), backgroundColor: 'rgba(40, 167, 69, 0.6)', borderColor: 'rgba(40, 167, 69, 1)' },
        { label: 'Costo', data: sortedDates.map(d => byDate.get(d)!.cost), backgroundColor: 'rgba(220, 53, 69, 0.6)', borderColor: 'rgba(220, 53, 69, 1)' },
        { label: 'Utilidad', data: sortedDates.map(d => byDate.get(d)!.profit), backgroundColor: 'rgba(0, 123, 255, 0.6)', borderColor: 'rgba(0, 123, 255, 1)' }
      ],
      chartType: 'bar'
    };

    // 2. Top 10 productos por utilidad
    const byProduct = new Map<string, number>();
    data.forEach(r => {
      const desc = r.productDescription || 'Sin nombre';
      byProduct.set(desc, (byProduct.get(desc) || 0) + r.grossProfit);
    });
    const topProducts = [...byProduct.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

    const profitByProduct: ChartConfig = {
      title: 'Top 10 Productos por Utilidad',
      labels: topProducts.map(p => p[0].substring(0, 25)),
      datasets: [{ label: 'Utilidad', data: topProducts.map(p => p[1]) }],
      chartType: 'bar'
    };

    // 3. Utilidad por categoría
    const byCat = new Map<string, { sales: number; profit: number }>();
    data.forEach(r => {
      const cat = r.category || 'Sin categoría';
      const entry = byCat.get(cat) || { sales: 0, profit: 0 };
      entry.sales += r.subtotal;
      entry.profit += r.grossProfit;
      byCat.set(cat, entry);
    });
    const catEntries = [...byCat.entries()].sort((a, b) => b[1].profit - a[1].profit);

    const profitByCategory: ChartConfig = {
      title: 'Utilidad por Categoría',
      labels: catEntries.map(c => c[0]),
      datasets: [
        { label: 'Ventas', data: catEntries.map(c => c[1].sales) },
        { label: 'Utilidad', data: catEntries.map(c => c[1].profit) }
      ],
      chartType: 'bar'
    };

    // 4. Margen por día (tendencia)
    const marginByDay: ChartConfig = {
      title: 'Margen de Utilidad por Día (%)',
      labels: sortedDates,
      datasets: [{
        label: 'Margen %',
        data: sortedDates.map(d => {
          const e = byDate.get(d)!;
          return e.sales > 0 ? Number(((e.profit / e.sales) * 100).toFixed(1)) : 0;
        }),
        borderColor: 'rgba(255, 193, 7, 1)',
        backgroundColor: 'rgba(255, 193, 7, 0.2)',
        fill: true,
        tension: 0.4
      }],
      chartType: 'line'
    };

    this.chartConfigs = [profitByDay, profitByProduct, profitByCategory, marginByDay];
  }
}
