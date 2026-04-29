import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { Router } from '@angular/router';
import { BankReconciliationService } from '../../services/bank-reconciliation.service';
import { BankAccountService } from '../../../bank-accounts/services/bank-account.service';
import { BankAccountDto } from '../../../bank-accounts/models/bank-account.model';
import { DailyBankSummary, ReconciliationStatus } from '../../models/bank-reconciliation';
import { CashCountStatus } from '../../../arqueo-caja/models/cash-register';
import { toast } from 'ngx-sonner';

@Component({
    selector: 'app-bank-reconciliation-reports',
    standalone: true,
    imports: [CommonModule, FormsModule, ReactiveFormsModule],
    templateUrl: './bank-reconciliation-reports.component.html',
    styleUrl: './bank-reconciliation-reports.component.css'
})
export class BankReconciliationReportsComponent implements OnInit {

    private bankService = inject(BankReconciliationService);
    private bankAccountService = inject(BankAccountService);
    private router = inject(Router);
    private fb = inject(FormBuilder);

    reports: DailyBankSummary[] = [];
    isLoading: boolean = false;
    bankAccounts: BankAccountDto[] = [];
    selectedBankAccountId: string = '';

    filterForm: FormGroup = this.fb.group({
        bankAccountId: [''],
        fromDate: [this.getDefaultFromDate()],
        toDate: [this.getDefaultToDate()],
        status: ['']
    });

    // Totales
    totalOpeningBalance: number = 0;
    totalIncome: number = 0;
    totalExpense: number = 0;
    totalBankCounted: number = 0;
    totalDifference: number = 0;

    statuses = Object.values(CashCountStatus);

    ngOnInit(): void {
        this.loadBankAccounts();
    }

    loadBankAccounts(): void {
        this.bankAccountService.listActive().subscribe({
            next: (accounts) => {
                this.bankAccounts = accounts;
                if (accounts.length > 0) {
                    this.selectedBankAccountId = accounts[0].id;
                    this.filterForm.patchValue({ bankAccountId: accounts[0].id });
                    this.loadReports();
                }
            },
            error: () => {
                toast.error('Error al cargar cuentas bancarias');
            }
        });
    }

    private getDefaultFromDate(): string {
        const date = new Date();
        date.setDate(date.getDate() - 30);
        return date.toISOString().split('T')[0];
    }

    private getDefaultToDate(): string {
        return new Date().toISOString().split('T')[0];
    }

    loadReports(): void {
        this.isLoading = true;

        const filter = {
            bankAccountId: this.filterForm.value.bankAccountId || this.selectedBankAccountId,
            fromDate: this.filterForm.value.fromDate || undefined,
            toDate: this.filterForm.value.toDate || undefined,
            status: this.filterForm.value.status || undefined
        };

        if (!filter.bankAccountId) {
            this.isLoading = false;
            return;
        }

        this.bankService.list(filter).subscribe({
            next: (reports) => {
                this.reports = reports;
                this.calculateTotals();
                this.isLoading = false;
            },
            error: () => {
                toast.error('Error al cargar los reportes');
                this.isLoading = false;
            }
        });
    }

    calculateTotals(): void {
        this.totalOpeningBalance = this.reports.reduce((sum, r) => sum + r.openingBalance, 0);
        this.totalIncome = this.reports.reduce((sum, r) => sum + r.totalIncome, 0);
        this.totalExpense = this.reports.reduce((sum, r) => sum + r.totalExpense, 0);
        this.totalBankCounted = this.reports.reduce((sum, r) => sum + r.totalBankCounted, 0);
        this.totalDifference = this.reports.reduce((sum, r) => sum + r.difference, 0);
    }

    applyFilters(): void {
        this.loadReports();
    }

    clearFilters(): void {
        this.filterForm.reset({
            bankAccountId: this.selectedBankAccountId,
            fromDate: this.getDefaultFromDate(),
            toDate: this.getDefaultToDate(),
            status: ''
        });
        this.loadReports();
    }

    viewDetails(date: string): void {
        this.router.navigate(['/main/arqueo-bancario'], { queryParams: { date } });
    }

    goToNewReconciliation(): void {
        this.router.navigate(['/main/arqueo-bancario']);
    }

    getStatusBadgeClass(status: CashCountStatus): string {
        switch (status) {
            case CashCountStatus.CERRADO:
                return 'bg-success';
            case CashCountStatus.EN_PROGRESO:
                return 'bg-warning text-dark';
            case CashCountStatus.ANULADO:
                return 'bg-danger';
            default:
                return 'bg-secondary';
        }
    }

    getStatusLabel(status: CashCountStatus): string {
        switch (status) {
            case CashCountStatus.CERRADO:
                return 'Cerrado';
            case CashCountStatus.EN_PROGRESO:
                return 'En Progreso';
            case CashCountStatus.ANULADO:
                return 'Anulado';
            default:
                return status;
        }
    }

    getClosedByName(report: DailyBankSummary): string {
        const entry = report.auditTrail?.find(e => e.action === 'CIERRE');
        return entry?.userName || '-';
    }

    getDifferenceClass(difference: number): string {
        if (difference === 0) return 'text-success';
        if (difference > 0) return 'text-info';
        return 'text-danger';
    }

    formatCurrency(value: number): string {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(value);
    }

    formatDate(dateStr: string): string {
        const date = new Date(dateStr + 'T12:00:00');
        return new Intl.DateTimeFormat('es-CO', {
            weekday: 'short',
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        }).format(date);
    }

    exportToCSV(): void {
        if (this.reports.length === 0) {
            toast.warning('No hay datos para exportar');
            return;
        }

        const headers = ['Fecha', 'Saldo Inicial', 'Ingresos', 'Egresos', 'Neto Esperado', 'Reportado Banco', 'Diferencia', 'Estado', 'Cerrado Por'];
        const rows = this.reports.map(r => [
            r.date,
            r.openingBalance,
            r.totalIncome,
            r.totalExpense,
            r.expectedBankAmount,
            r.totalBankCounted,
            r.difference,
            this.getStatusLabel(r.status),
            this.getClosedByName(r)
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `arqueos_bancarios_${this.filterForm.value.fromDate}_${this.filterForm.value.toDate}.csv`;
        link.click();
        toast.success('Reporte exportado exitosamente');
    }
}
