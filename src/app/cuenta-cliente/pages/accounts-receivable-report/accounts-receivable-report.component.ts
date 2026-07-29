import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { ClientAccountService } from '../../services/client-account.service';
import { AccountSummary, AccountReportFilter, PagedAccountReport, ManualTransaction } from '../../models/client-account';
import { ManualCreditModalComponent } from '../../components/manual-credit-modal/manual-credit-modal.component';
import { ClienteService } from '../../../cliente/cliente.service';
import { Client } from '../../../cliente/cliente';
import { toast } from 'ngx-sonner';

type StatusFilter = 'all' | 'pending' | 'settled';
type RowTab = 'facturas' | 'cuaderno' | 'pagos';

@Component({
    selector: 'app-accounts-receivable-report',
    standalone: true,
    imports: [CommonModule, FormsModule, ReactiveFormsModule, CurrencyPipe, ManualCreditModalComponent],
    templateUrl: './accounts-receivable-report.component.html',
    styleUrl: './accounts-receivable-report.component.css'
})
export class AccountsReceivableReportComponent implements OnInit {

    accountService  = inject(ClientAccountService);
    clienteService  = inject(ClienteService);
    fb              = inject(FormBuilder);

    accounts:    AccountSummary[] = [];
    isLoading = false;
    isExportingPdf = false;

    // ─── Paginación ──────────────────────────────────────────────
    currentPage   = 0;
    pageSize      = 20;
    pageSizes     = [10, 20, 50, 100];
    totalPages    = 0;
    totalElements = 0;

    // ─── Estado expandido ─────────────────────────────────────────
    expandedClientId: string | null = null;
    rowTabs: Record<string, RowTab> = {};
    expandedBillingIds = new Set<string>();

    // ─── Filtro de estado ─────────────────────────────────────────
    statusFilter: StatusFilter = 'all';

    // ─── Autocomplete cliente ─────────────────────────────────────
    clients:             Client[] = [];
    filteredClients:     Client[] = [];
    clientSearchText  = '';
    showClientDropdown = false;
    selectedClient:     Client | null = null;

    filterForm: FormGroup = this.fb.group({
        fromDate: [''],
        toDate:   ['']
    });

    // ─── Totales de página ────────────────────────────────────────
    totalDebtSum = 0;
    totalPending = 0;
    totalPaidSum = 0;
    pendingCount = 0;

    @ViewChild(ManualCreditModalComponent) manualCreditModal!: ManualCreditModalComponent;

    ngOnInit(): void {
        this.clienteService.getAll().subscribe(c => {
            this.clients         = c;
            this.filteredClients = c;
        });
        this.loadReport();
    }

    // ─── Carga ───────────────────────────────────────────────────

    loadReport(page = this.currentPage): void {
        this.isLoading = true;
        const f = this.filterForm.value;
        const filter: AccountReportFilter = {
            clientId:        this.selectedClient?.id || undefined,
            fromDate:        f.fromDate || undefined,
            toDate:          f.toDate   || undefined,
            onlyWithBalance: this.statusFilter === 'pending' ? true : undefined,
            onlySettled:     this.statusFilter === 'settled' ? true : undefined,
            page,
            size: this.pageSize
        };

        this.accountService.getAccountsReport(filter).subscribe({
            next: (res: PagedAccountReport) => {
                this.accounts      = res.content;
                this.currentPage   = res.page;
                this.totalPages    = res.totalPages;
                this.totalElements = res.totalElements;
                this.totalDebtSum  = res.totalDebtGlobal    ?? 0;
                this.totalPaidSum  = res.totalPaidGlobal    ?? 0;
                this.totalPending  = res.totalPendingGlobal ?? 0;
                this.pendingCount  = res.pendingCountGlobal ?? 0;
                this.isLoading = false;
            },
            error: () => {
                toast.error('Error al cargar el reporte de cuentas por cobrar');
                this.isLoading = false;
            }
        });
    }

    applyFilters(): void {
        this.currentPage = 0;
        this.expandedClientId = null;
        this.loadReport(0);
    }

    clearFilters(): void {
        this.filterForm.reset({ fromDate: '', toDate: '' });
        this.selectedClient   = null;
        this.clientSearchText = '';
        this.filteredClients  = this.clients;
        this.statusFilter     = 'all';
        this.currentPage      = 0;
        this.expandedClientId = null;
        this.loadReport(0);
    }

