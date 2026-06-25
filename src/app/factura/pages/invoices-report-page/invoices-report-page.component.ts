import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { toast } from 'ngx-sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import { FacturaService } from '../../factura.service';
import {
    Billing, BillingReportFilter, SalesTotals, PaymentEntry
} from '../../billing';
import { ClienteService } from '../../../cliente/cliente.service';
import { Client } from '../../../cliente/cliente';
import { Product } from '../../../producto/producto';
import { LoginUserService } from '../../../auth/login/loginUser.service';
import { ModalSaleDetailComponent } from '../../components/modal-sale-detail/modal-sale-detail.component';
import { ProductsSearchModalComponent } from '../../../producto/components/products-search-modal/products-search-modal.component';
import { ModalClientsListComponent } from '../../../cliente/components/modal-clients-list/modal-clients-list.component';
import { ModalUsersListComponent } from '../../../users/components/modal-users-list/modal-users-list.component';

@Component({
    selector: 'app-invoices-report-page',
    standalone: true,
    imports: [
        CommonModule, FormsModule, ReactiveFormsModule, CurrencyPipe,
        ModalSaleDetailComponent, ProductsSearchModalComponent,
        ModalClientsListComponent, ModalUsersListComponent
    ],
    templateUrl: './invoices-report-page.component.html',
    styleUrl: './invoices-report-page.component.css'
})
export class InvoicesReportPageComponent implements OnInit {

    @ViewChild('productsModal') productsModal?: any;

    private fb            = inject(FormBuilder);
    private facturaService = inject(FacturaService);
    private clientService  = inject(ClienteService);
    private loginService   = inject(LoginUserService);

    // ─── Estado ──────────────────────────────────────────────────
    allResults:     Billing[] = [];
    filteredBilling: Billing[] = [];
    isLoading       = false;
    isGeneratingPdf = false;
    today           = '';

    selectedBilling: Billing | null = null;
    expandedBillingId: string | null = null;

    // ─── Filtro de preventa ───────────────────────────────────────
    preSaleFilter: 'ALL' | 'WITH' | 'WITHOUT' = 'ALL';

    // ─── Paginación ───────────────────────────────────────────────
    Math        = Math;
    currentPage = 0;
    pageSize    = 20;
    totalPages  = 0;
    isFirstPage = true;
    isLastPage  = false;

    // ─── Totales ──────────────────────────────────────────────────
    salesTotals: SalesTotals | null = null;

    // ─── Cliente autocomplete ─────────────────────────────────────
    clients: Client[] = [];
    filteredClients: Client[] = [];
    clientSearchText = '';
    showClientDropdown = false;
    selectedClient: Client | null = null;

    // ─── Producto ─────────────────────────────────────────────────
    selectedProduct: Product | null = null;

    // ─── Formulario de filtros ────────────────────────────────────
    filterForm: FormGroup = this.fb.group({
        startDate:     [''],
        endDate:       [''],
        billNumber:    [''],
        saleType:      [''],
        paymentMethod: [''],
        productSearch: [''],
    });

    // ─── Lifecycle ────────────────────────────────────────────────

    ngOnInit(): void {
        this.today = new Date().toISOString().split('T')[0];
        this.filterForm.patchValue({ startDate: this.today, endDate: this.today });
        this.clientService.getAll().subscribe(c => {
            this.clients = c;
            this.filteredClients = c;
        });
        this.load();
    }

    // ─── Carga de datos ───────────────────────────────────────────

    load(): void {
        this.isLoading = true;
        const filter = this.buildFilter();
        this.facturaService.findAllBilling(filter).subscribe({
            next: billings => {
                this.allResults = billings.sort((a, b) =>
                    new Date(b.dateTimeRecord || 0).getTime() - new Date(a.dateTimeRecord || 0).getTime()
                );
                this.currentPage = 0;
                this.computeTotals(this.allResults);
                this.paginate();
                this.isLoading = false;
                if (!billings.length) toast.info('No se encontraron facturas con los criterios indicados.');
            },
            error: () => { toast.error('Error al cargar facturas'); this.isLoading = false; }
        });
    }

