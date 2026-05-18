import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { FacturaService } from '../../../factura/factura.service';
import { PurchasesService } from '../../../compras/services/purchases.service';
import { ExpensesService } from '../../../expenses/expenses.service';
import { SupplierPaymentsService } from '../../../compras/services/supplier-payments.service';
import { ClientAccountService } from '../../../cuenta-cliente/services/client-account.service';
import { ClientCreditService } from '../../../cuenta-cliente/services/client-credit.service';
import { InternalTransferService } from '../../../traslados/services/internal-transfer.service';
import { Billing, BillingReportFilter } from '../../../factura/billing';
import { Expense } from '../../../expenses/expense';
import { AccountPayment } from '../../../cuenta-cliente/models/client-account';
import { CreditTransaction, CreditTransactionType } from '../../../cuenta-cliente/models/client-credit';
import { InternalTransfer } from '../../../traslados/models/internal-transfer.model';
import { toast } from 'ngx-sonner';
import { formatInTimeZone } from 'date-fns-tz';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ReportChartModalComponent, ChartConfig } from '../../components/report-chart-modal/report-chart-modal.component';

type FlowType = 'INGRESO' | 'EGRESO';

interface CashFlowRow {
  date: string;
  flowType: FlowType;
  generalCategory: string;  // Grupo general: Ventas, Cobros Crédito, Anticipos, Gastos, Compras, Pagos Proveedor, Traslados
  category: string;         // Subcategoría específica
  subcategory: string;
  description: string;
  reference: string;
  paymentMethod: string;
  bankAccount: string;
  amount: number;
  clientName?: string;
}

interface SummaryGroup {
  generalCategory: string;
  flowType: FlowType;
  total: number;
  count: number;
  icon: string;
  expanded: boolean;
  searchText: string;
  items: CashFlowRow[];
  filteredItems: CashFlowRow[];
}

interface CashFlowCategoryTotal {
  category: string;
  flowType: FlowType;
  total: number;
  count: number;
}

interface CashFlowMethodTotal {
  method: string;
  totalIngresos: number;
  totalEgresos: number;
}

interface CashFlowSummary {
  totalIngresos: number;
  totalEgresos: number;
  netFlow: number;
  ingresosCount: number;
  egresosCount: number;
  byCategory: CashFlowCategoryTotal[];
  byPaymentMethod: CashFlowMethodTotal[];
}

@Component({
  selector: 'app-cash-flow-report',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, ReportChartModalComponent],
  templateUrl: './cash-flow-report.component.html',
  styleUrls: ['./cash-flow-report.component.css']
})
export class CashFlowReportComponent implements OnInit {
  private facturaService = inject(FacturaService);
  private purchasesService = inject(PurchasesService);
  private expensesService = inject(ExpensesService);
  private supplierPaymentsService = inject(SupplierPaymentsService);
  private accountService = inject(ClientAccountService);
  private creditService = inject(ClientCreditService);
  private transferService = inject(InternalTransferService);

  // Filtros
  fromDate = '';
  toDate = '';
  selectedFlowType = '';
  selectedCategory = '';
  selectedPaymentMethod = '';
  searchText = '';

  // Datos
  rows: CashFlowRow[] = [];
  filteredRows: CashFlowRow[] = [];
  summary: CashFlowSummary = {
    totalIngresos: 0, totalEgresos: 0, netFlow: 0,
    ingresosCount: 0, egresosCount: 0,
    byCategory: [], byPaymentMethod: []
  };
  categories: string[] = [];
  paymentMethods: string[] = [];
  isLoading = false;
  hasLoaded = false;
  isGeneratingPdf = false;
  activeView: 'table' | 'summary' = 'table';

  // Resumen agrupado
  summaryGroups: SummaryGroup[] = [];

  // Gráficos
  showChart = false;
  chartConfigs: ChartConfig[] = [];

  // Paginación
  pageSize = 50;
  currentPage = 1;

  // Ordenamiento
  sortColumn = '';
  sortDirection: 'asc' | 'desc' = 'desc';

