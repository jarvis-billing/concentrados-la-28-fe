import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { ClientAccountService } from '../../services/client-account.service';
import { AccountSummary, AccountReportFilter } from '../../models/client-account';
import { ManualCreditModalComponent } from '../../components/manual-credit-modal/manual-credit-modal.component';
import { ClienteService } from '../../../cliente/cliente.service';
import { Client } from '../../../cliente/cliente';
import { toast } from 'ngx-sonner';

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

    accounts:         AccountSummary[] = [];
    filteredAccounts: AccountSummary[] = [];
    isLoading = false;

    // ─── Fila expandida ──────────────────────────────────────────
    expandedClientId: string | null = null;

    // ─── Filtro por cliente (autocomplete) ───────────────────────
    clients:             Client[] = [];
    filteredClients:     Client[] = [];
    clientSearchText  = '';
    showClientDropdown = false;
    selectedClient:     Client | null = null;

    filterForm: FormGroup = this.fb.group({
        fromDate:       [''],
        toDate:         [''],
        onlyWithBalance:[true]
    });

    // ─── Totales ─────────────────────────────────────────────────
    totalDebt    = 0;
    totalPaid    = 0;
    totalBalance = 0;

    @ViewChild(ManualCreditModalComponent) manualCreditModal!: ManualCreditModalComponent;

    ngOnInit(): void {
        this.clienteService.getAll().subscribe(c => {
            this.clients         = c;
            this.filteredClients = c;
        });
        this.loadReport();
    }

    // ─── Carga ───────────────────────────────────────────────────

    loadReport(): void {
        this.isLoading = true;
        const f = this.filterForm.value;
        const filter: AccountReportFilter = {
            clientId:        this.selectedClient?.id || undefined,
            fromDate:        f.fromDate || undefined,
            toDate:          f.toDate   || undefined,
            onlyWithBalance: f.onlyWithBalance
        };

        this.accountService.getAccountsReport(filter).subscribe({
            next: accounts => {
                this.accounts         = accounts;
                this.filteredAccounts = [...accounts];
                this.calculateTotals();
                this.isLoading = false;
            },
            error: () => {
                toast.error('Error al cargar el reporte de cuentas por cobrar');
                this.isLoading = false;
            }
        });
    }

    applyFilters(): void { this.loadReport(); }

    clearFilters(): void {
        this.filterForm.reset({ onlyWithBalance: true });
        this.selectedClient   = null;
        this.clientSearchText = '';
        this.filteredClients  = this.clients;
        this.loadReport();
    }

    calculateTotals(): void {
        this.totalDebt    = this.filteredAccounts.reduce((s, a) => s + (a.totalDebt    || 0), 0);
        this.totalPaid    = this.filteredAccounts.reduce((s, a) => s + (a.totalPaid    || 0), 0);
        this.totalBalance = this.filteredAccounts.reduce((s, a) => s + (a.currentBalance || 0), 0);
    }

    // ─── Fila expandible ─────────────────────────────────────────

    toggleRow(clientId: string): void {
        this.expandedClientId = this.expandedClientId === clientId ? null : clientId;
    }

    isExpanded(clientId: string): boolean {
        return this.expandedClientId === clientId;
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
        this.selectedClient   = c;
        this.clientSearchText = this.clientDisplayName(c);
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

    // ─── Helpers ─────────────────────────────────────────────────

    formatDate(d: string | Date | undefined): string {
        if (!d) return '-';
        return new Intl.DateTimeFormat('es-CO', { day:'2-digit', month:'2-digit', year:'numeric' }).format(new Date(d));
    }

    formatDateTime(d: string | Date | undefined): string {
        if (!d) return '-';
        return new Intl.DateTimeFormat('es-CO', {
            day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'
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
            TARJETA_DEBITO: 'bg-info', TARJETA_CREDITO: 'bg-info',
            CHEQUE: 'bg-warning text-dark', SALDO_FAVOR: 'bg-secondary', OTRO: 'bg-secondary'
        };
        return m ? (map[m] ?? 'bg-secondary') : 'bg-secondary';
    }

    openManualCreditModal(): void { this.manualCreditModal?.openModal(); }

    exportToCSV(): void {
        if (!this.filteredAccounts.length) { toast.warning('No hay datos para exportar'); return; }
        const headers = ['Cliente','Documento','Total Deuda','Total Pagado','Saldo Pendiente','Último Pago'];
        const rows = this.filteredAccounts.map(a => [
            a.clientName, a.clientIdNumber,
            a.totalDebt, a.totalPaid, a.currentBalance,
            this.formatDate(a.lastPaymentDate)
        ]);
        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `cuentas_por_cobrar_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        toast.success('Reporte exportado exitosamente');
    }
}