    applyFilters(): void {
        this.currentPage = 0;
        this.load();
    }

    private buildFilter(): BillingReportFilter {
        const f = this.filterForm.value;
        const filter = new BillingReportFilter();
        filter.fromDate      = f.startDate    || '';
        filter.toDate        = f.endDate      || '';
        filter.billNumber    = f.billNumber   || '';
        filter.client        = this.selectedClient?.id || '';
        filter.product       = this.selectedProduct?.id || '';
        filter.saleType      = f.saleType     || '';
        filter.paymentMethod = f.paymentMethod || '';
        filter.hasPreSale    = this.preSaleFilter === 'ALL' ? null
                             : this.preSaleFilter === 'WITH';
        return filter;
    }

    // ─── Paginación ───────────────────────────────────────────────

    private paginate(): void {
        this.totalPages = Math.ceil(this.allResults.length / this.pageSize);
        if (this.currentPage >= this.totalPages && this.totalPages > 0) this.currentPage = this.totalPages - 1;
        const start = this.currentPage * this.pageSize;
        this.filteredBilling = this.allResults.slice(start, start + this.pageSize);
        this.isFirstPage = this.currentPage === 0;
        this.isLastPage  = this.currentPage >= this.totalPages - 1;
    }

    goToPage(p: number): void { if (p >= 0 && p < this.totalPages) { this.currentPage = p; this.paginate(); } }
    nextPage(): void  { if (!this.isLastPage)  this.goToPage(this.currentPage + 1); }
    prevPage(): void  { if (!this.isFirstPage) this.goToPage(this.currentPage - 1); }

    get visiblePages(): number[] {
        const max = 5, pages: number[] = [];
        let start = Math.max(0, this.currentPage - Math.floor(max / 2));
        let end   = Math.min(this.totalPages, start + max);
        if (end - start < max) start = Math.max(0, end - max);
        for (let i = start; i < end; i++) pages.push(i);
        return pages;
    }

    onPageSizeChange(): void { this.currentPage = 0; this.paginate(); }

    get countWithPreSale():    number { return this.allResults.filter(b => b.preSaleNumber).length; }
    get countWithoutPreSale(): number { return this.allResults.filter(b => !b.preSaleNumber).length; }

    // ─── Totales ──────────────────────────────────────────────────

    private computeTotals(billings: Billing[]): void {
        const pmMap: Record<string, { method: string; count: number; total: number }> = {};
        billings.forEach(b => {
            const inv = (b.subTotalSale || 0) + (b.totalIVAT || 0);
            if (b.payments?.length) {
                const paid = b.payments.reduce((s, p) => s + p.amount, 0);
                b.payments.forEach(p => {
                    if (!pmMap[p.method]) pmMap[p.method] = { method: p.method, count: 0, total: 0 };
                    pmMap[p.method].count++;
                    pmMap[p.method].total += paid > 0 ? (p.amount / paid) * inv : 0;
                });
            } else {
                const mc = b.paymentMethods?.length || 1;
                b.paymentMethods?.forEach(m => {
                    if (!pmMap[m]) pmMap[m] = { method: m, count: 0, total: 0 };
                    pmMap[m].count++; pmMap[m].total += inv / mc;
                });
            }
        });
        this.salesTotals = {
            totalInvoices: billings.length,
            totalSubtotal: billings.reduce((s, b) => s + (b.subTotalSale || 0), 0),
            totalIva:      billings.reduce((s, b) => s + (b.totalIVAT || 0), 0),
            totalGeneral:  billings.reduce((s, b) => s + (b.subTotalSale || 0) + (b.totalIVAT || 0), 0),
            countContado:  billings.filter(b => b.saleType === 'CONTADO').length,
            countCredito:  billings.filter(b => b.saleType === 'CREDITO').length,
            totalContado:  billings.filter(b => b.saleType === 'CONTADO').reduce((s, b) => s + (b.subTotalSale || 0) + (b.totalIVAT || 0), 0),
            totalCredito:  billings.filter(b => b.saleType === 'CREDITO').reduce((s, b) => s + (b.subTotalSale || 0) + (b.totalIVAT || 0), 0),
            paymentMethodTotals: Object.values(pmMap)
        };
    }