  ngOnInit(): void {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    this.fromDate = this.formatDate(firstDay);
    this.toDate = this.formatDate(today);
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

    forkJoin({
      sales: this.facturaService.findAllBilling(salesFilter).pipe(catchError(() => of([] as Billing[]))),
      purchases: this.purchasesService.list({ fromDate: this.fromDate, toDate: this.toDate }).pipe(catchError(() => of([] as any[]))),
      expenses: this.expensesService.list({ fromDate: this.fromDate, toDate: this.toDate }).pipe(catchError(() => of([] as Expense[]))),
      supplierPayments: this.supplierPaymentsService.list({ from: this.fromDate, to: this.toDate }).pipe(catchError(() => of([] as any[]))),
      transfers: this.transferService.list({ fromDate: this.fromDate, toDate: this.toDate }).pipe(catchError(() => of([] as InternalTransfer[])))
    }).subscribe({
      next: (data) => {
        this.buildCashFlowRows({
          ...data,
          accountPayments: [] as AccountPayment[],
          creditTransactions: [] as CreditTransaction[]
        });
        this.isLoading = false;
      },
      error: () => {
        toast.error('Error al cargar el reporte');
        this.isLoading = false;
      }
    });
  }

  private buildCashFlowRows(data: {
    sales: Billing[];
    purchases: any[];
    expenses: Expense[];
    supplierPayments: any[];
    accountPayments: AccountPayment[];
    creditTransactions: CreditTransaction[];
    transfers: InternalTransfer[];
  }): void {
    const rows: CashFlowRow[] = [];
    const { sales, purchases, expenses, supplierPayments, accountPayments, creditTransactions, transfers } = data;

    // =================== INGRESOS ===================

    // 1. Ventas de contado → Ingreso real de caja
    sales.filter(b => b.saleType === 'CONTADO' || !b.saleType).forEach(billing => {
      const totalAmount = billing.totalBilling || 0;
      if (totalAmount <= 0) return;
      const clientName = billing.client?.fullName || billing.client?.name || 'Consumidor Final';

      if (billing.payments && billing.payments.length > 0) {
        billing.payments.forEach(payment => {
          if (payment.amount <= 0) return;
          rows.push({
            date: billing.dateTimeRecord,
            flowType: 'INGRESO',
            generalCategory: 'Ventas de Contado',
            category: this.getPaymentMethodLabel(payment.method),
            subcategory: this.getPaymentMethodLabel(payment.method),
            description: `Factura ${billing.billNumber} - ${clientName}`,
            reference: billing.billNumber,
            paymentMethod: payment.method || 'EFECTIVO',
            bankAccount: payment.bankAccountName || '',
            amount: payment.amount,
            clientName
          });
        });
      } else {
        rows.push({
          date: billing.dateTimeRecord,
          flowType: 'INGRESO',
          generalCategory: 'Ventas de Contado',
          category: 'Efectivo',
          subcategory: 'Efectivo',
          description: `Factura ${billing.billNumber} - ${clientName}`,
          reference: billing.billNumber,
          paymentMethod: billing.paymentMethods?.[0] || 'EFECTIVO',
          bankAccount: '',
          amount: totalAmount,
          clientName
        });
      }
    });

    // 2. Cobros de crédito → Ingreso real (pagos de clientes a cuentas por cobrar)
    // Excluir pagos con SALDO_FAVOR porque no son ingreso de caja nuevo
    (accountPayments || []).forEach(payment => {
      if (payment.amount <= 0) return;
      if (payment.paymentMethod === 'SALDO_FAVOR') return;
      rows.push({
        date: payment.paymentDate || payment.createdAt || '',
        flowType: 'INGRESO',
        generalCategory: 'Cobros de Crédito',
        category: this.getPaymentMethodLabel(payment.paymentMethod),
        subcategory: this.getPaymentMethodLabel(payment.paymentMethod),
        description: `Abono a cuenta${payment.notes ? ' - ' + payment.notes : ''}`,
        reference: payment.reference || payment.id || '',
        paymentMethod: payment.paymentMethod || '',
        bankAccount: payment.bankAccountName || '',
        amount: payment.amount
      });
    });

    // 3. Anticipos recibidos → Ingreso real (depósitos de clientes)
    (creditTransactions || []).filter(t => t.type === CreditTransactionType.DEPOSIT).forEach(tx => {
      if (tx.amount <= 0) return;
      rows.push({
        date: tx.transactionDate || tx.createdAt || '',
        flowType: 'INGRESO',
        generalCategory: 'Anticipos Recibidos',
        category: this.getPaymentMethodLabel(tx.paymentMethod || ''),
        subcategory: this.getPaymentMethodLabel(tx.paymentMethod || ''),
        description: `Anticipo de cliente${tx.notes ? ' - ' + tx.notes : ''}`,
        reference: tx.reference || tx.id || '',
        paymentMethod: tx.paymentMethod || '',
        bankAccount: tx.bankAccountName || '',
        amount: tx.amount
      });
    });

    // =================== EGRESOS ===================

    // 4. Compras de contado → Egreso inmediato
    const purchaseIdsPaidViaPayments = new Set<string>();
    (supplierPayments || []).forEach((sp: any) => {
      if (sp.linkedPurchaseId) purchaseIdsPaidViaPayments.add(sp.linkedPurchaseId);
    });

    (purchases || []).forEach((purchase: any) => {
      const totalAmount = purchase.total || 0;
      if (totalAmount <= 0) return;
      const supplierName = purchase.supplier?.name || purchase.supplierName || 'Proveedor';
      const invoiceNum = purchase.invoiceNumber || '';

      if (purchase.paymentType === 'CREDITO') return;
      if (purchase.id && purchaseIdsPaidViaPayments.has(purchase.id)) return;

      rows.push({
        date: purchase.emissionDate || purchase.createdAt || '',
        flowType: 'EGRESO',
        generalCategory: 'Compras de Contado',
        category: supplierName,
        subcategory: supplierName,
        description: `Compra ${invoiceNum} - ${supplierName}`,
        reference: invoiceNum || purchase.id || '',
        paymentMethod: '',
        bankAccount: '',
        amount: totalAmount
      });
    });

    // 5. Gastos operativos
    (expenses || []).forEach(expense => {
      if (expense.amount <= 0) return;
      rows.push({
        date: expense.dateTimeRecord,
        flowType: 'EGRESO',
        generalCategory: 'Gastos Operativos',
        category: expense.category || 'General',
        subcategory: expense.category || 'General',
        description: expense.description || 'Gasto operativo',
        reference: expense.reference || '',
        paymentMethod: expense.paymentMethod || '',
        bankAccount: expense.bankAccountName || '',
        amount: expense.amount
      });
    });

    // 6. Pagos a proveedores → Egreso real
    (supplierPayments || []).forEach((payment: any) => {
      const amount = payment.amount || 0;
      if (amount <= 0) return;
      rows.push({
        date: payment.paymentDate || '',
        flowType: 'EGRESO',
        generalCategory: 'Pagos a Proveedores',
        category: payment.supplierName || 'Proveedor',
        subcategory: payment.supplierName || 'Proveedor',
        description: `Pago a ${payment.supplierName || 'proveedor'}${payment.reference ? ' - Ref: ' + payment.reference : ''}`,
        reference: payment.reference || payment.id || '',
        paymentMethod: payment.method || '',
        bankAccount: payment.bankAccountName || '',
        amount: amount
      });
    });

    // 7. Devoluciones de anticipo → Egreso (devolución de dinero al cliente)
    (creditTransactions || []).filter(t => t.type === CreditTransactionType.REFUND).forEach(tx => {
      if (tx.amount <= 0) return;
      rows.push({
        date: tx.transactionDate || tx.createdAt || '',
        flowType: 'EGRESO',
        generalCategory: 'Devoluciones de Anticipo',
        category: this.getPaymentMethodLabel(tx.paymentMethod || ''),
        subcategory: this.getPaymentMethodLabel(tx.paymentMethod || ''),
        description: `Devolución de anticipo${tx.notes ? ' - ' + tx.notes : ''}`,
        reference: tx.reference || tx.id || '',
        paymentMethod: tx.paymentMethod || '',
        bankAccount: tx.bankAccountName || '',
        amount: tx.amount
      });
    });

    // 8. Traslados a banco → Egreso de caja (dinero sale de caja física a banco)
    (transfers || []).filter(t => t.status === 'ACTIVO').forEach(transfer => {
      if (transfer.amount <= 0) return;
      rows.push({
        date: transfer.transferDate || transfer.createdAt || '',
        flowType: 'EGRESO',
        generalCategory: 'Traslados a Banco',
        category: transfer.destinationBankName || 'Banco',
        subcategory: `${transfer.destinationBankName || 'Banco'} - ${transfer.destinationAccountNumber || ''}`,
        description: `Traslado a ${transfer.destinationBankName || 'banco'}${transfer.reference ? ' - Ref: ' + transfer.reference : ''}`,
        reference: transfer.reference || transfer.id || '',
        paymentMethod: 'TRANSFERENCIA',
        bankAccount: `${transfer.destinationBankName || ''} ${transfer.destinationAccountNumber || ''}`.trim(),
        amount: transfer.amount
      });
    });

    // Ordenar por fecha desc
    rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    this.rows = rows;

    // Extraer filtros
    this.categories = [...new Set(rows.map(r => r.generalCategory))].sort();
    this.paymentMethods = [...new Set(rows.map(r => r.paymentMethod).filter(Boolean))].sort();

    this.applyFilters();
  }

