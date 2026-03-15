import { Component, inject, OnInit } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CashLoanService } from '../../services/cash-loan.service';
import { CashLoan, CashLoanStatus, CreateCashLoanRequest, ReturnCashLoanRequest } from '../../models/cash-loan';
import { toast } from 'ngx-sonner';
import { formatInTimeZone } from 'date-fns-tz';

@Component({
    selector: 'app-cash-loans-page',
    standalone: true,
    imports: [CommonModule, FormsModule, CurrencyPipe],
    templateUrl: './cash-loans-page.component.html',
    styleUrl: './cash-loans-page.component.css'
})
export class CashLoansPageComponent implements OnInit {

    private loanService = inject(CashLoanService);
    private router = inject(Router);

    loans: CashLoan[] = [];
    isLoading = false;

    // Filtros
    filterFromDate = '';
    filterToDate = '';
    filterStatus: CashLoanStatus | '' = '';

    // Modal nuevo préstamo
    showNewLoanModal = false;
    newLoan: CreateCashLoanRequest = this.emptyNewLoan();
    isSavingNew = false;

    // Modal devolución
    showReturnModal = false;
    returnTarget: CashLoan | null = null;
    returnForm: ReturnCashLoanRequest = { returnedAmount: 0 };
    isSavingReturn = false;

    // Modal detalle
    showDetailModal = false;
    detailLoan: CashLoan | null = null;

    // Totales
    get totalPendiente(): number {
        return this.loans.filter(l => l.status === 'PENDIENTE').reduce((s, l) => s + l.amount, 0);
    }
    get totalDevuelto(): number {
        return this.loans.filter(l => l.status === 'DEVUELTO').reduce((s, l) => s + (l.returnedAmount || 0), 0);
    }
    get countPendiente(): number {
        return this.loans.filter(l => l.status === 'PENDIENTE').length;
    }

    ngOnInit(): void {
        this.loadLoans();
    }

    loadLoans(): void {
        this.isLoading = true;
        this.loanService.list({
            fromDate: this.filterFromDate || undefined,
            toDate: this.filterToDate || undefined,
            status: this.filterStatus || undefined
        }).subscribe({
            next: (data) => {
                this.loans = data.sort((a, b) => b.loanDate.localeCompare(a.loanDate));
                this.isLoading = false;
            },
            error: () => {
                toast.error('Error al cargar los préstamos');
                this.isLoading = false;
            }
        });
    }

    clearFilters(): void {
        this.filterFromDate = '';
        this.filterToDate = '';
        this.filterStatus = '';
        this.loadLoans();
    }

    // ==========================================
    // NUEVO PRÉSTAMO
    // ==========================================
    openNewLoanModal(): void {
        this.newLoan = this.emptyNewLoan();
        this.showNewLoanModal = true;
    }

    closeNewLoanModal(): void {
        this.showNewLoanModal = false;
    }

    saveNewLoan(): void {
        if (!this.newLoan.borrower?.trim()) {
            toast.warning('Debe indicar a quién se presta');
            return;
        }
        if (!this.newLoan.amount || this.newLoan.amount <= 0) {
            toast.warning('El monto debe ser mayor a 0');
            return;
        }
        this.isSavingNew = true;
        this.loanService.create(this.newLoan).subscribe({
            next: () => {
                toast.success('Préstamo registrado correctamente');
                this.closeNewLoanModal();
                this.loadLoans();
                this.isSavingNew = false;
            },
            error: () => {
                toast.error('Error al registrar el préstamo');
                this.isSavingNew = false;
            }
        });
    }

    // ==========================================
    // DEVOLUCIÓN
    // ==========================================
    openReturnModal(loan: CashLoan): void {
        this.returnTarget = loan;
        this.returnForm = {
            returnedAmount: loan.amount,
            returnDate: this.todayIso(),
            returnNotes: null
        };
        this.showReturnModal = true;
    }

    closeReturnModal(): void {
        this.showReturnModal = false;
        this.returnTarget = null;
    }

