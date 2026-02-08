import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { ClientCreditService } from '../../services/client-credit.service';
import { CreditSummary, CreditReportFilter } from '../../models/client-credit';
import { toast } from 'ngx-sonner';
import { ManualCreditModalComponent } from '../../components/manual-credit-modal/manual-credit-modal.component';

@Component({
    selector: 'app-credits-report',
    standalone: true,
    imports: [CommonModule, FormsModule, ReactiveFormsModule, CurrencyPipe, ManualCreditModalComponent],
    templateUrl: './credits-report.component.html',
    styleUrl: './credits-report.component.css'
})
export class CreditsReportComponent implements OnInit {

    @ViewChild(ManualCreditModalComponent) manualCreditModal!: ManualCreditModalComponent;

    creditService = inject(ClientCreditService);
    fb = inject(FormBuilder);

    credits: CreditSummary[] = [];
    filteredCredits: CreditSummary[] = [];
    isLoading: boolean = false;

    filterForm: FormGroup = this.fb.group({
        fromDate: [''],
        toDate: [''],
        onlyWithBalance: [true]
    });

    // Totales
    totalDeposited: number = 0;
    totalUsed: number = 0;
    totalBalance: number = 0;

    ngOnInit(): void {
        this.loadReport();
    }

    loadReport(): void {
        this.isLoading = true;
        const filter: CreditReportFilter = {
            fromDate: this.filterForm.value.fromDate || undefined,
            toDate: this.filterForm.value.toDate || undefined,
            onlyWithBalance: this.filterForm.value.onlyWithBalance
        };

        this.creditService.getCreditsReport(filter).subscribe({
            next: (credits) => {
                this.credits = credits;
                this.filteredCredits = [...credits];
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
        this.loadReport();
    }

    clearFilters(): void {
        this.filterForm.reset({ onlyWithBalance: true });
        this.loadReport();
    }

    calculateTotals(): void {
        this.totalDeposited = this.filteredCredits.reduce((sum, c) => sum + c.totalDeposited, 0);
        this.totalUsed = this.filteredCredits.reduce((sum, c) => sum + c.totalUsed, 0);
        this.totalBalance = this.filteredCredits.reduce((sum, c) => sum + c.currentBalance, 0);
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
        if (this.filteredCredits.length === 0) {
            toast.warning('No hay datos para exportar');
            return;
        }

        const headers = ['Cliente', 'Documento', 'Total Depositado', 'Total Usado', 'Saldo a Favor', 'Última Transacción'];
        const rows = this.filteredCredits.map(c => [
            c.clientName,
            c.clientIdNumber,
            c.totalDeposited,
            c.totalUsed,
            c.currentBalance,
            this.formatDate(c.lastTransactionDate)
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `anticipos_clientes_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        toast.success('Reporte exportado exitosamente');
    }

    openManualCreditModal(): void {
        this.manualCreditModal.openModal();
    }
}