  applyFilters(): void {
    let filtered = [...this.rows];

    if (this.selectedFlowType) {
      filtered = filtered.filter(r => r.flowType === this.selectedFlowType);
    }
    if (this.selectedCategory) {
      filtered = filtered.filter(r => r.generalCategory === this.selectedCategory);
    }
    if (this.selectedPaymentMethod) {
      filtered = filtered.filter(r => r.paymentMethod === this.selectedPaymentMethod);
    }
    if (this.searchText.trim()) {
      const q = this.searchText.toLowerCase();
      filtered = filtered.filter(r =>
        r.description.toLowerCase().includes(q) ||
        r.reference.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        r.generalCategory.toLowerCase().includes(q) ||
        (r.clientName || '').toLowerCase().includes(q)
      );
    }

    this.filteredRows = filtered;
    this.currentPage = 1;
    this.calculateSummary();
    this.buildSummaryGroups();
  }

  private calculateSummary(): void {
    const data = this.filteredRows;
    const ingresos = data.filter(r => r.flowType === 'INGRESO');
    const egresos = data.filter(r => r.flowType === 'EGRESO');

    const totalIngresos = ingresos.reduce((s, r) => s + r.amount, 0);
    const totalEgresos = egresos.reduce((s, r) => s + r.amount, 0);

    // By generalCategory
    const catMap = new Map<string, CashFlowCategoryTotal>();
    data.forEach(r => {
      const key = `${r.flowType}-${r.generalCategory}`;
      const existing = catMap.get(key);
      if (existing) {
        existing.total += r.amount;
        existing.count++;
      } else {
        catMap.set(key, { category: r.generalCategory, flowType: r.flowType, total: r.amount, count: 1 });
      }
    });

    // By payment method
    const methodMap = new Map<string, CashFlowMethodTotal>();
    data.forEach(r => {
      const method = r.paymentMethod || 'Sin método';
      const existing = methodMap.get(method);
      if (existing) {
        if (r.flowType === 'INGRESO') existing.totalIngresos += r.amount;
        else existing.totalEgresos += r.amount;
      } else {
        methodMap.set(method, {
          method,
          totalIngresos: r.flowType === 'INGRESO' ? r.amount : 0,
          totalEgresos: r.flowType === 'EGRESO' ? r.amount : 0
        });
      }
    });

    this.summary = {
      totalIngresos,
      totalEgresos,
      netFlow: totalIngresos - totalEgresos,
      ingresosCount: ingresos.length,
      egresosCount: egresos.length,
      byCategory: [...catMap.values()].sort((a, b) => b.total - a.total),
      byPaymentMethod: [...methodMap.values()].sort((a, b) => (b.totalIngresos + b.totalEgresos) - (a.totalIngresos + a.totalEgresos))
    };
  }

