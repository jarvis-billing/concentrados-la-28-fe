import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { FacturaService } from '../../../factura/factura.service';
import { ProductoService } from '../../../producto/producto.service';
import { Billing, BillingReportFilter } from '../../../factura/billing';
import { Product } from '../../../producto/producto';
import { toast } from 'ngx-sonner';
import { formatInTimeZone } from 'date-fns-tz';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ReportChartModalComponent, ChartConfig } from '../../components/report-chart-modal/report-chart-modal.component';

export interface MonthlyRow {
  monthKey: string;        // 'YYYY-MM'
  monthLabel: string;      // 'Enero 2025'
  invoiceCount: number;
  itemCount: number;
  totalSales: number;
  totalCost: number;
  grossProfit: number;
  profitMargin: number;
}

@Component({
  selector: 'app-sales-monthly-report',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, ReportChartModalComponent],
  templateUrl: './sales-monthly-report.component.html',
  styleUrls: ['./sales-monthly-report.component.css'],
})
export class SalesMonthlyReportComponent implements OnInit {
  private facturaService = inject(FacturaService);
  private productService = inject(ProductoService);

  // ── Filtros de período ──────────────────────────────────────────────────
  fromMonth = '';   // 'YYYY-MM'
  toMonth = '';     // 'YYYY-MM'

  // ── Filtros adicionales ─────────────────────────────────────────────────
  selectedClient = '';
  selectedProduct = '';
  selectedCategory = '';
  selectedBrand = '';
  selectedSaleType = '';
  selectedPaymentMethod = '';
  searchText = '';

  // ── Catálogos para filtros ──────────────────────────────────────────────
  products: Product[] = [];
  categories: string[] = [];
  brands: string[] = [];

  // ── Estado ──────────────────────────────────────────────────────────────
  isLoading = false;
  hasLoaded = false;
  isGeneratingPdf = false;

  // ── Datos ───────────────────────────────────────────────────────────────
  /** Todas las filas mensuales (resultado del agrupamiento) */
  monthlyRows: MonthlyRow[] = [];
  /** Vista activa: tabla mensual o detalle de un mes */
  viewMode: 'monthly' | 'detail' = 'monthly';

  // ── Totales globales ────────────────────────────────────────────────────
  totals = { sales: 0, cost: 0, profit: 0, margin: 0, invoices: 0, items: 0 };

  // ── Gráficos ────────────────────────────────────────────────────────────
  showChart = false;
  chartConfigs: ChartConfig[] = [];

  // ── Visibilidad de columnas ─────────────────────────────────────────────
  cols = {
    invoices:  true,
    items:     false,
    cost:      true,
    profit:    true,
    margin:    true,
    bar:       true,
  };
  showColMenu = false;
  showInfo    = false;

  // ── Ordenamiento ────────────────────────────────────────────────────────
  sortCol = 'monthKey';
  sortDir: 'asc' | 'desc' = 'asc';

  /** Raw billings cargadas del servidor (antes de agrupar) */
  private rawBillings: Billing[] = [];

  ngOnInit(): void {
    const today = new Date();
    this.toMonth = formatInTimeZone(today, 'America/Bogota', 'yyyy-MM');
    const threeAgo = new Date(today.getFullYear(), today.getMonth() - 2, 1);
    this.fromMonth = formatInTimeZone(threeAgo, 'America/Bogota', 'yyyy-MM');

    this.productService.getAll().subscribe(products => {
      this.products = products;
      this.categories = [...new Set(products.map(p => p.category).filter(Boolean))].sort();
      this.brands = [...new Set(products.map(p => p.brand).filter(Boolean))].sort();
    });
  }

  // ── Consultar ──────────────────────────────────────────────────────────

