import { Component, inject, OnInit } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CashRegisterService } from '../../services/cash-register.service';
import { OwnerWithdrawal, RegisterOwnerWithdrawalRequest } from '../../models/cash-register';
import { toast } from 'ngx-sonner';
import { formatInTimeZone } from 'date-fns-tz';

@Component({
    selector: 'app-owner-withdrawals-page',
    standalone: true,
    imports: [CommonModule, FormsModule, CurrencyPipe],
    templateUrl: './owner-withdrawals-page.component.html',
    styleUrl: './owner-withdrawals-page.component.css'
})
export class OwnerWithdrawalsPageComponent implements OnInit {

    private cashService = inject(CashRegisterService);

    withdrawals: OwnerWithdrawal[] = [];
    isLoading = false;

    // Filtros
    fromDate: string = this.firstDayOfMonth();
    toDate: string = this.todayIso();

    // Modal nuevo retiro
    showNewModal = false;
    isSaving = false;
    newWithdrawal: RegisterOwnerWithdrawalRequest = this.emptyForm();

    // ==================== Lifecycle ====================

    ngOnInit(): void {
        this.load();
    }

    // ==================== Carga de datos ====================

    load(): void {
        this.isLoading = true;
        this.cashService.getOwnerWithdrawals(this.fromDate, this.toDate).subscribe({
            next: (data) => {
                this.withdrawals = data;
                this.isLoading = false;
            },
            error: () => {
                toast.error('Error al cargar los retiros');
                this.isLoading = false;
            }
        });
    }

    // ==================== Totales ====================

    get totalAmount(): number {
        return this.withdrawals.reduce((s, w) => s + w.amount, 0);
    }

    get countWithdrawals(): number {
        return this.withdrawals.length;
    }

    // ==================== Modal nuevo retiro ====================

    openNewModal(): void {
        this.newWithdrawal = this.emptyForm();
        this.showNewModal = true;
    }

    closeNewModal(): void {
        this.showNewModal = false;
    }

    save(): void {
        if (!this.newWithdrawal.amount || this.newWithdrawal.amount <= 0) {
            toast.warning('El monto debe ser mayor a cero');
            return;
        }
        this.isSaving = true;
        this.cashService.registerOwnerWithdrawal(this.newWithdrawal).subscribe({
            next: () => {
                toast.success('Retiro registrado correctamente');
                this.isSaving = false;
                this.showNewModal = false;
                this.load();
            },
            error: (err) => {
                toast.error('Error: ' + (err.error?.error || 'Intente nuevamente'));
                this.isSaving = false;
            }
        });
    }

    // ==================== Input de moneda ====================

    amountInput = '';

    onAmountInput(event: Event): void {
        const input = event.target as HTMLInputElement;
        const raw = input.value.replace(/\D/g, '');
        this.newWithdrawal.amount = raw ? parseInt(raw, 10) : 0;
        this.amountInput = this.formatCurrencyInput(this.newWithdrawal.amount);
        input.value = this.amountInput;
    }

    // ==================== Helpers ====================

    private todayIso(): string {
        return formatInTimeZone(new Date(), 'America/Bogota', 'yyyy-MM-dd');
    }

    private firstDayOfMonth(): string {
        const today = new Date();
        return formatInTimeZone(
            new Date(today.getFullYear(), today.getMonth(), 1),
            'America/Bogota',
            'yyyy-MM-dd'
        );
    }

    private emptyForm(): RegisterOwnerWithdrawalRequest {
        return { amount: 0, date: this.todayIso(), description: '', reference: '' };
    }

    formatCurrency(value: number): string {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency', currency: 'COP', minimumFractionDigits: 0
        }).format(value);
    }

    formatCurrencyInput(value: number): string {
        if (!value && value !== 0) return '';
        return new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0 }).format(value);
    }

    formatDate(dateStr: string): string {
        if (!dateStr) return '-';
        const [y, m, d] = dateStr.split('-');
        return `${d}/${m}/${y}`;
    }
}