  private buildSummaryGroups(): void {
    const iconMap: Record<string, string> = {
      'Ventas de Contado': 'bi-cart-check',
      'Cobros de Crédito': 'bi-credit-card-2-front',
      'Anticipos Recibidos': 'bi-piggy-bank',
      'Compras de Contado': 'bi-bag',
      'Gastos Operativos': 'bi-receipt',
      'Pagos a Proveedores': 'bi-truck',
      'Devoluciones de Anticipo': 'bi-arrow-return-left',
      'Traslados a Banco': 'bi-bank'
    };

    // Orden deseado: primero ingresos, luego egresos
    const order = [
      'Ventas de Contado', 'Cobros de Crédito', 'Anticipos Recibidos',
      'Compras de Contado', 'Gastos Operativos', 'Pagos a Proveedores',
      'Devoluciones de Anticipo', 'Traslados a Banco'
    ];

    const groupMap = new Map<string, SummaryGroup>();

    this.filteredRows.forEach(r => {
      let group = groupMap.get(r.generalCategory);
      if (!group) {
        group = {
          generalCategory: r.generalCategory,
          flowType: r.flowType,
          total: 0,
          count: 0,
          icon: iconMap[r.generalCategory] || 'bi-folder',
          expanded: false,
          searchText: '',
          items: [],
          filteredItems: []
        };
        groupMap.set(r.generalCategory, group);
      }
      group.total += r.amount;
      group.count++;
      group.items.push(r);
    });

    // Aplicar orden predefinido
    this.summaryGroups = order
      .filter(cat => groupMap.has(cat))
      .map(cat => {
        const g = groupMap.get(cat)!;
        g.filteredItems = [...g.items];
        return g;
      });

    // Agregar cualquier grupo que no esté en el orden predefinido
    groupMap.forEach((g, key) => {
      if (!order.includes(key)) {
        g.filteredItems = [...g.items];
        this.summaryGroups.push(g);
      }
    });
  }

