import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { BankReconciliationService } from '../../services/bank-reconciliation.service';
import {
    BankReconciliationDto,
    BankTransaction,
    BankPaymentMethodSummary,
    DailyBankSummaryResponse,
    CreateBankReconciliationRequest,
    AuditTrailEntry,
    SessionSnapshot
} from '../../models/bank-reconciliation';
import { ReopenSessionModalComponent } from '../../../shared/components/reopen-session-modal/reopen-session-modal.component';
import { BankAccountService } from '../../../bank-accounts/services/bank-account.service';
import { BankAccountDto } from '../../../bank-accounts/models/bank-account.model';
import { CashCountStatus } from '../../../arqueo-caja/models/cash-register';
import { toast } from 'ngx-sonner';
import { formatInTimeZone } from 'date-fns-tz';

@Component({
    selector: 'app-bank-reconciliation-page',
    standalone: true,
    imports: [CommonModule, FormsModule, ReopenSessionModalComponent],
    templateUrl: './bank-reconciliation-page.component.html',
    styleUrl: './bank-reconciliation-page.component.css'
})
export class BankReconciliationPageComponent implements OnInit {

    private bankService = inject(BankReconciliationService);
    private bankAccountService = inject(BankAccountService);
    private router = inject(Router);

    // Cuentas bancarias
    bankAccounts: BankAccountDto[] = [];
    selectedBankAccountId: string = '';

    // Fecha del arqueo
    sessionDate: string = this.todayIso();

    // Paso activo del wizard
    wizardStep: 1 | 2 | 3 = 1;

    // Saldo de apertura
    openingBalance: number = 0;
    suggestedOpeningBalance: number = 0;

    // Saldo final reportado por el usuario
    totalBankCounted: number = 0;
    totalBankCountedInput: string = '';

    // Notas
    notes: string = '';

    // Datos del sistema
    transactions: BankTransaction[] = [];
    paymentMethodSummaries: BankPaymentMethodSummary[] = [];

    // Totales esperados del sistema
    totalIncome: number = 0;
    totalExpense: number = 0;
    totalTransfers: number = 0;
    expectedBankAmount: number = 0;
    expectedBankTotal: number = 0;
    openingBalanceFromSummary: number = 0;

    // Estado
    isLoading: boolean = false;
    isSaving: boolean = false;
    existingSession: BankReconciliationDto | null = null;

    // Filtro de método de pago
    filterPaymentMethod: string = '';

    // Para usar en el template
    Math = Math;

    ngOnInit(): void {
        this.loadBankAccounts();
    }

    loadBankAccounts(): void {
        this.bankAccountService.listActive().subscribe({
            next: (accounts) => {
                this.bankAccounts = accounts;
                if (accounts.length > 0) {
                    // Default al primer activo
                    this.selectedBankAccountId = accounts[0].id;
                    this.loadSuggestedOpeningBalance();
                    this.loadDailySummary();
                }
            },
            error: () => {
                toast.error('Error al cargar cuentas bancarias');
            }
        });
    }

    onBankAccountChange(): void {
        this.existingSession = null;
        this.wizardStep = 1;
        this.totalBankCounted = 0;
        this.totalBankCountedInput = '';
        this.notes = '';
        this.transactions = [];
        this.paymentMethodSummaries = [];
        this.totalIncome = 0;
        this.totalExpense = 0;
        this.totalTransfers = 0;
        this.expectedBankAmount = 0;
        this.expectedBankTotal = 0;
        this.openingBalanceFromSummary = 0;
        this.loadSuggestedOpeningBalance();
        this.loadDailySummary();
    }

    get hasSelectedAccount(): boolean {
        return !!this.selectedBankAccountId;
    }

    private todayIso(): string {
        return formatInTimeZone(new Date(), 'America/Bogota', 'yyyy-MM-dd');
    }

    loadSuggestedOpeningBalance(): void {
        if (!this.selectedBankAccountId) return;
        this.bankService.getSuggestedOpeningBalance(this.selectedBankAccountId).subscribe({
            next: (result) => {
                this.suggestedOpeningBalance = result.balance;
                if (!this.existingSession) {
                    this.openingBalance = result.balance;
                }
            },
            error: () => {
                // Silencioso, usar 0 como default
            }
        });
    }