    // ─── Helpers de UI ────────────────────────────────────────────

    formatDate(d: string | Date): string {
        return new Intl.DateTimeFormat('es-CO', { day:'2-digit', month:'2-digit', year:'numeric', timeZone:'America/Bogota' }).format(new Date(d));
    }

    formatTime(d: string | Date): string {
        return new Intl.DateTimeFormat('es-CO', { hour:'2-digit', minute:'2-digit', hour12:true, timeZone:'America/Bogota' }).format(new Date(d));
    }

    toggleDetails(id: string): void {
        this.expandedBillingId = this.expandedBillingId === id ? null : id;
    }

    openDetail(b: Billing): void {
        this.selectedBilling = b;
        const m = document.getElementById('modalSaleDetail');
        if (m) { m.classList.add('show'); m.style.display = 'block'; }
    }

    getPaymentBadgeClass(method: string): string {
        const map: Record<string, string> = {
            EFECTIVO: 'bg-success', TRANSFERENCIA: 'badge-transferencia',
            TARJETA_CREDITO: 'bg-info', TARJETA_DEBITO: 'bg-info',
            CHEQUE: 'bg-warning text-dark', SALDO_FAVOR: 'bg-info text-white'
        };
        return map[method] ?? 'bg-secondary';
    }

    formatPaymentMethod(m: string): string {
        const map: Record<string, string> = {
            EFECTIVO: 'Efectivo', TRANSFERENCIA: 'Transferencia',
            TARJETA_CREDITO: 'T. Crédito', TARJETA_DEBITO: 'T. Débito',
            CHEQUE: 'Cheque', SALDO_A_FAVOR: 'Saldo a Favor'
        };
        return map[m] ?? m;
    }

    // ─── Cliente autocomplete ─────────────────────────────────────

    filterClients(q: string): void {
        this.clientSearchText = q;
        if (!q.trim()) { this.filteredClients = this.clients; this.showClientDropdown = false; return; }
        const lq = q.toLowerCase();
        this.filteredClients = this.clients.filter(c =>
            (c.name || '').toLowerCase().includes(lq) ||
            (c.surname || '').toLowerCase().includes(lq) ||
            (c.businessName || '').toLowerCase().includes(lq) ||
            (c.idNumber || '').toLowerCase().includes(lq));
        this.showClientDropdown = this.filteredClients.length > 0;
    }

    selectClient(c: Client): void {
        this.selectedClient = c; this.clientSearchText = this.clientName(c); this.showClientDropdown = false;
    }

    clearClient(): void {
        this.selectedClient = null; this.clientSearchText = ''; this.filteredClients = this.clients;
    }

    clientName(c: Client): string {
        return c.name?.trim() ? `${c.name} ${c.surname || ''}`.trim()
             : c.businessName?.trim() ? c.businessName
             : c.nickname?.trim() ? c.nickname : 'Sin nombre';
    }

    // ─── Producto ─────────────────────────────────────────────────

    onProductSelected(p: Product): void {
        this.selectedProduct = p;
        this.filterForm.patchValue({ productSearch: `${p.description} - ${p.barcode}` });
    }

    clearProduct(): void { this.selectedProduct = null; this.filterForm.patchValue({ productSearch: '' }); }

    // ─── Limpiar filtros ──────────────────────────────────────────

    clearFilters(): void {
        this.selectedClient  = null;
        this.selectedProduct = null;
        this.clientSearchText = '';
        this.preSaleFilter   = 'ALL';
        this.filteredClients = this.clients;
        this.filterForm.reset({ startDate: this.today, endDate: this.today });
        this.currentPage = 0;
        this.load();
    }

    // ─── PDF ──────────────────────────────────────────────────────