  toggleGroup(group: SummaryGroup): void {
    group.expanded = !group.expanded;
    if (group.expanded) {
      group.searchText = '';
      group.filteredItems = [...group.items];
    }
  }

  filterGroupItems(group: SummaryGroup): void {
    if (!group.searchText.trim()) {
      group.filteredItems = [...group.items];
      return;
    }
    const q = group.searchText.toLowerCase();
    group.filteredItems = group.items.filter(r =>
      r.description.toLowerCase().includes(q) ||
      r.reference.toLowerCase().includes(q) ||
      r.category.toLowerCase().includes(q) ||
      (r.clientName || '').toLowerCase().includes(q) ||
      r.date?.split('T')[0]?.includes(q) ||
      this.getPaymentMethodLabel(r.paymentMethod).toLowerCase().includes(q) ||
      r.amount.toString().includes(q)
    );
  }

  clearFilters(): void {
    this.selectedFlowType = '';
    this.selectedCategory = '';
    this.selectedPaymentMethod = '';
    this.searchText = '';
    this.sortColumn = '';
    this.applyFilters();
  }

  getPaymentMethodLabel(method: string): string {
    const labels: Record<string, string> = {
      'EFECTIVO': 'Efectivo',
      'TRANSFERENCIA': 'Transferencia',
      'TARJETA_CREDITO': 'Tarjeta Crédito',
      'TARJETA_DEBITO': 'Tarjeta Débito',
      'CHEQUE': 'Cheque',
      'SALDO_FAVOR': 'Saldo a Favor',
      'CREDITO': 'Crédito',
    };
    return labels[method] || method || 'Sin método';
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
  get pagedRows(): CashFlowRow[] { return this.filteredRows.slice(this.startIndex, this.endIndex); }

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
      doc.text('Estado de Flujo de Caja', 10, 15);
      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text(`Periodo: ${this.fromDate} a ${this.toDate}`, 10, 21);
      doc.text(`Generado: ${new Date().toLocaleString('es-CO')}`, pageW - 10, 21, { align: 'right' });

      // Summary line
      doc.setFontSize(9);
      doc.setTextColor(0, 128, 0);
      doc.text(`Ingresos: ${this.formatCurrency(this.summary.totalIngresos)}`, 10, 28);
      doc.setTextColor(200, 0, 0);
      doc.text(`Egresos: ${this.formatCurrency(this.summary.totalEgresos)}`, 80, 28);
      doc.setTextColor(0, 0, 0);
      doc.text(`Flujo Neto: ${this.formatCurrency(this.summary.netFlow)}`, 150, 28);

      // Category summary table
      const catHead = [['Categoría', 'Tipo', 'Operaciones', 'Total']];
      const catBody = this.summary.byCategory.map(c => [
        c.category, c.flowType, c.count, this.formatNumber(c.total)
      ]);

      autoTable(doc, {
        startY: 33,
        head: catHead,
        body: catBody,
        theme: 'striped',
        headStyles: { fillColor: [70, 70, 70], fontSize: 8 },
        styles: { fontSize: 8, cellPadding: 1.5 },
        margin: { left: 10, right: pageW / 2 + 5 }
      });

      // Payment method summary
      const pmHead = [['Método de Pago', 'Ingresos', 'Egresos', 'Neto']];
      const pmBody = this.summary.byPaymentMethod.map(m => [
        this.getPaymentMethodLabel(m.method),
        this.formatNumber(m.totalIngresos),
        this.formatNumber(m.totalEgresos),
        this.formatNumber(m.totalIngresos - m.totalEgresos)
      ]);

      const catFinalY = (doc as any).lastAutoTable?.finalY || 60;
      autoTable(doc, {
        startY: 33,
        head: pmHead,
        body: pmBody,
        theme: 'striped',
        headStyles: { fillColor: [70, 70, 70], fontSize: 8 },
        styles: { fontSize: 8, cellPadding: 1.5 },
        margin: { left: pageW / 2 + 5, right: 10 }
      });

      // Detail table on new page
      doc.addPage();
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.text('Detalle de Movimientos', 10, 15);

      const head = [['#', 'Fecha', 'Tipo', 'Categoría', 'Descripción', 'Método', 'Monto']];
      const body = this.filteredRows.map((r, i) => [
        i + 1,
        r.date?.split('T')[0] || '',
        r.flowType,
        r.category?.substring(0, 20),
        r.description?.substring(0, 30),
        this.getPaymentMethodLabel(r.paymentMethod),
        (r.flowType === 'INGRESO' ? '+' : '-') + this.formatNumber(r.amount)
      ]);

      autoTable(doc, {
        startY: 20,
        head, body,
        theme: 'grid',
        headStyles: { fillColor: [33, 37, 41], fontSize: 7 },
        styles: { fontSize: 7, cellPadding: 1 },
        margin: { left: 10, right: 10 }
      });

      doc.save(`flujo_caja_${this.fromDate}_${this.toDate}.pdf`);
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

    // 1. Ingresos vs Egresos por día
    const byDate = new Map<string, { ingresos: number; egresos: number }>();
    data.forEach(r => {
      const date = r.date?.split('T')[0] || 'Sin fecha';
      const entry = byDate.get(date) || { ingresos: 0, egresos: 0 };
      if (r.flowType === 'INGRESO') entry.ingresos += r.amount;
      else entry.egresos += r.amount;
      byDate.set(date, entry);
    });
    const sortedDates = [...byDate.keys()].sort();

    const flowByDay: ChartConfig = {
      title: 'Ingresos vs Egresos por Día',
      labels: sortedDates,
      datasets: [
        { label: 'Ingresos', data: sortedDates.map(d => byDate.get(d)!.ingresos), backgroundColor: 'rgba(40, 167, 69, 0.6)', borderColor: 'rgba(40, 167, 69, 1)' },
        { label: 'Egresos', data: sortedDates.map(d => byDate.get(d)!.egresos), backgroundColor: 'rgba(220, 53, 69, 0.6)', borderColor: 'rgba(220, 53, 69, 1)' }
      ],
      chartType: 'bar'
    };

    // 2. Flujo neto acumulado (línea de tendencia)
    let cumulative = 0;
    const cumulativeData = sortedDates.map(d => {
      const e = byDate.get(d)!;
      cumulative += e.ingresos - e.egresos;
      return cumulative;
    });

    const cumulativeFlow: ChartConfig = {
      title: 'Flujo Neto Acumulado',
      labels: sortedDates,
      datasets: [{
        label: 'Flujo Acumulado',
        data: cumulativeData,
        borderColor: 'rgba(0, 123, 255, 1)',
        backgroundColor: 'rgba(0, 123, 255, 0.15)',
        fill: true,
        tension: 0.4
      }],
      chartType: 'line'
    };

    // 3. Distribución por categoría (ingresos)
    const ingresoCats = this.summary.byCategory.filter(c => c.flowType === 'INGRESO');
    const ingresoByCategory: ChartConfig = {
      title: 'Distribución de Ingresos por Categoría',
      labels: ingresoCats.map(c => c.category),
      datasets: [{ label: 'Monto', data: ingresoCats.map(c => c.total) }],
      chartType: 'pie'
    };

    // 4. Distribución por categoría (egresos)
    const egresoCats = this.summary.byCategory.filter(c => c.flowType === 'EGRESO');
    const egresoByCategory: ChartConfig = {
      title: 'Distribución de Egresos por Categoría',
      labels: egresoCats.map(c => c.category),
      datasets: [{ label: 'Monto', data: egresoCats.map(c => c.total) }],
      chartType: 'doughnut'
    };

    // 5. Ingresos vs Egresos por método de pago
    const methods = this.summary.byPaymentMethod;
    const flowByMethod: ChartConfig = {
      title: 'Flujo por Método de Pago',
      labels: methods.map(m => this.getPaymentMethodLabel(m.method)),
      datasets: [
        { label: 'Ingresos', data: methods.map(m => m.totalIngresos) },
        { label: 'Egresos', data: methods.map(m => m.totalEgresos) }
      ],
      chartType: 'bar'
    };

    this.chartConfigs = [flowByDay, cumulativeFlow, ingresoByCategory, egresoByCategory, flowByMethod];
  }
}
