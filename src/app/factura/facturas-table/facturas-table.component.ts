import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { FacturaService } from '../factura.service';
import { Billing, BillingReportFilter, BillingReportFilterPaged, PageResponse, SalesTotals } from '../billing';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ClienteService } from '../../cliente/cliente.service';
import { Client } from '../../cliente/cliente';
import { ModalClientsListComponent } from "../../cliente/components/modal-clients-list/modal-clients-list.component";
import { User } from '../../auth/user';
import { ModalUsersListComponent } from "../../users/components/modal-users-list/modal-users-list.component";
import { CommonModule, CurrencyPipe } from '@angular/common';
import { ModalSaleDetailComponent } from "../components/modal-sale-detail/modal-sale-detail.component";
import { toast } from 'ngx-sonner';
import { LoginUserService } from '../../auth/login/loginUser.service';
import { ProductsSearchModalComponent } from '../../producto/components/products-search-modal/products-search-modal.component';
import { Product } from '../../producto/producto';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

@Component({
  selector: 'app-facturas-table',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalClientsListComponent, ModalUsersListComponent, ReactiveFormsModule, CurrencyPipe, ModalSaleDetailComponent, ProductsSearchModalComponent],
  templateUrl: './facturas-table.component.html',
  styleUrl: './facturas-table.component.css'
})
export class FacturasTableComponent implements OnInit {

  private fb = inject(FormBuilder);
  facturaService = inject(FacturaService);
  clientService = inject(ClienteService);
  loginUserService = inject(LoginUserService);
  
  @ViewChild(ProductsSearchModalComponent, { static: false }) productsSearchModalComp!: ProductsSearchModalComponent;

  reportBilling: Billing[] = [];
  filteredBilling: Billing[] = [];
  clients: Client[] = [];
  filteredClientsForFilter: Client[] = [];
  clientSearchText: string = '';
  showClientDropdown: boolean = false;
  selectedClient: Client | null = null;
  selectedProduct: Product | null = null;
  today: string = '';

  selectedBilling: any = null;
  expandedBillingId: string | null = null;
  
  isLoading: boolean = false;
  userLogin = this.loginUserService.getUserFromToken();

  // Paginación server-side
  Math = Math;
  currentPage: number = 0;
  pageSize: number = 20;
  totalElements: number = 0;
  totalPages: number = 0;
  isFirstPage: boolean = true;
  isLastPage: boolean = false;

  // Totales del servidor
  salesTotals: SalesTotals | null = null;
  isLoadingTotals: boolean = false;

  filterForm: FormGroup = this.fb.group({
    startDate: [''],
    endDate: [''],
    clientId: [''],
    productSearch: [''],
    saleType: [''],
    billNumber: [''],
    paymentMethod: ['']
  });

  openSaleDetailModal(billing: any): void {
    this.selectedBilling = billing;
    const modal = document.getElementById('modalSaleDetail');
    if (modal) {
      modal.classList.add('show');
      modal.style.display = 'block';
    }
  }


  formatDate(dateInput: string | Date): string {
    const date = new Date(dateInput);
    return new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  }


  ngOnInit(): void {
    const now = new Date();
    this.today = now.toISOString().split('T')[0];
    this.filterForm.patchValue({
      startDate: this.today,
      endDate: this.today
    });
    this.clientService.getAll().subscribe(clients => {
      this.clients = clients;
      this.filteredClientsForFilter = clients;
    });
    this.loadBillingsPaged();
  }

  // Todas las facturas retornadas por el servidor con los filtros actuales
  allServerResults: Billing[] = [];

  private buildServerFilter(): BillingReportFilter {
    const f = this.filterForm.value;
    const filter = new BillingReportFilter();
    filter.fromDate = f.endDate || '';
    filter.toDate = f.startDate || '';
    filter.billNumber = f.billNumber || '';
    filter.client = this.selectedClient?.id || '';
    filter.product = this.selectedProduct?.id || '';
    filter.paymentMethod = f.paymentMethod || '';
    return filter;
  }

