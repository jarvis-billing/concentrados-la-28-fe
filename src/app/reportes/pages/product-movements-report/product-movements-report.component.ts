import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { FacturaService } from '../../../factura/factura.service';
import { PurchasesService } from '../../../compras/services/purchases.service';
import { ProductoService } from '../../../producto/producto.service';
import { Billing, BillingReportFilter } from '../../../factura/billing';
import { Product } from '../../../producto/producto';
import { toast } from 'ngx-sonner';
import { formatInTimeZone } from 'date-fns-tz';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ReportChartModalComponent, ChartConfig } from '../../components/report-chart-modal/report-chart-modal.component';

interface MovementRow {
  date: string;
  movementType: string;
  movementTypeLabel: string;
  reference: string;
  productDescription: string;
  presentationLabel: string;
  barcode: string;
  category: string;
  brand: string;
  quantityIn: number;
  quantityOut: number;
  unitMeasure: string;
  unitPrice: number;
  total: number;
  notes: string;
}

interface MovementSummary {
  totalIn: number;
  totalOut: number;
  netMovement: number;
  totalValueIn: number;
  totalValueOut: number;
  movementCount: number;
}

@Component({
  selector: 'app-product-movements-report',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, ReportChartModalComponent],
  templateUrl: './product-movements-report.component.html',
  styleUrls: ['./product-movements-report.component.css']
})
export class ProductMovementsReportComponent implements OnInit {
  private facturaService = inject(FacturaService);
  private purchasesService = inject(PurchasesService);
  private productService = inject(ProductoService);

  // Filtros
  fromDate = '';
  toDate = '';
  selectedCategory = '';
  selectedBrand = '';
  selectedMovementType = '';
  searchText = '';

  // Datos
  rows: MovementRow[] = [];
  filteredRows: MovementRow[] = [];
  summary: MovementSummary = { totalIn: 0, totalOut: 0, netMovement: 0, totalValueIn: 0, totalValueOut: 0, movementCount: 0 };
  products: Product[] = [];
  categories: string[] = [];
  brands: string[] = [];
  isLoading = false;
  hasLoaded = false;
  isGeneratingPdf = false;

  // Gráficos
  showChart = false;
  chartConfigs: ChartConfig[] = [];

  // Paginación
  pageSize = 50;
  currentPage = 1;

  // Ordenamiento
  sortColumn = '';
  sortDirection: 'asc' | 'desc' = 'desc';

  movementTypes = [
    { value: 'VENTA', label: 'Ventas', color: 'danger' },
    { value: 'COMPRA', label: 'Compras', color: 'success' },
  ];

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

    const salesFilter: BillingReportFilter = {
      fromDate: this.fromDate,
      toDate: this.toDate,
      billNumber: '', userSale: '', client: '', product: '', saleType: '', paymentMethod: ''
    };