    saveReturn(): void {
        if (!this.returnTarget) return;
        if (!this.returnForm.returnedAmount || this.returnForm.returnedAmount <= 0) {
            toast.warning('El monto devuelto debe ser mayor a 0');
            return;
        }
        if (this.returnForm.returnedAmount > this.returnTarget.amount) {
            toast.warning(`El monto no puede superar el préstamo original (${this.formatCurrency(this.returnTarget.amount)})`);
            return;
        }
        this.isSavingReturn = true;
        this.loanService.returnLoan(this.returnTarget.id, this.returnForm).subscribe({
            next: () => {
                toast.success('Devolución registrada correctamente');
                this.closeReturnModal();
                this.loadLoans();
                this.isSavingReturn = false;
            },
            error: () => {
                toast.error('Error al registrar la devolución');
                this.isSavingReturn = false;
            }
        });
    }

    // ==========================================
    // ANULAR
    // ==========================================
    cancelLoan(loan: CashLoan): void {
        if (!confirm(`¿Está seguro de anular el préstamo de ${this.formatCurrency(loan.amount)} a ${loan.borrower}?`)) return;
        this.loanService.cancel(loan.id).subscribe({
            next: () => {
                toast.success('Préstamo anulado');
                this.loadLoans();
            },
            error: () => toast.error('Error al anular el préstamo')
        });
    }

    // ==========================================
    // DETALLE
    // ==========================================
    openDetailModal(loan: CashLoan): void {
        this.detailLoan = loan;
        this.showDetailModal = true;
    }

    closeDetailModal(): void {
        this.showDetailModal = false;
        this.detailLoan = null;
    }

    // ==========================================
    // HELPERS
    // ==========================================
    getStatusBadgeClass(status: CashLoanStatus): string {
        switch (status) {
            case 'PENDIENTE': return 'bg-warning text-dark';
            case 'DEVUELTO': return 'bg-success';
            case 'ANULADO': return 'bg-secondary';
        }
    }

    getStatusLabel(status: CashLoanStatus): string {
        switch (status) {
            case 'PENDIENTE': return 'Pendiente';
            case 'DEVUELTO': return 'Devuelto';
            case 'ANULADO': return 'Anulado';
        }
    }

    isOverdue(loan: CashLoan): boolean {
        return loan.status === 'PENDIENTE' && loan.loanDate < this.todayIso();
    }

    formatCurrency(value: number): string {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency', currency: 'COP',
            minimumFractionDigits: 0, maximumFractionDigits: 0
        }).format(value);
    }

    formatDate(dateStr: string): string {
        if (!dateStr) return '-';
        const parts = dateStr.split('-');
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }

    formatDateTime(dtStr: string | null): string {
        if (!dtStr) return '-';
        try {
            const d = new Date(dtStr);
            return new Intl.DateTimeFormat('es-CO', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit', hour12: true
            }).format(d);
        } catch {
            return dtStr;
        }
    }

    todayIso(): string {
        return formatInTimeZone(new Date(), 'America/Bogota', 'yyyy-MM-dd');
    }

    navigateToArqueo(): void {
        this.router.navigate(['/main/arqueo-caja']);
    }

    private emptyNewLoan(): CreateCashLoanRequest {
        return {
            loanDate: this.todayIso(),
            amount: 0,
            borrower: '',
            reason: null,
            notes: null
        };
    }

    // Parsear input de moneda
    onAmountInput(event: Event, target: 'new' | 'return'): void {
        const input = event.target as HTMLInputElement;
        const rawValue = input.value.replace(/\D/g, '');
        const numValue = rawValue ? parseInt(rawValue, 10) : 0;
        if (target === 'new') {
            this.newLoan.amount = numValue;
        } else {
            this.returnForm.returnedAmount = numValue;
        }
        input.value = this.formatCurrencyInput(numValue);
    }

    formatCurrencyInput(value: number): string {
        if (!value) return '';
        return new Intl.NumberFormat('es-CO').format(value);
    }

    Math = Math;
}