    loadDailySummary(): void {
        this.isLoading = true;

        this.bankService.getDailySummary(this.sessionDate, this.selectedBankAccountId).subscribe({
            next: (summary) => {
                this.transactions = summary.transactions || [];
                this.paymentMethodSummaries = summary.paymentMethodSummaries || [];
                this.totalIncome = summary.totalIncome || 0;
                this.totalExpense = summary.totalExpense || 0;
                this.totalTransfers = summary.totalTransfers || 0;
                this.expectedBankAmount = summary.expectedBankAmount || 0;
                this.expectedBankTotal = summary.expectedBankTotal || 0;
                this.openingBalanceFromSummary = summary.openingBalance || 0;

                // Si el sistema tiene sugerencia de apertura diferente a la nuestra, actualizar
                if (!this.existingSession && summary.openingBalance != null) {
                    this.openingBalance = summary.openingBalance;
                }

                this.isLoading = false;
            },
            error: () => {
                toast.error('Error al cargar el resumen del día');
                this.isLoading = false;
            }
        });

        // Verificar si ya existe una conciliación para esta fecha
        this.bankService.getByDate(this.sessionDate, this.selectedBankAccountId).subscribe({
            next: (session) => {
                if (session) {
                    this.existingSession = session;
                    this.loadExistingSession(session);
                }
            }
        });
    }

    loadExistingSession(session: BankReconciliationDto): void {
        this.openingBalance = session.openingBalance;
        this.totalBankCounted = session.totalBankCounted;
        this.totalBankCountedInput = this.formatCurrencyInput(session.totalBankCounted);
        this.notes = session.notes || '';
    }

    onDateChange(): void {
        if (!this.selectedBankAccountId) return;
        this.existingSession = null;
        this.wizardStep = 1;
        this.totalBankCounted = 0;
        this.totalBankCountedInput = '';
        this.notes = '';
        this.loadSuggestedOpeningBalance();
        this.loadDailySummary();
    }

    // ---------------- Wizard navigation ----------------

    goToStep(step: 1 | 2 | 3): void {
        if (step === 2 && this.wizardStep === 1) {
            // Validar que tenga datos antes de avanzar
            if (this.transactions.length === 0 && !this.isLoading) {
                toast.warning('No hay transacciones para esta fecha');
                return;
            }
        }
        this.wizardStep = step;
    }

    nextStep(): void {
        if (this.wizardStep < 3) {
            this.goToStep((this.wizardStep + 1) as 1 | 2 | 3);
        }
    }

    prevStep(): void {
        if (this.wizardStep > 1) {
            this.goToStep((this.wizardStep - 1) as 1 | 2 | 3);
        }
    }

    // ---------------- Totales calculados ----------------

    get difference(): number {
        return this.totalBankCounted - this.expectedBankTotal;
    }

    get differenceClass(): string {
        if (this.difference === 0) return 'text-success';
        if (this.difference > 0) return 'text-info';
        return 'text-danger';
    }

    get differenceLabel(): string {
        if (this.difference === 0) return 'Cuadrado';
        if (this.difference > 0) return 'Sobrante';
        return 'Faltante';
    }

    // ---------------- Transacciones filtradas ----------------

    get filteredTransactions(): BankTransaction[] {
        if (!this.filterPaymentMethod) return this.transactions;
        return this.transactions.filter(t => t.paymentMethod === this.filterPaymentMethod);
    }

    get uniquePaymentMethods(): string[] {
        const methods = new Set(this.transactions.map(t => t.paymentMethod));
        return Array.from(methods).sort();
    }

    getTransferTransactions(): BankTransaction[] {
        return this.transactions.filter(t => t.category === 'TRASLADO_BANCO');
    }

    // ---------------- Guardar / Cerrar / Cancelar ----------------

    saveDraft(): void {
        this.save(false);
    }

    saveAndClose(): void {
        if (this.difference !== 0 && !this.notes.trim()) {
            toast.warning('Hay una diferencia. Por favor agregue una nota explicativa antes de cerrar.');
            this.wizardStep = 2;
            return;
        }
        this.save(true);
    }

