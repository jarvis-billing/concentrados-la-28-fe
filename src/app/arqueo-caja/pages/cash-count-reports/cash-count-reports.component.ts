import { Component, inject, OnInit } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { Router } from '@angular/router';
import { CashRegisterService } from '../../services/cash-register.service';
import { DailyCashSummary, CashCountFilter, CashCountStatus } from '../../models/cash-register';
import { toast } from 'ngx-sonner';

@Component({
    selector: 'app-cash-count-reports',
    standalone: true,
    imports: [CommonModule, FormsModule, ReactiveFormsModule, CurrencyPipe],
    templateUrl: './cash-count-reports.component.html',
    styleUrl: './cash-count-reports.component.css'
})
export class CashCountReportsComponent implements OnInit {

    private cashService = inject(CashRegisterService);
    private router = inject(Router);
    private fb = inject(FormBuilder);

    reports: DailyCashSummary[] = [];
    isLoading: boolean = false;

    filterForm: FormGroup = this.fb.group({
        fromDate: [this.getDefaultFromDate()],
        toDate: [this.getDefaultToDate()],
        status: ['']
    });

    // Totales
    totalIncome: number = 0;
    totalExpense: number = 0;
    totalDifference: number = 0;

    statuses = Object.values(CashCountStatus);

    ngOnInit(): void {
        this.loadReports();
    }

    private getDefaultFromDate(): string {
        const date = new Date();
        date.setDate(date.getDate() - 30); // Últimos 30 días
        return date.toISOString().split('T')[0];
    }

    private getDefaultToDate(): string {
        return new Date().toISOString().split('T')[0];
    }

    loadReports(): void {
        this.isLoading = true;

        const filter: CashCountFilter = {
            fromDate: this.filterForm.value.fromDate || undefined,
            toDate: this.filterForm.value.toDate || undefined,
            status: this.filterForm.value.status || undefined
        };

        this.cashService.list(filter).subscribe({
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
        this.totalIncome = this.reports.reduce((sum, r) => sum + r.totalIncome, 0);
        this.totalExpense = this.reports.reduce((sum, r) => sum + r.totalExpense, 0);
        this.totalDifference = this.reports.reduce((sum, r) => sum + r.difference, 0);
    }

    applyFilters(): void {
        this.loadReports();
    }

    clearFilters(): void {
        this.filterForm.reset({
            fromDate: this.getDefaultFromDate(),
            toDate: this.getDefaultToDate(),
            status: ''
        });
        this.loadReports();
    }

    viewDetails(date: string): void {
        this.router.navigate(['/main/arqueo-caja'], { queryParams: { date } });
    }

    goToNewCount(): void {
        this.router.navigate(['/main/arqueo-caja']);
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

        const headers = ['Fecha', 'Base Caja', 'Ingresos', 'Egresos', 'Esperado', 'Contado', 'Diferencia', 'Estado', 'Cerrado Por'];
        const rows = this.reports.map(r => [
            r.date,
            r.openingBalance,
            r.totalIncome,
            r.totalExpense,
            r.expectedCash,
            r.countedCash,
            r.difference,
            this.getStatusLabel(r.status),
            r.closedBy || ''
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `arqueos_caja_${this.filterForm.value.fromDate}_${this.filterForm.value.toDate}.csv`;
        link.click();
        toast.success('Reporte exportado exitosamente');
    }
}
