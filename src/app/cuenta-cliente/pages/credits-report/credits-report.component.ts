import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { ClientCreditService } from '../../services/client-credit.service';
import { CreditSummary, CreditReportFilter, CreditTransaction, CreditTransactionType } from '../../models/client-credit';
import { ClienteService } from '../../../cliente/cliente.service';
import { Client } from '../../../cliente/cliente';
import { ManualCreditModalComponent } from '../../components/manual-credit-modal/manual-credit-modal.component';
import { toast } from 'ngx-sonner';

type StatusFilter = 'all' | 'with-balance' | 'no-balance';
type RowTab = 'depositos' | 'consumos';

@Component({
    selector: 'app-credits-report',
    standalone: true,
    imports: [CommonModule, FormsModule, ReactiveFormsModule, CurrencyPipe, ManualCreditModalComponent],
    templateUrl: './credits-report.component.html',
    styleUrl: './credits-report.component.css'
})
export class CreditsReportComponent implements OnInit {

    @ViewChild(ManualCreditModalComponent) manualCreditModal!: ManualCreditModalComponent;

    creditService  = inject(ClientCreditService);
    clienteService = inject(ClienteService);
    fb             = inject(FormBuilder);

    credits:         CreditSummary[] = [];
    filteredCredits: CreditSummary[] = [];
    isLoading = false;

    // ─── Filtro de estado ───────────────────────────────────────
    statusFilter: StatusFilter = 'with-balance';

    // ─── Fila expandible ────────────────────────────────────────
    expandedClientId: string | null = null;
    rowTabs: Record<string, RowTab> = {};

    // ─── Autocomplete cliente ───────────────────────────────────
    clients:            Client[] = [];
    filteredClients:    Client[] = [];
    clientSearchText  = '';
    showClientDropdown = false;
    selectedClient:    Client | null = null;

    // ─── Totales ────────────────────────────────────────────────
    totalDeposited = 0;
    totalUsed      = 0;
    totalBalance   = 0;

    filterForm: FormGroup = this.fb.group({
        fromDate: [''],
        toDate:   ['']
    });

    ngOnInit(): void {
        this.clienteService.getAll().subscribe(c => {
            this.clients        = c;
            this.filteredClients = c;
        });
        this.loadReport();
    }

    // ─── Carga ──────────────────────────────────────────────────

    loadReport(): void {
        this.isLoading = true;
        const f = this.filterForm.value;
        const filter: CreditReportFilter = {
            clientId:       this.selectedClient?.id || undefined,
            fromDate:       f.fromDate || undefined,
            toDate:         f.toDate   || undefined,
            onlyWithBalance: this.statusFilter === 'with-balance' ? true : undefined,
        };

        this.creditService.getCreditsReport(filter).subscribe({
            next: (credits) => {
                let result = credits;
                if (this.statusFilter === 'no-balance') {
                    result = credits.filter(c => (c.currentBalance as any) <= 0);
                }
                this.credits         = result;
                this.filteredCredits = [...result];
                this.calculateTotals();
                this.isLoading = false;
            },
            error: () => {
                toast.error('Error al cargar el reporte de anticipos');
                this.isLoading = false;
            }
        });
    }

    applyFilters(): void {
        this.expandedClientId = null;
        this.loadReport();
    }

    clearFilters(): void {
        this.filterForm.reset({ fromDate: '', toDate: '' });
        this.selectedClient    = null;
        this.clientSearchText  = '';
        this.filteredClients   = this.clients;
        this.statusFilter      = 'with-balance';
        this.expandedClientId  = null;
        this.loadReport();
    }

    setStatusFilter(s: StatusFilter): void {
        this.statusFilter     = s;
        this.expandedClientId = null;
        this.loadReport();
    }

    calculateTotals(): void {
        this.totalDeposited = this.filteredCredits.reduce((s, c) => s + (c.totalDeposited as any ?? 0), 0);
        this.totalUsed      = this.filteredCredits.reduce((s, c) => s + (c.totalUsed      as any ?? 0), 0);
        this.totalBalance   = this.filteredCredits.reduce((s, c) => s + (c.currentBalance as any ?? 0), 0);
    }