    private fmt(v: number): string {
        return new Intl.NumberFormat('es-CO', { style:'currency', currency:'COP', minimumFractionDigits:0 }).format(v);
    }
    private fmtDate(d: string | Date): string {
        return new Intl.DateTimeFormat('es-CO', { day:'2-digit', month:'2-digit', year:'numeric' }).format(new Date(d));
    }
    private fmtDateTime(d: string | Date): string {
        return new Intl.DateTimeFormat('es-CO', {
            day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', hour12: true
        }).format(new Date(d));
    }

    generatePdf(includeDetails = true): void {
        if (!this.allResults.length) { toast.warning('No hay facturas para exportar.'); return; }
        this.isGeneratingPdf = true;
        try {
            const billings = this.allResults;
            const doc = new jsPDF('landscape', 'mm', 'letter');
            const W = doc.internal.pageSize.getWidth();
            const H = doc.internal.pageSize.getHeight();
            const ML = 10, MR = 10, CW = W - ML - MR;

            const PRIMARY:   [number,number,number] = [33,37,41];
            const ACCENT:    [number,number,number] = [13,110,253];
            const SUCCESS:   [number,number,number] = [25,135,84];
            const WARNING:   [number,number,number] = [255,193,7];
            const PRESALE:   [number,number,number] = [111,66,193];
            const LIGHT_BG:  [number,number,number] = [248,249,250];

            let y = 12;
            doc.setFontSize(18); doc.setFont('helvetica','bold'); doc.setTextColor(...PRIMARY);
            doc.text('REPORTE DE FACTURAS DE VENTA', W / 2, y, { align: 'center' });
            y += 8;
            doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor(100);
            doc.text(`Generado: ${this.fmtDateTime(new Date())}`, W / 2, y, { align: 'center' });

            // Filtros aplicados
            y += 6;
            const f = this.filterForm.value;
            const parts: string[] = [];
            if (f.startDate)       parts.push(`Desde: ${f.startDate}`);
            if (f.endDate)         parts.push(`Hasta: ${f.endDate}`);
            if (this.selectedClient) parts.push(`Cliente: ${this.clientName(this.selectedClient)}`);
            if (this.selectedProduct) parts.push(`Producto: ${this.selectedProduct.description}`);
            if (f.saleType)        parts.push(`Tipo: ${f.saleType}`);
            if (this.preSaleFilter !== 'ALL') parts.push(`Preventa: ${this.preSaleFilter === 'WITH' ? 'Con preventa' : 'Sin preventa'}`);
            if (parts.length) {
                doc.setFontSize(8); doc.setTextColor(80);
                doc.text(`Filtros: ${parts.join(' | ')}`, W / 2, y, { align: 'center' });
                y += 5;
            }
            doc.setDrawColor(...ACCENT); doc.setLineWidth(0.5);
            doc.line(ML, y, W - MR, y); y += 4;

            // Cards de resumen
            const withPreSale    = billings.filter(b => b.preSaleNumber).length;
            const withoutPreSale = billings.length - withPreSale;
            const totalGeneral   = billings.reduce((s, b) => s + (b.subTotalSale || 0) + (b.totalIVAT || 0), 0);
            const cardW = CW / 4 - 3, cardH = 16;
            const cards = [
                { label: 'Total Facturas',   value: String(billings.length),        color: ACCENT   },
                { label: 'Con Preventa',     value: String(withPreSale),             color: PRESALE  },
                { label: 'Sin Preventa',     value: String(withoutPreSale),          color: SUCCESS  },
                { label: 'Total General',    value: this.fmt(totalGeneral),          color: PRIMARY  },
            ];
            cards.forEach((c, i) => {
                const x = ML + i * (cardW + 4);
                doc.setFillColor(...c.color); doc.roundedRect(x, y, cardW, cardH, 2, 2, 'F');
                doc.setFontSize(7); doc.setFont('helvetica','normal'); doc.setTextColor(255);
                doc.text(c.label, x + cardW / 2, y + 5, { align: 'center' });
                doc.setFontSize(11); doc.setFont('helvetica','bold');
                doc.text(c.value, x + cardW / 2, y + 12, { align: 'center' });
            });
            y += cardH + 6;

            // Tabla principal
            doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.setTextColor(...PRIMARY);
            doc.text('LISTADO DE FACTURAS', ML, y); y += 2;

            const rows = billings.map((b, i) => {
                const payments = b.payments?.map(p => `${this.formatPaymentMethod(p.method)}: ${this.fmt(p.amount)}`).join('\n')
                              || b.paymentMethods?.map(m => this.formatPaymentMethod(m)).join(', ') || 'N/A';
                return [
                    String(i + 1),
                    b.billNumber || '-',
                    this.fmtDate(b.dateTimeRecord),
                    b.client?.fullName || 'N/A',
                    b.saleType === 'CONTADO' ? 'Contado' : b.saleType === 'CREDITO' ? 'Crédito' : 'N/A',
                    b.preSaleNumber || '—',
                    payments,
                    this.fmt(b.subTotalSale || 0),
                    this.fmt(b.totalIVAT || 0),
                    this.fmt((b.subTotalSale || 0) + (b.totalIVAT || 0)),
                ];
            });

            const totalSub = billings.reduce((s, b) => s + (b.subTotalSale || 0), 0);
            const totalIva = billings.reduce((s, b) => s + (b.totalIVAT || 0), 0);

            autoTable(doc, {
                startY: y,
                head: [['#','No. Factura','Fecha','Cliente','Tipo','Preventa','Medio Pago','Subtotal','IVA','Total']],
                body: rows,
                styles: { fontSize: 6.5, cellPadding: 1.8, valign: 'middle', overflow: 'linebreak' },
                headStyles: { fillColor: PRIMARY, textColor: 255, fontStyle: 'bold', fontSize: 7 },
                columnStyles: {
                    0: { cellWidth: 7,  halign: 'center' },
                    1: { cellWidth: 22 },
                    2: { cellWidth: 20, halign: 'center' },
                    3: { cellWidth: 38 },
                    4: { cellWidth: 16, halign: 'center' },
                    5: { cellWidth: 22, halign: 'center' },
                    6: { cellWidth: 38 },
                    7: { cellWidth: 24, halign: 'right' },
                    8: { cellWidth: 18, halign: 'right' },
                    9: { cellWidth: 24, halign: 'right', fontStyle: 'bold' },
                },
                alternateRowStyles: { fillColor: LIGHT_BG },
                foot: [['','','','','','','TOTALES:', this.fmt(totalSub), this.fmt(totalIva), this.fmt(totalSub + totalIva)]],
                footStyles: { fillColor: PRIMARY, textColor: 255, fontStyle: 'bold', fontSize: 8 },
                rowPageBreak: 'avoid',
                margin: { left: ML, right: MR },
                // Resaltar filas con preventa
                didParseCell: (data: any) => {
                    if (data.section === 'body' && billings[data.row.index]?.preSaleNumber) {
                        data.cell.styles.fillColor = [240, 233, 255];
                    }
                }
            });

            y = (doc as any).lastAutoTable.finalY + 6;

            // Resumen preventa
            if (y + 30 > H - 20) { doc.addPage(); y = 15; }
            doc.setFontSize(10); doc.setFont('helvetica','bold'); doc.setTextColor(...PRIMARY);
            doc.text('RESUMEN POR ORIGEN', ML, y); y += 2;

            const preSaleTotal = billings.filter(b => b.preSaleNumber).reduce((s, b) => s + (b.subTotalSale || 0) + (b.totalIVAT || 0), 0);
            const noPreSaleTotal = billings.filter(b => !b.preSaleNumber).reduce((s, b) => s + (b.subTotalSale || 0) + (b.totalIVAT || 0), 0);

            autoTable(doc, {
                startY: y,
                head: [['Origen', 'Facturas', 'Total']],
                body: [
                    ['Con Preventa',    String(withPreSale),    this.fmt(preSaleTotal)],
                    ['Sin Preventa',    String(withoutPreSale), this.fmt(noPreSaleTotal)],
                ],
                foot: [['TOTAL', String(billings.length), this.fmt(preSaleTotal + noPreSaleTotal)]],
                styles: { fontSize: 8, cellPadding: 2.5 },
                headStyles: { fillColor: PRESALE, textColor: 255, fontStyle: 'bold' },
                footStyles: { fillColor: PRESALE, textColor: 255, fontStyle: 'bold' },
                columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: 22, halign: 'center' }, 2: { cellWidth: 40, halign: 'right' } },
                tableWidth: 102, margin: { left: ML }
            });