    private save(shouldClose: boolean): void {
        if (this.openingBalance < 0) {
            toast.warning('El saldo de apertura no puede ser negativo');
            return;
        }
        if (this.totalBankCounted < 0) {
            toast.warning('El saldo reportado no puede ser negativo');
            return;
        }

        this.isSaving = true;

        const request: CreateBankReconciliationRequest = {
            bankAccountId: this.selectedBankAccountId,
            sessionDate: this.sessionDate,
            openingBalance: this.openingBalance,
            totalBankCounted: this.totalBankCounted,
            notes: this.notes || undefined
        };

        this.bankService.createOrUpdate(request).subscribe({
            next: (session) => {
                this.existingSession = session;
                if (shouldClose) {
                    this.confirmCloseSession(session.id!);
                } else {
                    toast.success('Conciliación guardada correctamente');
                    this.isSaving = false;
                }
            },
            error: (err) => {
                toast.error('Error al guardar: ' + (err.error?.message || 'Intente nuevamente'));
                this.isSaving = false;
            }
        });
    }

    private confirmCloseSession(id: string): void {
        this.bankService.closeSession(id, this.selectedBankAccountId, this.notes).subscribe({
            next: (session) => {
                this.existingSession = session;
                toast.success('Conciliación cerrada correctamente');
                this.isSaving = false;
            },
            error: (err) => {
                toast.error('Error al cerrar: ' + (err.error?.message || 'Intente nuevamente'));
                this.isSaving = false;
            }
        });
    }

    closeExistingSession(): void {
        if (!this.existingSession?.id) {
            toast.warning('Primero debe guardar la conciliación');
            return;
        }

        toast.warning('¿Está seguro de cerrar esta conciliación?', {
            description: 'Una vez cerrada no podrá modificarse.',
            duration: 10000,
            action: {
                label: 'Sí, cerrar',
                onClick: () => this.confirmCloseSession(this.existingSession!.id!)
            },
            cancel: {
                label: 'Cancelar',
                onClick: () => {}
            }
        });
    }

    cancelSession(): void {
        if (!this.existingSession?.id) {
            toast.warning('No hay conciliación para anular');
            return;
        }
        if (this.existingSession.status !== CashCountStatus.EN_PROGRESO) {
            toast.warning('Solo se pueden anular conciliaciones en progreso');
            return;
        }

        const reason = window.prompt('Ingrese el motivo de anulación:');
        if (!reason || !reason.trim()) return;

        this.bankService.cancelSession(this.existingSession.id, this.selectedBankAccountId, reason).subscribe({
            next: (session) => {
                this.existingSession = session;
                toast.success('Conciliación anulada correctamente');
            },
            error: (err) => {
                toast.error('Error al anular: ' + (err.error?.message || 'Intente nuevamente'));
            }
        });
    }

    // ---------------- Helpers formato ----------------

    formatCurrency(value: number): string {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(value);
    }