  loadBillingsPaged(): void {
    this.isLoading = true;
    const filter = this.buildServerFilter();

    this.facturaService.findAllBilling(filter).subscribe({
      next: (billings) => {
        this.allServerResults = billings.sort((a, b) => {
          const dateA = new Date(a.dateTimeRecord || 0).getTime();
          const dateB = new Date(b.dateTimeRecord || 0).getTime();
          return dateB - dateA;
        });
        this.reportBilling = this.allServerResults;
        this.totalElements = this.allServerResults.length;
        this.computeTotals(this.allServerResults);
        this.paginateResults();
        this.isLoading = false;

        if (this.allServerResults.length === 0) {
          toast.info('No se encontraron facturas con los criterios de búsqueda proporcionados.');
        }
      },
      error: () => {
        toast.error('Error al cargar las facturas');
        this.isLoading = false;
      }
    });
  }

  private paginateResults(): void {
    const data = this.allServerResults;
    this.totalPages = Math.ceil(data.length / this.pageSize);
    if (this.currentPage >= this.totalPages && this.totalPages > 0) {
      this.currentPage = this.totalPages - 1;
    }
    const start = this.currentPage * this.pageSize;
    const end = start + this.pageSize;
    this.filteredBilling = data.slice(start, end);
    this.isFirstPage = this.currentPage === 0;
    this.isLastPage = this.currentPage >= this.totalPages - 1;
  }

  private computeTotals(billings: Billing[]): void {
    const totals: SalesTotals = {
      totalInvoices: billings.length,
      totalSubtotal: billings.reduce((s, b) => s + (b.subTotalSale || 0), 0),
      totalIva: billings.reduce((s, b) => s + (b.totalIVAT || 0), 0),
      totalGeneral: 0,
      countContado: billings.filter(b => b.saleType === 'CONTADO').length,
      countCredito: billings.filter(b => b.saleType === 'CREDITO').length,
      totalContado: billings.filter(b => b.saleType === 'CONTADO').reduce((s, b) => s + (b.subTotalSale || 0) + (b.totalIVAT || 0), 0),
      totalCredito: billings.filter(b => b.saleType === 'CREDITO').reduce((s, b) => s + (b.subTotalSale || 0) + (b.totalIVAT || 0), 0),
      paymentMethodTotals: []
    };
    totals.totalGeneral = totals.totalSubtotal + totals.totalIva;

    const pmMap: Record<string, { method: string; count: number; total: number }> = {};
    billings.forEach(b => {
      if (b.payments && b.payments.length > 0) {
        b.payments.forEach(p => {
          if (!pmMap[p.method]) pmMap[p.method] = { method: p.method, count: 0, total: 0 };
          pmMap[p.method].count++;
          pmMap[p.method].total += p.amount;
        });
      } else if (b.paymentMethods && b.paymentMethods.length > 0) {
        const invoiceTotal = (b.subTotalSale || 0) + (b.totalIVAT || 0);
        const methodCount = b.paymentMethods.length;
        b.paymentMethods.forEach(method => {
          if (!pmMap[method]) pmMap[method] = { method, count: 0, total: 0 };
          pmMap[method].count++;
          pmMap[method].total += invoiceTotal / methodCount;
        });
      }
    });
    totals.paymentMethodTotals = Object.values(pmMap);

    this.salesTotals = totals;
    this.isLoadingTotals = false;
  }

  applyFilters(): void {
    this.currentPage = 0;
    this.loadBillingsPaged();
  }

  // Paginación
  goToPage(page: number): void {
    if (page < 0 || page >= this.totalPages) return;
    this.currentPage = page;
    this.paginateResults();
  }

  nextPage(): void {
    if (!this.isLastPage) this.goToPage(this.currentPage + 1);
  }

  prevPage(): void {
    if (!this.isFirstPage) this.goToPage(this.currentPage - 1);
  }

  onPageSizeChange(): void {
    this.currentPage = 0;
    this.paginateResults();
  }

