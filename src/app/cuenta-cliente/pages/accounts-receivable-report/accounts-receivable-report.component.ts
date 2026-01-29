import { Component, inject, OnInit } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { ClientAccountService } from '../../services/client-account.service';
import { AccountSummary, AccountReportFilter } from '../../models/client-account';
import { toast } from 'ngx-sonner';

@Component({
    selector: 'app-accounts-receivable-report',
    standalone: true,
    imports: [CommonModule, FormsModule, ReactiveFormsModule, CurrencyPipe],
    templateUrl: './accounts-receivable-report.component.html',
    styleUrl: './accounts-receivable-report.component.css'
})
export class AccountsReceivableReportComponent implements OnInit {

    accountService = inject(ClientAccountService);
    fb = inject(FormBuilder);

    accounts: AccountSummary[] = [];
    filteredAccounts: AccountSummary[] = [];
    isLoading: boolean = false;

    filterForm: FormGroup = this.fb.group({
        fromDate: [''],
        toDate: [''],
        onlyWithBalance: [true]
    });

    // Totales
    totalDebt: number = 0;
    totalPaid: number = 0;
    totalBalance: number = 0;

    ngOnInit(): void {
        this.loadReport();
    }

    loadReport(): void {
        this.isLoading = true;
        const filter: AccountReportFilter = {
            fromDate: this.filterForm.value.fromDate || undefined,
            toDate: this.filterForm.value.toDate || undefined,
            onlyWithBalance: this.filterForm.value.onlyWithBalance
        };

        this.accountService.getAccountsReport(filter).subscribe({
            next: (accounts) => {
                this.accounts = accounts;
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

    applyFilters(): void {
        this.loadReport();
    }

    clearFilters(): void {
        this.filterForm.reset({ onlyWithBalance: true });
        this.loadReport();
    }

    calculateTotals(): void {
        this.totalDebt = this.filteredAccounts.reduce((sum, acc) => sum + acc.totalDebt, 0);
        this.totalPaid = this.filteredAccounts.reduce((sum, acc) => sum + acc.totalPaid, 0);
        this.totalBalance = this.filteredAccounts.reduce((sum, acc) => sum + acc.currentBalance, 0);
    }

    formatDate(dateInput: string | Date | undefined): string {
        if (!dateInput) return '-';
        const date = new Date(dateInput);
        return new Intl.DateTimeFormat('es-CO', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        }).format(date);
    }

    exportToCSV(): void {
        if (this.filteredAccounts.length === 0) {
            toast.warning('No hay datos para exportar');
            return;
        }

        const headers = ['Cliente', 'Documento', 'Total Deuda', 'Total Pagado', 'Saldo Pendiente', 'Último Pago'];
        const rows = this.filteredAccounts.map(acc => [
            acc.clientName,
            acc.clientIdNumber,
            acc.totalDebt,
            acc.totalPaid,
            acc.currentBalance,
            this.formatDate(acc.lastPaymentDate)
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `cuentas_por_cobrar_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        toast.success('Reporte exportado exitosamente');
    }
}