    setStatusFilter(s: StatusFilter): void {
        this.statusFilter     = s;
        this.currentPage      = 0;
        this.expandedClientId = null;
        this.loadReport(0);
    }

    changePageSize(size: number): void {
        this.pageSize         = size;
        this.currentPage      = 0;
        this.expandedClientId = null;
        this.loadReport(0);
    }

    // ─── Paginación ──────────────────────────────────────────────

    goToPage(p: number): void {
        if (p < 0 || p >= this.totalPages) return;
        this.currentPage = p;
        this.expandedClientId = null;
        this.loadReport(p);
    }

    prevPage(): void { this.goToPage(this.currentPage - 1); }
    nextPage(): void { this.goToPage(this.currentPage + 1); }

    get pageNumbers(): number[] {
        const pages: number[] = [];
        const start = Math.max(0, this.currentPage - 2);
        const end   = Math.min(this.totalPages - 1, this.currentPage + 2);
        for (let i = start; i <= end; i++) pages.push(i);
        return pages;
    }

    calculateTotals(): void {
        // Totals now come from backend global aggregates — kept for fallback
        if (!this.totalDebtSum && !this.totalPending) {
            this.totalDebtSum = this.accounts.reduce((s, a) => s + (a.totalDebt    || 0), 0);
            this.totalPending = this.accounts.reduce((s, a) => s + Math.max(0, a.currentBalance || 0), 0);
            this.totalPaidSum = this.accounts.reduce((s, a) => s + (a.totalPaid    || 0), 0);
            this.pendingCount = this.accounts.filter(a => (a.currentBalance || 0) > 0).length;
        }
    }

    // ─── Fila expandible ─────────────────────────────────────────

    toggleRow(clientId: string): void {
        if (this.expandedClientId === clientId) {
            this.expandedClientId = null;
        } else {
            this.expandedClientId = clientId;
            if (!this.rowTabs[clientId]) {
                const account = this.accounts.find(a => a.clientId === clientId);
                if (account?.creditBillings?.length) {
                    this.rowTabs[clientId] = 'facturas';
                } else if (account?.manualTransactions?.length) {
                    this.rowTabs[clientId] = 'cuaderno';
                } else {
                    this.rowTabs[clientId] = 'pagos';
                }
            }
        }
    }

    isExpanded(clientId: string): boolean {
        return this.expandedClientId === clientId;
    }

    getRowTab(clientId: string): RowTab {
        return this.rowTabs[clientId] || 'facturas';
    }

    setRowTab(clientId: string, tab: RowTab): void {
        this.rowTabs[clientId] = tab;
    }

    toggleBilling(id: string): void {
        if (this.expandedBillingIds.has(id)) this.expandedBillingIds.delete(id);
        else this.expandedBillingIds.add(id);
    }

    isBillingExpanded(id: string): boolean {
        return this.expandedBillingIds.has(id);
    }

    // ─── Estado del cliente ───────────────────────────────────────

    isPending(a: AccountSummary): boolean { return (a.currentBalance || 0) > 0; }
    isSettled(a: AccountSummary): boolean { return (a.currentBalance || 0) <= 0 && (a.totalDebt || 0) > 0; }

    statusLabel(a: AccountSummary): string {
        if (this.isPending(a)) return 'Con saldo';
        if (this.isSettled(a)) return 'Saldado';
        return 'Sin deuda';
    }

    statusClass(a: AccountSummary): string {
        if (this.isPending(a)) return 'status-pending';
        if (this.isSettled(a)) return 'status-settled';
        return 'status-none';
    }

    // ─── Helpers de transacciones manuales ───────────────────────

    isFromCuaderno(t: ManualTransaction): boolean {
        return t.source === 'MIGRACION_CUADERNO' || t.type === 'MANUAL_DEBT';
    }

    manualTxLabel(t: ManualTransaction): string {
        switch (t.type) {
            case 'MANUAL_DEBT':       return 'Del cuaderno';
            case 'ADJUSTMENT':        return 'Ajuste';
            case 'RETURN_ADJUSTMENT': return 'Devolución';
            default: return t.type;
        }
    }

    manualTxBadgeClass(t: ManualTransaction): string {
        switch (t.type) {
            case 'MANUAL_DEBT':       return 'bg-warning text-dark';
            case 'ADJUSTMENT':        return 'bg-info text-dark';
            case 'RETURN_ADJUSTMENT': return 'bg-success';
            default: return 'bg-secondary';
        }
    }