    // ─── Fila expandible ────────────────────────────────────────

    toggleRow(clientId: string): void {
        if (this.expandedClientId === clientId) {
            this.expandedClientId = null;
        } else {
            this.expandedClientId = clientId;
            if (!this.rowTabs[clientId]) {
                this.rowTabs[clientId] = 'depositos';
            }
        }
    }

    isExpanded(clientId: string): boolean {
        return this.expandedClientId === clientId;
    }

    getRowTab(clientId: string): RowTab {
        return this.rowTabs[clientId] || 'depositos';
    }

    setRowTab(clientId: string, tab: RowTab, event: Event): void {
        event.stopPropagation();
        this.rowTabs[clientId] = tab;
    }

    deposits(credit: CreditSummary): CreditTransaction[] {
        return (credit.transactions || []).filter(t =>
            t.type === CreditTransactionType.DEPOSIT ||
            t.type === CreditTransactionType.ADJUSTMENT
        );
    }

    consumptions(credit: CreditSummary): CreditTransaction[] {
        return (credit.transactions || []).filter(t =>
            t.type === CreditTransactionType.CONSUMPTION ||
            t.type === CreditTransactionType.REFUND
        );
    }

    txTypeLabel(type: CreditTransactionType | string): string {
        const map: Record<string, string> = {
            DEPOSIT:     'Anticipo',
            ADJUSTMENT:  'Ajuste',
            CONSUMPTION: 'Usado en factura',
            REFUND:      'Devolución'
        };
        return map[type] ?? type;
    }

    txTypeBadge(type: CreditTransactionType | string): string {
        const map: Record<string, string> = {
            DEPOSIT:     'bg-success',
            ADJUSTMENT:  'bg-info text-dark',
            CONSUMPTION: 'bg-warning text-dark',
            REFUND:      'bg-secondary'
        };
        return map[type] ?? 'bg-secondary';
    }

    paymentMethodLabel(m: string | undefined): string {
        const map: Record<string, string> = {
            EFECTIVO: 'Efectivo', TRANSFERENCIA: 'Transf.',
            TARJETA_DEBITO: 'T. Débito', TARJETA_CREDITO: 'T. Crédito',
            CHEQUE: 'Cheque', OTRO: 'Otro'
        };
        return m ? (map[m] ?? m) : '-';
    }

    hasBalance(c: CreditSummary): boolean {
        return (c.currentBalance as any) > 0;
    }

    // ─── Autocomplete cliente ────────────────────────────────────

    filterClients(q: string): void {
        this.clientSearchText = q;
        if (!q.trim()) { this.filteredClients = this.clients; this.showClientDropdown = false; return; }
        const lq = q.toLowerCase();
        this.filteredClients = this.clients.filter(c =>
            (c.name       || '').toLowerCase().includes(lq) ||
            (c.surname    || '').toLowerCase().includes(lq) ||
            (c.businessName || '').toLowerCase().includes(lq) ||
            (c.idNumber   || '').toLowerCase().includes(lq)
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

    // ─── Formato ────────────────────────────────────────────────

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

    // ─── Exportar ────────────────────────────────────────────────

    openManualCreditModal(): void {
        this.manualCreditModal?.openModal();
    }

    exportToCSV(): void {
        if (!this.filteredCredits.length) { toast.warning('No hay datos para exportar'); return; }
        const headers = [
            'Cliente', 'Documento',
            'Total Anticipo', 'Total Usado', 'Saldo a Favor',
            'Fecha Anticipo', 'Medio de Pago', 'Cuenta Bancaria'
        ];
        const rows = this.filteredCredits.map(c => [
            `"${c.clientName}"`,
            c.clientIdNumber,
            c.totalDeposited,
            c.totalUsed,
            c.currentBalance,
            this.formatDate(c.lastDepositDate),
            c.lastDepositMethod ? this.paymentMethodLabel(c.lastDepositMethod) : '-',
            c.lastDepositMethod === 'TRANSFERENCIA' ? (c.lastDepositBankAccount || '-') : '-'
        ]);
        const BOM = '﻿';
        const csv = BOM + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `anticipos_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        toast.success('Reporte exportado');
    }
}