  get visiblePages(): number[] {
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(0, this.currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(this.totalPages, start + maxVisible);
    if (end - start < maxVisible) {
      start = Math.max(0, end - maxVisible);
    }
    for (let i = start; i < end; i++) {
      pages.push(i);
    }
    return pages;
  }

  // Cargar TODAS las facturas filtradas para PDF
  loadAllForPdf(callback: (billings: Billing[]) => void): void {
    callback(this.reportBilling);
  }

  subTotal(): number {
    return this.filteredBilling.reduce((sum, billing) => sum + (billing.subTotalSale || 0), 0);
  }

  totalReceived(): number {
    return this.filteredBilling.reduce((sum, billing) => sum + (billing.receivedValue || 0), 0);
  }

  totalIvat(): number {
    return this.filteredBilling.reduce((sum, billing) => sum + (billing.totalIVAT || 0), 0);
  }

  // Métodos para autocompletado de clientes
  filterClients(searchText: string) {
    this.clientSearchText = searchText;
    if (!searchText.trim()) {
      this.filteredClientsForFilter = this.clients;
      this.showClientDropdown = false;
      return;
    }
    
    const query = searchText.toLowerCase();
    this.filteredClientsForFilter = this.clients.filter(c => {
      const name = (c.name || '').toLowerCase();
      const surname = (c.surname || '').toLowerCase();
      const businessName = (c.businessName || '').toLowerCase();
      const idNumber = (c.idNumber || '').toLowerCase();
      return name.includes(query) || surname.includes(query) || 
             businessName.includes(query) || idNumber.includes(query);
    });
    this.showClientDropdown = this.filteredClientsForFilter.length > 0;
  }

  selectClientForFilter(client: Client) {
    this.selectedClient = client;
    this.clientSearchText = this.getClientDisplayName(client);
    this.filterForm.patchValue({ clientId: client.id });
    this.showClientDropdown = false;
  }

  clearClientSelection() {
    this.selectedClient = null;
    this.clientSearchText = '';
    this.filterForm.patchValue({ clientId: '' });
    this.filteredClientsForFilter = this.clients;
  }

  getClientDisplayName(client: Client): string {
    if (client.name?.trim()) {
      return `${client.name} ${client.surname || ''}`.trim();
    }
    if (client.businessName?.trim()) {
      return client.businessName;
    }
    if (client.nickname?.trim()) {
      return client.nickname;
    }
    return 'Sin nombre';
  }

  // Métodos para filtro de productos
  openProductModal() {
    this.productsSearchModalComp?.openModal();
  }

  onProductSelected(product: Product) {
    this.selectedProduct = product;
    const displayText = `${product.description || ''} - ${product.barcode || ''}`.trim();
    this.filterForm.patchValue({ productSearch: displayText });
  }

  clearProductFilter() {
    this.selectedProduct = null;
    this.filterForm.patchValue({ productSearch: '' });
  }

  clearFilters() {
    this.selectedClient = null;
    this.selectedProduct = null;
    this.clientSearchText = '';
    this.filteredClientsForFilter = this.clients;
    this.filterForm.reset({
      startDate: this.today,
      endDate: this.today,
      clientId: '',
      productSearch: '',
      saleType: '',
      billNumber: '',
      paymentMethod: ''
    });
    this.currentPage = 0;
    this.loadBillingsPaged();
  }

  toggleBillingDetails(billingId: string) {
    this.expandedBillingId = this.expandedBillingId === billingId ? null : billingId;
  }

  printTicketBilling(billing: Billing) {
    this.facturaService.generatedTicketBilling(billing);
  }

  // Métodos para visualización de pagos múltiples
  getPaymentIcon(method: string): string {
    switch (method) {
      case 'EFECTIVO': return 'bi-cash-stack';
      case 'TRANSFERENCIA': return 'bi-bank';
      case 'TARJETA_CREDITO': return 'bi-credit-card';
      case 'TARJETA_DEBITO': return 'bi-credit-card-2-front';
      case 'CHEQUE': return 'bi-file-earmark-text';
      case 'SALDO_FAVOR': return 'bi-piggy-bank';
      default: return 'bi-wallet2';
    }
  }

  getPaymentBadgeClass(method: string): string {
    switch (method) {
      case 'EFECTIVO': return 'bg-success';
      case 'TRANSFERENCIA': return 'bg-primary';
      case 'TARJETA_CREDITO': return 'bg-info';
      case 'TARJETA_DEBITO': return 'bg-info';
      case 'CHEQUE': return 'bg-warning text-dark';
      case 'SALDO_FAVOR': return 'bg-info text-white';
      default: return 'bg-secondary';
    }
  }

  getPaymentBorderClass(method: string): string {
    switch (method) {
      case 'EFECTIVO': return 'border-success';
      case 'TRANSFERENCIA': return 'border-primary';
      case 'TARJETA_CREDITO': return 'border-info';
      case 'TARJETA_DEBITO': return 'border-info';
      case 'CHEQUE': return 'border-warning';
      case 'SALDO_FAVOR': return 'border-info';
      default: return 'border-secondary';
    }
  }

  formatPaymentMethod(method: string): string {
    switch (method) {
      case 'EFECTIVO': return 'Efectivo';
      case 'TRANSFERENCIA': return 'Transferencia';
      case 'TARJETA_CREDITO': return 'T. Crédito';
      case 'TARJETA_DEBITO': return 'T. Débito';
      case 'CHEQUE': return 'Cheque';
      case 'SALDO_A_FAVOR': return 'Saldo a Favor';
      default: return method;
    }
  }

  // =============================================
  // GENERACIÓN DE REPORTE PDF
  // =============================================
  isGeneratingPdf = false;

  private fmtCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency', currency: 'COP',
      minimumFractionDigits: 0, maximumFractionDigits: 0
    }).format(value);
  }

  private fmtDateShort(dateInput: string | Date): string {
    const d = new Date(dateInput);
    return new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  }

  private fmtDateTime(dateInput: string | Date): string {
    const d = new Date(dateInput);
    return new Intl.DateTimeFormat('es-CO', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true
    }).format(d);
  }

  generateSalesReportPdf(includeDetails: boolean = true): void {
    if (this.totalElements === 0 && this.filteredBilling.length === 0) {
      toast.warning('No hay facturas para generar el reporte.');
      return;
    }

    this.isGeneratingPdf = true;

    // Cargar TODAS las facturas filtradas (sin paginación) para el PDF
    this.loadAllForPdf((allBillings) => {
      if (allBillings.length === 0) {
        toast.warning('No hay facturas para generar el reporte.');
        this.isGeneratingPdf = false;
        return;
      }
      this.buildPdf(allBillings, includeDetails);
    });
  }

  private buildPdf(allBillings: Billing[], includeDetails: boolean): void {
    try {
      const doc = new jsPDF('landscape', 'mm', 'letter');
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const marginL = 10;
      const marginR = 10;
      const contentW = pageW - marginL - marginR;

      // ── Colores corporativos ──
      const PRIMARY: [number, number, number] = [33, 37, 41];
      const ACCENT: [number, number, number] = [13, 110, 253];
      const SUCCESS: [number, number, number] = [25, 135, 84];
      const DANGER: [number, number, number] = [220, 53, 69];
      const WARNING: [number, number, number] = [255, 193, 7];
      const LIGHT_BG: [number, number, number] = [248, 249, 250];

      // ═══════════════════════════════════════════
      // PÁGINA 1 — ENCABEZADO
      // ═══════════════════════════════════════════
      let y = 12;
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...PRIMARY);
      doc.text('REPORTE DE FACTURAS DE VENTA', pageW / 2, y, { align: 'center' });

      y += 8;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100);
      doc.text(`Generado: ${this.fmtDateTime(new Date())}`, pageW / 2, y, { align: 'center' });

      // ── Filtros aplicados ──
      y += 6;
      const filters = this.filterForm.value;
      const filterParts: string[] = [];
      if (filters.startDate) filterParts.push(`Desde: ${filters.startDate}`);
      if (filters.endDate) filterParts.push(`Hasta: ${filters.endDate}`);
      if (this.selectedClient) filterParts.push(`Cliente: ${this.getClientDisplayName(this.selectedClient)}`);
      if (this.selectedProduct) filterParts.push(`Producto: ${this.selectedProduct.description}`);
      if (filters.saleType) filterParts.push(`Tipo: ${filters.saleType === 'CONTADO' ? 'Contado' : 'Crédito'}`);
      if (filters.billNumber) filterParts.push(`Factura: ${filters.billNumber}`);

      if (filterParts.length > 0) {
        doc.setFontSize(8);
        doc.setTextColor(80);
        doc.text(`Filtros: ${filterParts.join(' | ')}`, pageW / 2, y, { align: 'center' });
        y += 5;
      }

      // ── Línea separadora ──
      doc.setDrawColor(...ACCENT);
      doc.setLineWidth(0.5);
      doc.line(marginL, y, pageW - marginR, y);
      y += 4;

      // ═══════════════════════════════════════════
      // SECCIÓN 1 — RESUMEN GENERAL (cards)
      // ═══════════════════════════════════════════
      const totalFacturas = allBillings.length;
      const totalVentas = allBillings.reduce((sum, b) => sum + (b.subTotalSale || 0), 0);
      const totalIva = allBillings.reduce((sum, b) => sum + (b.totalIVAT || 0), 0);
      const totalGeneral = totalVentas + totalIva;
      const totalContado = allBillings.filter(b => b.saleType === 'CONTADO').length;
      const totalCredito = allBillings.filter(b => b.saleType === 'CREDITO').length;

      // Dibujar "cards" de resumen
      const cardW = contentW / 4 - 3;
      const cardH = 16;
      const cards = [
        { label: 'Facturas', value: String(totalFacturas), color: ACCENT },
        { label: 'Total Ventas', value: this.fmtCurrency(totalVentas), color: SUCCESS },
        { label: 'Total IVA', value: this.fmtCurrency(totalIva), color: WARNING },
        { label: 'Total General', value: this.fmtCurrency(totalGeneral), color: PRIMARY }
      ];

      cards.forEach((card, i) => {
        const x = marginL + i * (cardW + 4);
        // Fondo
        doc.setFillColor(...card.color);
        doc.roundedRect(x, y, cardW, cardH, 2, 2, 'F');
        // Etiqueta
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(255);
        doc.text(card.label, x + cardW / 2, y + 5, { align: 'center' });
        // Valor
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(card.value, x + cardW / 2, y + 12, { align: 'center' });
      });

      y += cardH + 6;

      // ═══════════════════════════════════════════
      // SECCIÓN 2 — TABLA RESUMEN DE FACTURAS
      // ═══════════════════════════════════════════
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...PRIMARY);
      doc.text('LISTADO DE FACTURAS', marginL, y);
      y += 2;

      const summaryData = allBillings.map((b, idx) => {
        const payments = (b.payments || [])
          .map(p => `${this.formatPaymentMethod(p.method)}: ${this.fmtCurrency(p.amount)}`)
          .join('\n');
        const paymentDisplay = payments || (b.paymentMethods?.map(m => this.formatPaymentMethod(m)).join(', ') || 'N/A');
        return [
          String(idx + 1),
          b.billNumber || '-',
          this.fmtDateShort(b.dateTimeRecord),
          b.client?.fullName || 'N/A',
          b.saleType === 'CONTADO' ? 'Contado' : (b.saleType === 'CREDITO' ? 'Crédito' : 'N/A'),
          paymentDisplay,
          this.fmtCurrency(b.subTotalSale || 0),
          this.fmtCurrency(b.totalIVAT || 0),
          this.fmtCurrency((b.subTotalSale || 0) + (b.totalIVAT || 0))
        ];
      });

      autoTable(doc, {
        startY: y,
        head: [['#', 'No. Factura', 'Fecha', 'Cliente', 'Tipo', 'Medio de Pago', 'Subtotal', 'IVA', 'Total']],
        body: summaryData,
        styles: { fontSize: 7, cellPadding: 2, valign: 'middle', overflow: 'linebreak' },
        headStyles: { fillColor: PRIMARY, textColor: 255, fontStyle: 'bold', fontSize: 7 },
        columnStyles: {
          0: { cellWidth: 8, halign: 'center' },
          1: { cellWidth: 22 },
          2: { cellWidth: 22, halign: 'center' },
          3: { cellWidth: 45 },
          4: { cellWidth: 18, halign: 'center' },
          5: { cellWidth: 48 },
          6: { cellWidth: 28, halign: 'right' },
          7: { cellWidth: 22, halign: 'right' },
          8: { cellWidth: 28, halign: 'right', fontStyle: 'bold' }
        },
        alternateRowStyles: { fillColor: LIGHT_BG },
        foot: [[
          '', '', '', '', '',
          'TOTALES:',
          this.fmtCurrency(totalVentas),
          this.fmtCurrency(totalIva),
          this.fmtCurrency(totalGeneral)
        ]],
        footStyles: { fillColor: PRIMARY, textColor: 255, fontStyle: 'bold', fontSize: 8 },
        rowPageBreak: 'avoid',
        margin: { left: marginL, right: marginR }
      });

      y = (doc as any).lastAutoTable.finalY + 6;

      // ═══════════════════════════════════════════
      // SECCIÓN 3 — TOTALES POR MÉTODO DE PAGO
      // ═══════════════════════════════════════════
      const paymentTotals: Record<string, { count: number; total: number }> = {};
      allBillings.forEach(b => {
        if (b.payments && b.payments.length > 0) {
          b.payments.forEach(p => {
            if (!paymentTotals[p.method]) paymentTotals[p.method] = { count: 0, total: 0 };
            paymentTotals[p.method].count++;
            paymentTotals[p.method].total += p.amount;
          });
        } else if (b.paymentMethods && b.paymentMethods.length > 0) {
          const invoiceTotal = (b.subTotalSale || 0) + (b.totalIVAT || 0);
          const methodCount = b.paymentMethods.length;
          b.paymentMethods.forEach(method => {
            if (!paymentTotals[method]) paymentTotals[method] = { count: 0, total: 0 };
            paymentTotals[method].count++;
            paymentTotals[method].total += invoiceTotal / methodCount;
          });
        }
      });

      // Totales por tipo de venta
      const contadoTotal = allBillings
        .filter(b => b.saleType === 'CONTADO')
        .reduce((s, b) => s + (b.subTotalSale || 0) + (b.totalIVAT || 0), 0);
      const creditoTotal = allBillings
        .filter(b => b.saleType === 'CREDITO')
        .reduce((s, b) => s + (b.subTotalSale || 0) + (b.totalIVAT || 0), 0);

      // Verificar si cabe en la página actual
      if (y + 50 > pageH - 20) {
        doc.addPage();
        y = 15;
      }

      // Sub-tabla: Por método de pago
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...PRIMARY);
      doc.text('RESUMEN POR MÉTODO DE PAGO', marginL, y);
      y += 2;

      const paymentRows = Object.entries(paymentTotals).map(([method, data]) => [
        this.formatPaymentMethod(method),
        String(data.count),
        this.fmtCurrency(data.total)
      ]);
      const paymentGrandTotal = Object.values(paymentTotals).reduce((s, d) => s + d.total, 0);

      const paymentTableStartY = y;

      autoTable(doc, {
        startY: y,
        head: [['Método de Pago', 'Transacciones', 'Total']],
        body: paymentRows,
        foot: [['TOTAL', '', this.fmtCurrency(paymentGrandTotal)]],
        styles: { fontSize: 8, cellPadding: 2.5 },
        headStyles: { fillColor: ACCENT, textColor: 255, fontStyle: 'bold' },
        footStyles: { fillColor: ACCENT, textColor: 255, fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 50 },
          1: { cellWidth: 30, halign: 'center' },
          2: { cellWidth: 40, halign: 'right' }
        },
        tableWidth: 120,
        margin: { left: marginL }
      });

      const paymentTableFinalY = (doc as any).lastAutoTable.finalY;

      // Sub-tabla: Por tipo de venta (al lado)
      const saleTypeX = marginL + 130;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...PRIMARY);
      doc.text('RESUMEN POR TIPO DE VENTA', saleTypeX, paymentTableStartY - 2);

      autoTable(doc, {
        startY: paymentTableStartY,
        head: [['Tipo de Venta', 'Facturas', 'Total']],
        body: [
          ['Contado', String(totalContado), this.fmtCurrency(contadoTotal)],
          ['Crédito', String(totalCredito), this.fmtCurrency(creditoTotal)]
        ],
        foot: [['TOTAL', String(totalContado + totalCredito), this.fmtCurrency(contadoTotal + creditoTotal)]],
        styles: { fontSize: 8, cellPadding: 2.5 },
        headStyles: { fillColor: SUCCESS, textColor: 255, fontStyle: 'bold' },
        footStyles: { fillColor: SUCCESS, textColor: 255, fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 35 },
          1: { cellWidth: 22, halign: 'center' },
          2: { cellWidth: 40, halign: 'right' }
        },
        tableWidth: 97,
        margin: { left: saleTypeX }
      });

      const saleTypeTableFinalY = (doc as any).lastAutoTable.finalY;
      y = Math.max(paymentTableFinalY, saleTypeTableFinalY) + 8;

      // ═══════════════════════════════════════════
      // SECCIÓN 4 — DETALLE POR FACTURA (opcional)
      // ═══════════════════════════════════════════
      if (includeDetails) {
        allBillings.forEach((billing, bIdx) => {
          // Verificar espacio — cada detalle necesita al menos ~40mm
          if (y + 40 > pageH - 20) {
            doc.addPage();
            y = 15;
          }

          // Encabezado de factura
          doc.setFillColor(...ACCENT);
          doc.roundedRect(marginL, y, contentW, 8, 1.5, 1.5, 'F');
          doc.setFontSize(8);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(255);
          doc.text(
            `Factura ${billing.billNumber || 'S/N'}  |  ${this.fmtDateTime(billing.dateTimeRecord)}  |  Cliente: ${billing.client?.fullName || 'N/A'}  |  ${billing.saleType === 'CONTADO' ? 'Contado' : 'Crédito'}`,
            marginL + 3, y + 5.5
          );
          y += 11;

          // Detalle de pagos en línea
          if (billing.payments && billing.payments.length > 0) {
            const payLine = billing.payments
              .map(p => {
                let txt = `${this.formatPaymentMethod(p.method)}: ${this.fmtCurrency(p.amount)}`;
                if (p.reference) txt += ` (Ref: ${p.reference})`;
                return txt;
              }).join('  |  ');
            doc.setFontSize(7);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(80);
            doc.text(`Pagos: ${payLine}`, marginL + 3, y);
            if (billing.returnedValue && billing.returnedValue > 0) {
              doc.text(`  —  Vueltas: ${this.fmtCurrency(billing.returnedValue)}`, marginL + 3 + doc.getTextWidth(`Pagos: ${payLine}`) + 2, y);
            }
            y += 4;
          }

          // Tabla de productos
          const detailData = (billing.saleDetails || []).map((d, i) => [
            String(i + 1),
            d.product?.barcode || '-',
            d.product?.description || 'N/A',
            String(d.amount || 0),
            this.fmtCurrency(d.unitPrice || 0),
            this.fmtCurrency(d.subTotal || 0),
            this.fmtCurrency(d.totalVat || 0),
            this.fmtCurrency((d.subTotal || 0) + (d.totalVat || 0))
          ]);

          const invoiceSubtotal = billing.subTotalSale || 0;
          const invoiceIva = billing.totalIVAT || 0;
          const invoiceTotal = invoiceSubtotal + invoiceIva;

          autoTable(doc, {
            startY: y,
            head: [['#', 'Código', 'Producto', 'Cant.', 'P. Unit.', 'Subtotal', 'IVA', 'Total']],
            body: detailData,
            foot: [['', '', '', '', 'TOTALES:', this.fmtCurrency(invoiceSubtotal), this.fmtCurrency(invoiceIva), this.fmtCurrency(invoiceTotal)]],
            styles: { fontSize: 6.5, cellPadding: 1.5, valign: 'middle' },
            headStyles: { fillColor: [100, 100, 100], textColor: 255, fontStyle: 'bold', fontSize: 6.5 },
            footStyles: { fillColor: LIGHT_BG, textColor: PRIMARY, fontStyle: 'bold', fontSize: 7 },
            columnStyles: {
              0: { cellWidth: 7, halign: 'center' },
              1: { cellWidth: 25 },
              2: { cellWidth: 'auto' },
              3: { cellWidth: 14, halign: 'center' },
              4: { cellWidth: 25, halign: 'right' },
              5: { cellWidth: 25, halign: 'right' },
              6: { cellWidth: 20, halign: 'right' },
              7: { cellWidth: 25, halign: 'right', fontStyle: 'bold' }
            },
            alternateRowStyles: { fillColor: [252, 252, 252] },
            rowPageBreak: 'avoid',
            margin: { left: marginL + 2, right: marginR + 2 }
          });

          y = (doc as any).lastAutoTable.finalY + 5;
        });
      }

      // ═══════════════════════════════════════════
      // PIE DE PÁGINA — Números de página
      // ═══════════════════════════════════════════
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(150);
        doc.text(`Página ${i} de ${totalPages}`, pageW / 2, pageH - 7, { align: 'center' });
        doc.text('Concentrados La 28 — Reporte generado automáticamente', marginL, pageH - 7);
      }

      // ── Guardar ──
      const dateRange = filters.startDate && filters.endDate
        ? `${filters.startDate}_${filters.endDate}`
        : new Date().toISOString().split('T')[0];
      doc.save(`reporte_ventas_${dateRange}.pdf`);

      toast.success(`Reporte PDF generado (${totalFacturas} facturas)`);
    } catch (err) {
      console.error('Error generando PDF:', err);
      toast.error('Error al generar el reporte PDF');
    } finally {
      this.isGeneratingPdf = false;
    }
  }
}