  loadReport(): void {
    if (!this.fromMonth || !this.toMonth) {
      toast.warning('Seleccione el período (mes inicio y mes fin)');
      return;
    }
    if (this.fromMonth > this.toMonth) {
      toast.warning('El mes inicial no puede ser mayor al mes final');
      return;
    }

    const fromDate = `${this.fromMonth}-01`;
    const toDate = this.lastDayOf(this.toMonth);

    const filter: BillingReportFilter = {
      fromDate,
      toDate,
      billNumber: '',
      userSale: '',
      client: this.selectedClient,
      product: this.selectedProduct,
      saleType: this.selectedSaleType,
      paymentMethod: this.selectedPaymentMethod,
    };

    this.isLoading = true;
    this.hasLoaded = true;

    this.facturaService.findAllBilling(filter).subscribe({
      next: billings => {
        this.rawBillings = billings;
        this.buildMonthlyRows(billings);
        this.isLoading = false;
      },
      error: () => {
        toast.error('Error al cargar el reporte');
        this.isLoading = false;
      },
    });
  }

  applyLocalFilters(): void {
    this.buildMonthlyRows(this.rawBillings);
  }

  clearFilters(): void {
    this.selectedClient = '';
    this.selectedProduct = '';
    this.selectedCategory = '';
    this.selectedBrand = '';
    this.selectedSaleType = '';
    this.selectedPaymentMethod = '';
    this.searchText = '';
    if (this.rawBillings.length > 0) this.buildMonthlyRows(this.rawBillings);
  }

  // ── Lógica de agrupamiento ─────────────────────────────────────────────