    formatCurrencyInput(value: number): string {
        if (!value && value !== 0) return '';
        return new Intl.NumberFormat('es-CO', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(value);
    }

    onBankCountedInput(event: Event): void {
        const input = event.target as HTMLInputElement;
        const rawValue = input.value.replace(/\D/g, '');
        this.totalBankCounted = rawValue ? parseInt(rawValue, 10) : 0;
        input.value = this.formatCurrencyInput(this.totalBankCounted);
    }

    onOpeningBalanceInput(event: Event): void {
        const input = event.target as HTMLInputElement;
        const rawValue = input.value.replace(/\D/g, '');
        this.openingBalance = rawValue ? parseInt(rawValue, 10) : 0;
        input.value = this.formatCurrencyInput(this.openingBalance);
    }

    getCategoryLabel(category: string, description?: string): string {
        const labels: Record<string, string> = {
            'VENTA': 'Venta',
            'PAGO_CREDITO': 'Pago de Crédito',
            'DEPOSITO_ANTICIPO': 'Depósito/Anticipo',
            'DEVOLUCION_ANTICIPO': 'Devolución Anticipo',
            'GASTO': 'Gasto',
            'PAGO_PROVEEDOR': 'Pago a Proveedor',
            'AJUSTE': 'Ajuste',
            'TRASLADO_BANCO': 'Traslado a Banco'
        };
        return labels[category] || category;
    }

    getCategoryBadgeClass(category: string): string {
        const classes: Record<string, string> = {
            'VENTA': 'bg-success',
            'PAGO_CREDITO': 'bg-info',
            'DEPOSITO_ANTICIPO': 'bg-primary',
            'DEVOLUCION_ANTICIPO': 'bg-secondary',
            'GASTO': 'bg-danger',
            'PAGO_PROVEEDOR': 'bg-warning text-dark',
            'AJUSTE': 'bg-secondary',
            'TRASLADO_BANCO': 'bg-dark'
        };
        return classes[category] || 'bg-secondary';
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

    // ---------------- Audit Trail helpers ----------------

    getAuditEntry(action: string): AuditTrailEntry | undefined {
        return this.existingSession?.auditTrail?.find(e => e.action === action);
    }

    get openedByName(): string {
        return this.getAuditEntry('APERTURA')?.userName || '-';
    }

    get openedAt(): string | undefined {
        return this.getAuditEntry('APERTURA')?.timestamp;
    }

    get closedByName(): string {
        return this.getAuditEntry('CIERRE')?.userName || '-';
    }

    get closedAt(): string | undefined {
        return this.getAuditEntry('CIERRE')?.timestamp;
    }

    // ---------------- Navegación ----------------

    goToReports(): void {
        this.router.navigate(['/main/arqueo-bancario/reportes']);
    }

    useSuggestedBalance(): void {
        this.openingBalance = this.suggestedOpeningBalance;
    }

    // ---------------- Reapertura ----------------

    showReopenModal: boolean = false;
    isReopening: boolean = false;

    get canReopen(): boolean {
        return this.existingSession?.status === 'CERRADO';
    }

    openReopenModal(): void {
        this.showReopenModal = true;
    }

    onReopenModalClosed(): void {
        this.showReopenModal = false;
    }

    onReopenConfirmed(reason: string): void {
        if (!this.existingSession?.id) return;

        this.isReopening = true;
        this.bankService.reopenSession(this.existingSession.id, this.selectedBankAccountId, reason).subscribe({
            next: (session) => {
                this.existingSession = session;
                this.loadExistingSession(session);
                toast.success('Sesión reabierta correctamente');
                this.isReopening = false;
                this.showReopenModal = false;
            },
            error: (err) => {
                if (err.status === 400) {
                    toast.error('Esta conciliación no puede ser reabierta en su estado actual');
                } else if (err.status === 404) {
                    toast.error('Sesión no encontrada');
                } else {
                    toast.error(err.error?.message || 'Error al reabrir la sesión');
                }
                this.isReopening = false;
            }
        });
    }

    // ---------------- Snapshots ----------------

    showSnapshots: boolean = false;

    get snapshots(): SessionSnapshot[] {
        return (this.existingSession?.snapshots || []).slice().sort(
            (a, b) => new Date(b.snapshotAt).getTime() - new Date(a.snapshotAt).getTime()
        );
    }

    toggleSnapshots(): void {
        this.showSnapshots = !this.showSnapshots;
    }

    formatSnapshotDate(isoDate: string): string {
        const date = new Date(isoDate);
        return new Intl.DateTimeFormat('es-CO', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    }

    // ---------------- Audit Trail label helpers ----------------

    getAuditActionLabel(action: string): string {
        const labels: Record<string, string> = {
            'APERTURA': 'Apertura',
            'ACTUALIZACION': 'Actualización',
            'CIERRE': 'Cierre',
            'REAPERTURA': 'Reapertura',
            'ANULACION': 'Anulación'
        };
        return labels[action] || action;
    }

    getAuditActionBadgeClass(action: string): string {
        const classes: Record<string, string> = {
            'APERTURA': 'bg-success',
            'ACTUALIZACION': 'bg-primary',
            'CIERRE': 'bg-secondary',
            'REAPERTURA': 'bg-warning text-dark',
            'ANULACION': 'bg-danger'
        };
        return classes[action] || 'bg-secondary';
    }
}