            y = (doc as any).lastAutoTable.finalY + 6;

            // Detalle por factura
            if (includeDetails) {
                billings.forEach(billing => {
                    if (y + 40 > H - 20) { doc.addPage(); y = 15; }
                    const headerColor: [number,number,number] = billing.preSaleNumber ? PRESALE : ACCENT;
                    doc.setFillColor(...headerColor);
                    doc.roundedRect(ML, y, CW, 8, 1.5, 1.5, 'F');
                    doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.setTextColor(255);
                    const presaleTag = billing.preSaleNumber ? ` | Preventa: ${billing.preSaleNumber}` : '';
                    doc.text(
                        `Factura ${billing.billNumber || 'S/N'}  |  ${this.fmtDateTime(billing.dateTimeRecord)}  |  ${billing.client?.fullName || 'N/A'}  |  ${billing.saleType === 'CONTADO' ? 'Contado' : 'Crédito'}${presaleTag}`,
                        ML + 3, y + 5.5
                    );
                    y += 11;

                    const detailData = (billing.saleDetails || []).map((d: any, i: number) => [
                        String(i + 1), d.product?.barcode || '-', d.product?.description || 'N/A',
                        String(d.amount || 0), this.fmt(d.unitPrice || 0), this.fmt(d.subTotal || 0),
                        this.fmt(d.totalVat || 0), this.fmt((d.subTotal || 0) + (d.totalVat || 0))
                    ]);

                    autoTable(doc, {
                        startY: y,
                        head: [['#','Código','Producto','Cant.','P. Unit.','Subtotal','IVA','Total']],
                        body: detailData,
                        foot: [['','','','','TOTALES:', this.fmt(billing.subTotalSale || 0), this.fmt(billing.totalIVAT || 0), this.fmt((billing.subTotalSale || 0) + (billing.totalIVAT || 0))]],
                        styles: { fontSize: 6.5, cellPadding: 1.5 },
                        headStyles: { fillColor: [100,100,100], textColor: 255, fontStyle: 'bold', fontSize: 6.5 },
                        footStyles: { fillColor: LIGHT_BG, textColor: PRIMARY, fontStyle: 'bold', fontSize: 7 },
                        columnStyles: { 0: { cellWidth: 7, halign:'center' }, 1: { cellWidth:22 }, 2: { cellWidth:'auto' }, 3: { cellWidth:12, halign:'center' }, 4: { cellWidth:24, halign:'right' }, 5: { cellWidth:24, halign:'right' }, 6: { cellWidth:18, halign:'right' }, 7: { cellWidth:24, halign:'right', fontStyle:'bold' } },
                        rowPageBreak: 'avoid', margin: { left: ML + 2, right: MR + 2 }
                    });
                    y = (doc as any).lastAutoTable.finalY + 5;
                });
            }

            // Pie de página
            const totalPgs = doc.getNumberOfPages();
            for (let i = 1; i <= totalPgs; i++) {
                doc.setPage(i); doc.setFontSize(7); doc.setTextColor(150);
                doc.text(`Página ${i} de ${totalPgs}`, W / 2, H - 7, { align: 'center' });
                doc.text('Concentrados La 28 — Reporte generado automáticamente', ML, H - 7);
            }

            const f2 = this.filterForm.value;
            const range = f2.startDate && f2.endDate ? `${f2.startDate}_${f2.endDate}` : this.today;
            doc.save(`reporte_facturas_${range}.pdf`);
            toast.success(`PDF generado (${billings.length} facturas)`);
        } catch (e) {
            console.error(e); toast.error('Error al generar el PDF');
        } finally {
            this.isGeneratingPdf = false;
        }
    }
}