    // Cargar ventas y compras en paralelo
    forkJoin({
      sales: this.facturaService.findAllBilling(salesFilter).pipe(catchError(() => of([] as Billing[]))),
      purchases: this.purchasesService.list({ fromDate: this.fromDate, toDate: this.toDate }).pipe(catchError(() => of([] as any[])))
    }).subscribe({
      next: ({ sales, purchases }) => {
        this.buildMovementRows(sales, purchases);
        this.isLoading = false;
      },
      error: () => {
        toast.error('Error al cargar el reporte');
        this.isLoading = false;
      }
    });
  }

  private buildMovementRows(billings: Billing[], purchases: any[]): void {
    const rows: MovementRow[] = [];

    // Ventas -> Salidas
    billings.forEach(billing => {
      (billing.saleDetails || []).forEach(detail => {
        const matchedProduct = this.products.find(p => p.id === detail.id);
        rows.push({
          date: billing.dateTimeRecord,
          movementType: 'VENTA',
          movementTypeLabel: 'Venta',
          reference: `Factura ${billing.billNumber}`,
          productDescription: detail.product?.description || matchedProduct?.description || '',
          presentationLabel: detail.product?.selectedPresentationLabel || detail.product?.barcode || '',
          barcode: detail.product?.barcode || '',
          category: matchedProduct?.category || '',
          brand: matchedProduct?.brand || '',
          quantityIn: 0,
          quantityOut: detail.amount,
          unitMeasure: detail.product?.selectedUnitMeasure || '',
          unitPrice: detail.unitPrice,
          total: detail.subTotal || (detail.amount * detail.unitPrice),
          notes: `Cliente: ${billing.client?.fullName || billing.client?.name || 'Consumidor Final'}`
        });
      });
    });

    // Compras -> Entradas
    // PurchaseItem fields: description, presentationBarcode, productId, quantity, unitCost, totalCost
    // PurchaseInvoice fields: supplier.name, invoiceNumber, emissionDate
    (purchases || []).forEach((purchase: any) => {
      const supplierName = purchase.supplier?.name || purchase.supplierName || '';
      (purchase.items || []).forEach((item: any) => {
        const barcode = item.presentationBarcode || item.barcode || '';
        const matchedProduct = this.products.find(p =>
          p.id === item.productId ||
          (p.presentations || []).some(pres => pres.barcode === barcode)
        );
        // Buscar la presentación para obtener label
        const matchedPres = matchedProduct?.presentations?.find(pres => pres.barcode === barcode);

        rows.push({
          date: purchase.emissionDate || purchase.createdAt || '',
          movementType: 'COMPRA',
          movementTypeLabel: 'Compra',
          reference: `Compra ${purchase.invoiceNumber || purchase.id || ''}`,
          productDescription: item.description || matchedProduct?.description || '',
          presentationLabel: matchedPres?.label || barcode,
          barcode: barcode,
          category: matchedProduct?.category || '',
          brand: matchedProduct?.brand || '',
          quantityIn: item.quantity || 0,
          quantityOut: 0,
          unitMeasure: matchedPres?.unitMeasure || '',
          unitPrice: item.unitCost || 0,
          total: item.totalCost || (item.quantity * (item.unitCost || 0)),
          notes: `Proveedor: ${supplierName}`
        });
      });
    });

    // Ordenar por fecha descendente
    rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    this.rows = rows;
    this.applyFilters();
  }

  applyFilters(): void {
    let filtered = [...this.rows];

    if (this.selectedCategory) {
      filtered = filtered.filter(r => r.category === this.selectedCategory);
    }
    if (this.selectedBrand) {
      filtered = filtered.filter(r => r.brand === this.selectedBrand);
    }
    if (this.selectedMovementType) {
      filtered = filtered.filter(r => r.movementType === this.selectedMovementType);
    }
    if (this.searchText.trim()) {
      const q = this.searchText.toLowerCase();
      filtered = filtered.filter(r =>
        r.productDescription.toLowerCase().includes(q) ||
        r.reference.toLowerCase().includes(q) ||
        r.barcode.includes(q)
      );
    }

    this.filteredRows = filtered;
    this.currentPage = 1;
    this.calculateSummary();
  }

  private calculateSummary(): void {
    const data = this.filteredRows;
    const totalIn = data.reduce((s, r) => s + r.quantityIn, 0);
    const totalOut = data.reduce((s, r) => s + r.quantityOut, 0);
    this.summary = {
      totalIn,
      totalOut,
      netMovement: totalIn - totalOut,
      totalValueIn: data.filter(r => r.quantityIn > 0).reduce((s, r) => s + r.total, 0),
      totalValueOut: data.filter(r => r.quantityOut > 0).reduce((s, r) => s + r.total, 0),
      movementCount: data.length
    };
  }

  clearFilters(): void {
    this.selectedCategory = '';
    this.selectedBrand = '';
    this.selectedMovementType = '';
    this.searchText = '';
    this.sortColumn = '';
    this.applyFilters();
  }

  getMovementColor(type: string): string {
    return type === 'VENTA' ? 'danger' : type === 'COMPRA' ? 'success' : 'secondary';
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
  get pagedRows(): MovementRow[] { return this.filteredRows.slice(this.startIndex, this.endIndex); }

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
      doc.text('Reporte de Movimientos de Productos', 10, 15);
      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text(`Periodo: ${this.fromDate} a ${this.toDate}`, 10, 21);
      doc.text(`Generado: ${new Date().toLocaleString('es-CO')}`, pageW - 10, 21, { align: 'right' });

      doc.setFontSize(9);
      doc.text(`Entradas: ${this.formatNumber(this.summary.totalIn)} | Salidas: ${this.formatNumber(this.summary.totalOut)} | Neto: ${this.formatNumber(this.summary.netMovement)}`, 10, 27);

      const head = [['#', 'Fecha', 'Tipo', 'Referencia', 'Producto', 'Entrada', 'Salida', 'P.Unit', 'Total', 'Notas']];
      const body = this.filteredRows.map((r, i) => [
        i + 1,
        r.date?.split('T')[0] || '',
        r.movementTypeLabel,
        r.reference?.substring(0, 25),
        r.productDescription?.substring(0, 25),
        r.quantityIn > 0 ? r.quantityIn : '',
        r.quantityOut > 0 ? r.quantityOut : '',
        this.formatNumber(r.unitPrice),
        this.formatNumber(r.total),
        r.notes?.substring(0, 20) || ''
      ]);

      autoTable(doc, {
        startY: 32,
        head, body,
        theme: 'grid',
        headStyles: { fillColor: [33, 37, 41], fontSize: 7 },
        styles: { fontSize: 7, cellPadding: 1 },
        margin: { left: 10, right: 10 }
      });

      doc.save(`movimientos_productos_${this.fromDate}_${this.toDate}.pdf`);
      toast.success('PDF generado');
    } catch {
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

    // 1. Entradas vs Salidas por día
    const byDate = new Map<string, { in: number; out: number; valueIn: number; valueOut: number }>();
    data.forEach(r => {
      const date = r.date?.split('T')[0] || 'Sin fecha';
      const entry = byDate.get(date) || { in: 0, out: 0, valueIn: 0, valueOut: 0 };
      entry.in += r.quantityIn;
      entry.out += r.quantityOut;
      entry.valueIn += r.quantityIn > 0 ? r.total : 0;
      entry.valueOut += r.quantityOut > 0 ? r.total : 0;
      byDate.set(date, entry);
    });
    const sortedDates = [...byDate.keys()].sort();

    const qtyByDay: ChartConfig = {
      title: 'Cantidad Entradas vs Salidas por Día',
      labels: sortedDates,
      datasets: [
        { label: 'Entradas', data: sortedDates.map(d => byDate.get(d)!.in), backgroundColor: 'rgba(40, 167, 69, 0.6)', borderColor: 'rgba(40, 167, 69, 1)' },
        { label: 'Salidas', data: sortedDates.map(d => byDate.get(d)!.out), backgroundColor: 'rgba(220, 53, 69, 0.6)', borderColor: 'rgba(220, 53, 69, 1)' }
      ],
      chartType: 'bar'
    };

    const valueByDay: ChartConfig = {
      title: 'Valor Entradas vs Salidas por Día ($)',
      labels: sortedDates,
      datasets: [
        { label: 'Valor Entradas', data: sortedDates.map(d => byDate.get(d)!.valueIn), backgroundColor: 'rgba(40, 167, 69, 0.6)', borderColor: 'rgba(40, 167, 69, 1)' },
        { label: 'Valor Salidas', data: sortedDates.map(d => byDate.get(d)!.valueOut), backgroundColor: 'rgba(220, 53, 69, 0.6)', borderColor: 'rgba(220, 53, 69, 1)' }
      ],
      chartType: 'line'
    };

    // 2. Top 10 productos más movidos
    const byProduct = new Map<string, { in: number; out: number }>();
    data.forEach(r => {
      const desc = r.productDescription || 'Sin nombre';
      const entry = byProduct.get(desc) || { in: 0, out: 0 };
      entry.in += r.quantityIn;
      entry.out += r.quantityOut;
      byProduct.set(desc, entry);
    });
    const topProducts = [...byProduct.entries()]
      .sort((a, b) => (b[1].in + b[1].out) - (a[1].in + a[1].out))
      .slice(0, 10);

    const movByProduct: ChartConfig = {
      title: 'Top 10 Productos con Mayor Movimiento',
      labels: topProducts.map(p => p[0].substring(0, 25)),
      datasets: [
        { label: 'Entradas', data: topProducts.map(p => p[1].in) },
        { label: 'Salidas', data: topProducts.map(p => p[1].out) }
      ],
      chartType: 'bar'
    };

    // 3. Distribución por tipo de movimiento
    const byType = new Map<string, number>();
    data.forEach(r => {
      const type = r.movementTypeLabel || r.movementType;
      byType.set(type, (byType.get(type) || 0) + 1);
    });

    const movDistribution: ChartConfig = {
      title: 'Distribución por Tipo de Movimiento',
      labels: [...byType.keys()],
      datasets: [{ label: 'Cantidad', data: [...byType.values()] }],
      chartType: 'pie'
    };

    this.chartConfigs = [qtyByDay, valueByDay, movByProduct, movDistribution];
  }
}