    // ─── Autocomplete cliente ─────────────────────────────────────

    filterClients(q: string): void {
        this.clientSearchText = q;
        if (!q.trim()) { this.filteredClients = this.clients; this.showClientDropdown = false; return; }
        const lq = q.toLowerCase();
        this.filteredClients = this.clients.filter(c =>
            (c.name || '').toLowerCase().includes(lq) ||
            (c.surname || '').toLowerCase().includes(lq) ||
            (c.businessName || '').toLowerCase().includes(lq) ||
            (c.idNumber || '').toLowerCase().includes(lq)
        );
        this.showClientDropdown = this.filteredClients.length > 0;
    }

    selectClient(c: Client): void {
        this.selectedClient     = c;
        this.clientSearchText   = this.clientDisplayName(c);
        this.showClientDropdown = false;
    }

    clearClientFilter(): void {
        this.selectedClient   = null;
        this.clientSearchText = '';
        this.filteredClients  = this.clients;
    }

    clientDisplayName(c: Client): string {
        return c.name?.trim()         ? `${c.name} ${c.surname || ''}`.trim()
             : c.businessName?.trim() ? c.businessName
             : c.nickname?.trim()     ? c.nickname : 'Sin nombre';
    }

    // ─── Helpers de formato ───────────────────────────────────────

    formatDate(d: string | Date | undefined): string {
        if (!d) return '-';
        return new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
            .format(new Date(d));
    }

    formatDateTime(d: string | Date | undefined): string {
        if (!d) return '-';
        return new Intl.DateTimeFormat('es-CO', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        }).format(new Date(d));
    }

    formatPaymentMethod(m: string | undefined): string {
        const map: Record<string, string> = {
            EFECTIVO: 'Efectivo', TRANSFERENCIA: 'Transferencia',
            TARJETA_DEBITO: 'T. Débito', TARJETA_CREDITO: 'T. Crédito',
            CHEQUE: 'Cheque', SALDO_FAVOR: 'Saldo a Favor', OTRO: 'Otro'
        };
        return m ? (map[m] ?? m) : '-';
    }

    paymentMethodBadge(m: string | undefined): string {
        const map: Record<string, string> = {
            EFECTIVO: 'bg-success', TRANSFERENCIA: 'bg-primary',
            TARJETA_DEBITO: 'bg-info text-dark', TARJETA_CREDITO: 'bg-info text-dark',
            CHEQUE: 'bg-warning text-dark', SALDO_FAVOR: 'bg-secondary', OTRO: 'bg-secondary'
        };
        return m ? (map[m] ?? 'bg-secondary') : 'bg-secondary';
    }

    // ─── Exportar ─────────────────────────────────────────────────

    openManualCreditModal(): void { this.manualCreditModal?.openModal(); }

    exportToCSV(): void {
        if (!this.accounts.length) { toast.warning('No hay datos para exportar'); return; }
        const headers = ['Cliente', 'Documento', 'Total Deuda', 'Total Pagado', 'Saldo Pendiente', 'Estado', 'Último Movimiento'];
        const rows = this.accounts.map(a => [
            `"${a.clientName}"`, a.clientIdNumber,
            a.totalDebt, a.totalPaid, a.currentBalance,
            this.statusLabel(a),
            this.formatDate(a.lastPaymentDate)
        ]);
        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `cuentas_por_cobrar_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        toast.success('Reporte exportado');
    }

    exportToPDF(): void {
        if (this.isExportingPdf) return;
        this.isExportingPdf = true;
        const f = this.filterForm.value;
        const filter: AccountReportFilter = {
            clientId:        this.selectedClient?.id || undefined,
            fromDate:        f.fromDate || undefined,
            toDate:          f.toDate   || undefined,
            onlyWithBalance: this.statusFilter === 'pending' ? true : undefined,
            onlySettled:     this.statusFilter === 'settled' ? true : undefined
        };
        this.accountService.getAccountsReportPdf(filter).subscribe({
            next: (blob: Blob) => {
                const url  = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href  = url;
                link.download = `cuentas_por_cobrar_${new Date().toISOString().split('T')[0]}.pdf`;
                link.click();
                URL.revokeObjectURL(url);
                this.isExportingPdf = false;
                toast.success('PDF generado exitosamente');
            },
            error: () => {
                toast.error('Error al generar el PDF');
                this.isExportingPdf = false;
            }
        });
    }
}