  private buildMonthlyRows(billings: Billing[]): void {
    const map = new Map<string, { sales: number; cost: number; profit: number; invoices: Set<string>; items: number }>();

    billings.forEach(billing => {
      const raw = billing.dateTimeRecord || '';
      const monthKey = raw.substring(0, 7);   // 'YYYY-MM'
      if (!monthKey || monthKey.length < 7) return;

      if (!map.has(monthKey)) {
        map.set(monthKey, { sales: 0, cost: 0, profit: 0, invoices: new Set(), items: 0 });
      }
      const entry = map.get(monthKey)!;
      entry.invoices.add(billing.billNumber || billing.id || '');

      (billing.saleDetails || []).forEach(detail => {
        // Filtro por categoría / marca (local)
        const matchedProduct = this.products.find(p => p.id === detail.id || p.id === detail.product?.id);
        const category = matchedProduct?.category || detail.product?.category || '';
        const brand = matchedProduct?.brand || detail.product?.brand || '';

        if (this.selectedCategory && category !== this.selectedCategory) return;
        if (this.selectedBrand && brand !== this.selectedBrand) return;
        if (this.searchText) {
          const q = this.searchText.toLowerCase();
          const desc = (detail.product?.description || matchedProduct?.description || '').toLowerCase();
          const client = (billing.client?.fullName || billing.client?.name || '').toLowerCase();
          const bill = (billing.billNumber || '').toLowerCase();
          if (!desc.includes(q) && !client.includes(q) && !bill.includes(q)) return;
        }

        const subtotal = detail.subTotal ?? (detail.amount * (detail.unitPrice || 0));
        const unitCost = detail.unitCost || this.getFallbackCost(detail.product?.barcode || '') || 0;
        const totalCost = unitCost * detail.amount;
        const grossProfit = subtotal - totalCost;

        entry.sales += subtotal;
        entry.cost += totalCost;
        entry.profit += grossProfit;
        entry.items++;
      });
    });

    const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                         'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    this.monthlyRows = [...map.entries()].map(([key, v]) => {
      const [year, month] = key.split('-');
      return {
        monthKey: key,
        monthLabel: `${MONTH_NAMES[Number(month) - 1]} ${year}`,
        invoiceCount: v.invoices.size,
        itemCount: v.items,
        totalSales: v.sales,
        totalCost: v.cost,
        grossProfit: v.profit,
        profitMargin: v.sales > 0 ? (v.profit / v.sales) * 100 : 0,
      } as MonthlyRow;
    });

    this.sortRows();
    this.calcTotals();
  }

  private getFallbackCost(barcode: string): number {
    if (!barcode) return 0;
    for (const p of this.products) {
      const pres = (p.presentations || []).find(pr => pr.barcode === barcode);
      if (pres && pres.costPrice > 0) return pres.costPrice;
    }
    return 0;
  }

  private calcTotals(): void {
    const r = this.monthlyRows;
    const totalSales = r.reduce((s, x) => s + x.totalSales, 0);
    this.totals = {
      sales: totalSales,
      cost: r.reduce((s, x) => s + x.totalCost, 0),
      profit: r.reduce((s, x) => s + x.grossProfit, 0),
      margin: totalSales > 0 ? (r.reduce((s, x) => s + x.grossProfit, 0) / totalSales) * 100 : 0,
      invoices: r.reduce((s, x) => s + x.invoiceCount, 0),
      items: r.reduce((s, x) => s + x.itemCount, 0),
    };
  }

  // ── Ordenamiento ────────────────────────────────────────────────────────

  toggleSort(col: string): void {
    if (this.sortCol === col) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortCol = col;
      this.sortDir = col === 'monthKey' ? 'asc' : 'desc';
    }
    this.sortRows();
  }

  private sortRows(): void {
    const dir = this.sortDir === 'asc' ? 1 : -1;
    this.monthlyRows.sort((a: any, b: any) => {
      const va = a[this.sortCol];
      const vb = b[this.sortCol];
      if (typeof va === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }

  sortIcon(col: string): string {
    if (this.sortCol !== col) return 'bi-chevron-expand';
    return this.sortDir === 'asc' ? 'bi-chevron-up' : 'bi-chevron-down';
  }

  // ── Gráficos ────────────────────────────────────────────────────────────

  openCharts(): void {
    this.buildCharts();
    this.showChart = true;
  }

  private buildCharts(): void {
    const sorted = [...this.monthlyRows].sort((a, b) => a.monthKey.localeCompare(b.monthKey));
    const labels = sorted.map(r => r.monthLabel);

    const salesVsProfit: ChartConfig = {
      title: 'Ventas y Utilidad por Mes',
      labels,
      datasets: [
        {
          label: 'Ventas',
          data: sorted.map(r => r.totalSales),
          backgroundColor: 'rgba(13, 110, 253, 0.6)',
          borderColor: 'rgba(13, 110, 253, 1)',
        },
        {
          label: 'Costo',
          data: sorted.map(r => r.totalCost),
          backgroundColor: 'rgba(220, 53, 69, 0.5)',
          borderColor: 'rgba(220, 53, 69, 1)',
        },
        {
          label: 'Utilidad',
          data: sorted.map(r => r.grossProfit),
          backgroundColor: 'rgba(25, 135, 84, 0.6)',
          borderColor: 'rgba(25, 135, 84, 1)',
        },
      ],
      chartType: 'bar',
    };

    const marginTrend: ChartConfig = {
      title: 'Tendencia Margen de Utilidad (%)',
      labels,
      datasets: [
        {
          label: 'Margen %',
          data: sorted.map(r => Number(r.profitMargin.toFixed(1))),
          borderColor: 'rgba(255, 193, 7, 1)',
          backgroundColor: 'rgba(255, 193, 7, 0.2)',
          fill: true,
          tension: 0.4,
        },
      ],
      chartType: 'line',
    };

    const invoiceCount: ChartConfig = {
      title: 'Número de Facturas por Mes',
      labels,
      datasets: [
        {
          label: 'Facturas',
          data: sorted.map(r => r.invoiceCount),
          backgroundColor: 'rgba(108, 117, 125, 0.6)',
          borderColor: 'rgba(108, 117, 125, 1)',
        },
      ],
      chartType: 'bar',
    };

    const profitMix: ChartConfig = {
      title: 'Distribución Ventas vs Utilidad',
      labels,
      datasets: [
        {
          label: 'Ventas',
          data: sorted.map(r => r.totalSales),
          backgroundColor: 'rgba(13, 110, 253, 0.7)',
        },
        {
          label: 'Utilidad',
          data: sorted.map(r => r.grossProfit),
          backgroundColor: 'rgba(25, 135, 84, 0.7)',
        },
      ],
      chartType: 'bar',
    };

    this.chartConfigs = [salesVsProfit, marginTrend, invoiceCount, profitMix];
  }

  // ── PDF ─────────────────────────────────────────────────────────────────

  generatePdf(): void {
    if (this.monthlyRows.length === 0) { toast.warning('No hay datos para exportar'); return; }
    this.isGeneratingPdf = true;
    try {
      const doc = new jsPDF('landscape', 'mm', 'letter');
      const pw = doc.internal.pageSize.getWidth();

      doc.setFontSize(14);
      doc.text('Reporte de Ventas por Mes', 10, 15);
      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text(`Período: ${this.fromMonth} → ${this.toMonth}`, 10, 21);
      doc.text(`Generado: ${new Date().toLocaleString('es-CO')}`, pw - 10, 21, { align: 'right' });
      doc.text(`Total ventas: ${this.formatCurrency(this.totals.sales)}  ·  Utilidad: ${this.formatCurrency(this.totals.profit)}  ·  Margen: ${this.totals.margin.toFixed(1)}%`, 10, 27);

      // Construir columnas según visibilidad actual
      const head: string[] = ['Mes'];
      if (this.cols.invoices) head.push('Facturas');
      if (this.cols.items)    head.push('Ítems');
      head.push('Total Ventas');
      if (this.cols.cost)     head.push('Costo Total');
      if (this.cols.profit)   head.push('Utilidad Bruta');
      if (this.cols.margin)   head.push('Margen %');

      const body = this.monthlyRows.map(r => {
        const row: (string | number)[] = [r.monthLabel];
        if (this.cols.invoices) row.push(r.invoiceCount);
        if (this.cols.items)    row.push(r.itemCount);
        row.push(this.formatCurrency(r.totalSales));
        if (this.cols.cost)     row.push(this.formatCurrency(r.totalCost));
        if (this.cols.profit)   row.push(this.formatCurrency(r.grossProfit));
        if (this.cols.margin)   row.push(r.profitMargin.toFixed(1) + '%');
        return row;
      });

      const foot: (string | number)[] = ['TOTAL'];
      if (this.cols.invoices) foot.push(this.totals.invoices);
      if (this.cols.items)    foot.push(this.totals.items);
      foot.push(this.formatCurrency(this.totals.sales));
      if (this.cols.cost)     foot.push(this.formatCurrency(this.totals.cost));
      if (this.cols.profit)   foot.push(this.formatCurrency(this.totals.profit));
      if (this.cols.margin)   foot.push(this.totals.margin.toFixed(1) + '%');

      autoTable(doc, {
        startY: 33,
        head: [head],
        body,
        foot: [foot],
        theme: 'grid',
        headStyles: { fillColor: [13, 110, 253], fontSize: 8 },
        footStyles: { fillColor: [33, 37, 41], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        styles: { fontSize: 8, cellPadding: 2 },
        margin: { left: 10, right: 10 },
      });

      doc.save(`ventas_mes_${this.fromMonth}_${this.toMonth}.pdf`);
      toast.success('PDF generado');
    } catch { toast.error('Error al generar PDF'); }
    finally { this.isGeneratingPdf = false; }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private lastDayOf(ym: string): string {
    const [y, m] = ym.split('-').map(Number);
    const last = new Date(y, m, 0);   // día 0 del mes siguiente = último del actual
    return `${y}-${String(m).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
  }

  formatCurrency(v: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v);
  }

  formatNumber(v: number): string {
    return new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0 }).format(v);
  }

  marginClass(pct: number): string {
    if (pct >= 25) return 'text-success fw-semibold';
    if (pct >= 10) return 'text-warning fw-semibold';
    return 'text-danger fw-semibold';
  }
}
