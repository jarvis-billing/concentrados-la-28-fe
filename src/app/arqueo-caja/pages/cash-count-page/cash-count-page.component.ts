import { Component, inject, OnInit } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CashRegisterService } from '../../services/cash-register.service';
import { CashLoanService } from '../../services/cash-loan.service';
import { CashLoan } from '../../models/cash-loan';
import { 
    CashDenomination, 
    CashTransaction, 
    PaymentMethodSummary,
    COLOMBIAN_DENOMINATIONS,
    CreateCashCountRequest,
    CashCountSession,
    AuditTrailEntry
} from '../../models/cash-register';
import { toast } from 'ngx-sonner';
import { formatInTimeZone } from 'date-fns-tz';

@Component({
    selector: 'app-cash-count-page',
    standalone: true,
    imports: [CommonModule, FormsModule, CurrencyPipe],
    templateUrl: './cash-count-page.component.html',
    styleUrl: './cash-count-page.component.css'
})
export class CashCountPageComponent implements OnInit {

    private cashService = inject(CashRegisterService);
    private loanService = inject(CashLoanService);
    private router = inject(Router);

    // Fecha del arqueo
    sessionDate: string = this.todayIso();
    
    // Saldo de apertura
    openingBalance: number = 0;
    suggestedOpeningBalance: number = 0;

    // Denominaciones para conteo
    billetes: CashDenomination[] = [];
    monedas: CashDenomination[] = [];

    // Datos del sistema
    transactions: CashTransaction[] = [];
    paymentMethodSummaries: PaymentMethodSummary[] = [];
    
    // Totales esperados del sistema
    expectedCashAmount: number = 0;
    expectedCashTotal: number = 0;
    expectedTransferAmount: number = 0;
    expectedOtherAmount: number = 0;
    totalIncome: number = 0;
    totalExpense: number = 0;

    // Estado
    isLoading: boolean = false;
    isSaving: boolean = false;
    existingSession: CashCountSession | null = null;
    notes: string = '';

    // Préstamos pendientes
    pendingLoans: CashLoan[] = [];
    pendingLoansTotal: number = 0;
    hasOverdueLoans: boolean = false;

    // Tabs
    activeTab: 'conteo' | 'efectivo' | 'transferencias' | 'otros' | 'resumen' = 'conteo';

    // Acordeones de categorías de efectivo (cerrados por defecto)
    expandedCashCategories = new Set<string>();

    toggleCashCategory(cat: string): void {
        if (this.expandedCashCategories.has(cat)) {
            this.expandedCashCategories.delete(cat);
        } else {
            this.expandedCashCategories.add(cat);
        }
    }

    isCashCategoryExpanded(cat: string): boolean {
        return this.expandedCashCategories.has(cat);
    }

    // Para usar en el template
    Math = Math;

    ngOnInit(): void {
        this.initializeDenominations();
        this.loadSuggestedOpeningBalance();
        this.loadDailySummary();
        this.loadPendingLoans();
    }

    private todayIso(): string {
        return formatInTimeZone(new Date(), 'America/Bogota', 'yyyy-MM-dd');
    }

    loadPendingLoans(): void {
        this.loanService.list({ status: 'PENDIENTE' }).subscribe({
            next: (loans) => {
                this.pendingLoans = loans;
                this.pendingLoansTotal = loans.reduce((s, l) => s + l.amount, 0);
                const today = this.todayIso();
                this.hasOverdueLoans = loans.some(l => l.loanDate < today);
            }
        });
    }

    navigateToLoans(): void {
        this.router.navigate(['/main/arqueo-caja/prestamos']);
    }

    formatLoanDate(dateStr: string): string {
        if (!dateStr) return '-';
        const parts = dateStr.split('-');
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }

    isLoanOverdue(loan: CashLoan): boolean {
        return loan.loanDate < this.todayIso();
    }

    private initializeDenominations(): void {
        this.billetes = COLOMBIAN_DENOMINATIONS
            .filter(d => d.type === 'BILLETE')
            .map(d => ({ ...d, quantity: 0, subtotal: 0 }));

        this.monedas = COLOMBIAN_DENOMINATIONS
            .filter(d => d.type === 'MONEDA')
            .map(d => ({ ...d, quantity: 0, subtotal: 0 }));
    }

    loadSuggestedOpeningBalance(): void {
        this.cashService.getSuggestedOpeningBalance().subscribe({
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
        
        // Cargar resumen del día
        this.cashService.getDailySummary(this.sessionDate).subscribe({
            next: (summary) => {
                this.transactions = summary.transactions;
                this.paymentMethodSummaries = summary.paymentMethodSummaries;
                this.totalIncome = summary.totalIncome;
                this.totalExpense = summary.totalExpense;
                this.expectedCashAmount = summary.expectedCashAmount;
                this.expectedCashTotal = summary.expectedCashTotal ?? (this.openingBalance + summary.expectedCashAmount);
                this.expectedTransferAmount = summary.expectedTransferAmount;
                this.expectedOtherAmount = summary.expectedOtherAmount;
                this.isLoading = false;
            },
            error: () => {
                toast.error('Error al cargar el resumen del día');
                this.isLoading = false;
            }
        });

        // Verificar si ya existe un arqueo para esta fecha
        this.cashService.getByDate(this.sessionDate).subscribe({
            next: (session) => {
                if (session) {
                    this.existingSession = session;
                    this.loadExistingSession(session);
                }
            }
        });
    }

    loadExistingSession(session: CashCountSession): void {
        this.openingBalance = session.openingBalance;
        this.notes = session.notes || '';
        
        // Cargar cantidades de denominaciones
        session.cashDenominations.forEach(d => {
            const billete = this.billetes.find(b => b.value === d.value && d.type === 'BILLETE');
            if (billete) {
                billete.quantity = d.quantity;
                billete.subtotal = d.subtotal;
            }
            const moneda = this.monedas.find(m => m.value === d.value && d.type === 'MONEDA');
            if (moneda) {
                moneda.quantity = d.quantity;
                moneda.subtotal = d.subtotal;
            }
        });
    }

    onDateChange(): void {
        this.initializeDenominations();
        this.existingSession = null;
        this.loadDailySummary();
    }

    onQuantityChange(denomination: CashDenomination): void {
        denomination.subtotal = denomination.value * denomination.quantity;
    }

    get totalBilletes(): number {
        return this.billetes.reduce((sum, b) => sum + b.subtotal, 0);
    }

    get totalMonedas(): number {
        return this.monedas.reduce((sum, m) => sum + m.subtotal, 0);
    }

    get totalCashCounted(): number {
        return this.totalBilletes + this.totalMonedas;
    }

    get expectedTotalCash(): number {
        return this.expectedCashTotal ?? (this.openingBalance + this.expectedCashAmount);
    }

    get cashDifference(): number {
        return this.totalCashCounted - this.expectedTotalCash;
    }

    get differenceClass(): string {
        if (this.cashDifference === 0) return 'text-success';
        if (this.cashDifference > 0) return 'text-info';
        return 'text-danger';
    }

    get differenceLabel(): string {
        if (this.cashDifference === 0) return 'Cuadrado';
        if (this.cashDifference > 0) return 'Sobrante';
        return 'Faltante';
    }

    // Filtrar transacciones por método de pago
    getTransactionsByPaymentMethod(method: string): CashTransaction[] {
        return this.transactions.filter(t => t.paymentMethod === method);
    }

    getCashTransactions(): CashTransaction[] {
        return this.transactions.filter(t => t.paymentMethod === 'EFECTIVO');
    }

    // Categorías únicas presentes en las transacciones de efectivo
    getCashCategories(): string[] {
        const cats = new Set(this.getCashTransactions().map(t => t.category));
        return Array.from(cats);
    }

    // Transacciones de efectivo filtradas por categoría
    getCashTransactionsByCategory(category: string): CashTransaction[] {
        return this.getCashTransactions().filter(t => t.category === category);
    }

    // Total ingresos en efectivo por categoría
    getCashIncomeByCategory(category: string): number {
        return this.getCashTransactionsByCategory(category)
            .filter(t => t.type === 'INGRESO')
            .reduce((sum, t) => sum + t.amount, 0);
    }

    // Total egresos en efectivo por categoría
    getCashExpenseByCategory(category: string): number {
        return this.getCashTransactionsByCategory(category)
            .filter(t => t.type === 'EGRESO')
            .reduce((sum, t) => sum + t.amount, 0);
    }

    // Neto en efectivo por categoría
    getCashNetByCategory(category: string): number {
        return this.getCashIncomeByCategory(category) - this.getCashExpenseByCategory(category);
    }

    // Total ingresos solo en efectivo
    get totalCashIncome(): number {
        return this.getCashTransactions()
            .filter(t => t.type === 'INGRESO')
            .reduce((sum, t) => sum + t.amount, 0);
    }

    // Total egresos solo en efectivo
    get totalCashExpense(): number {
        return this.getCashTransactions()
            .filter(t => t.type === 'EGRESO')
            .reduce((sum, t) => sum + t.amount, 0);
    }

    getTransferTransactions(): CashTransaction[] {
        return this.transactions.filter(t => t.paymentMethod === 'TRANSFERENCIA');
    }

    getOtherTransactions(): CashTransaction[] {
        return this.transactions.filter(t => 
            t.paymentMethod !== 'EFECTIVO' && t.paymentMethod !== 'TRANSFERENCIA'
        );
    }

    // Guardar arqueo
    saveCount(): void {
        if (this.openingBalance < 0) {
            toast.warning('El saldo de apertura no puede ser negativo');
            return;
        }

        this.isSaving = true;

        const allDenominations = [...this.billetes, ...this.monedas]
            .filter(d => d.quantity > 0)
            .map(d => ({ value: d.value, quantity: d.quantity }));

        const request: CreateCashCountRequest = {
            sessionDate: this.sessionDate,
            openingBalance: this.openingBalance,
            cashDenominations: allDenominations,
            notes: this.notes || undefined
        };

        this.cashService.createOrUpdate(request).subscribe({
            next: (session) => {
                this.existingSession = session;
                toast.success('Arqueo guardado correctamente');
                this.isSaving = false;
            },
            error: (err) => {
                toast.error('Error al guardar el arqueo: ' + (err.error?.message || 'Intente nuevamente'));
                this.isSaving = false;
            }
        });
    }

    // Cerrar arqueo
    closeCount(): void {
        if (!this.existingSession?.id) {
            toast.warning('Primero debe guardar el arqueo');
            return;
        }

        toast.warning('¿Está seguro de cerrar este arqueo?', {
            description: 'Una vez cerrado no podrá modificarse.',
            duration: 10000,
            action: {
                label: 'Sí, cerrar',
                onClick: () => this.confirmCloseCount()
            },
            cancel: {
                label: 'Cancelar',
                onClick: () => {}
            }
        });
    }

    private confirmCloseCount(): void {
        this.cashService.closeSession(this.existingSession!.id!, this.notes).subscribe({
            next: (session) => {
                this.existingSession = session;
                toast.success('Arqueo cerrado correctamente');
            },
            error: (err) => {
                toast.error('Error al cerrar el arqueo: ' + (err.error?.message || 'Intente nuevamente'));
            }
        });
    }

    // Navegar a reportes
    goToReports(): void {
        this.router.navigate(['/main/arqueo-caja/reportes']);
    }

    // Usar saldo sugerido
    useSuggestedBalance(): void {
        this.openingBalance = this.suggestedOpeningBalance;
    }

    // Limpiar conteo
    clearCount(): void {
        this.initializeDenominations();
    }

    // Helpers para auditTrail
    getAuditEntry(action: string): AuditTrailEntry | undefined {
        return this.existingSession?.auditTrail?.find(e => e.action === action);
    }

    getLastAuditUpdate(): AuditTrailEntry | undefined {
        return this.existingSession?.auditTrail?.filter(e => e.action === 'ACTUALIZACION').pop();
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

    get lastUpdatedAt(): string | undefined {
        const entry = this.getLastAuditUpdate();
        return entry?.timestamp || this.getAuditEntry('APERTURA')?.timestamp;
    }

    formatCurrency(value: number): string {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(value);
    }

    // Formatear input de moneda (sin símbolo $)
    formatCurrencyInput(value: number): string {
        if (!value && value !== 0) return '';
        return new Intl.NumberFormat('es-CO', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(value);
    }

    // Parsear input de moneda
    onOpeningBalanceInput(event: Event): void {
        const input = event.target as HTMLInputElement;
        const rawValue = input.value.replace(/\D/g, '');
        this.openingBalance = rawValue ? parseInt(rawValue, 10) : 0;
        input.value = this.formatCurrencyInput(this.openingBalance);
    }

    getCategoryLabel(category: string, description?: string): string {
        if (category === 'AJUSTE' && description) {
            const descLower = description.toLowerCase();
            if (descLower.includes('cambio venta')) return 'Cambio entregado';
            if (descLower.includes('préstamo caja') || descLower.includes('prestamo caja')) return 'Préstamo';
            if (descLower.includes('devolución préstamo') || descLower.includes('devolucion prestamo')) return 'Devolución préstamo';
        }
        const labels: Record<string, string> = {
            'VENTA': 'Venta',
            'PAGO_CREDITO': 'Pago de Crédito',
            'DEPOSITO_ANTICIPO': 'Depósito/Anticipo',
            'GASTO': 'Gasto',
            'PAGO_PROVEEDOR': 'Pago a Proveedor',
            'AJUSTE': 'Ajuste'
        };
        return labels[category] || category;
    }

    getCategoryBadgeClassForTx(tx: CashTransaction): string {
        if (tx.category === 'AJUSTE' && tx.description) {
            const descLower = tx.description.toLowerCase();
            if (descLower.includes('cambio venta')) return 'bg-warning text-dark';
            if (descLower.includes('préstamo caja') || descLower.includes('prestamo caja')) return 'bg-danger';
            if (descLower.includes('devolución préstamo') || descLower.includes('devolucion prestamo')) return 'bg-info';
        }
        return this.getCategoryBadgeClass(tx.category);
    }

    getCategoryBadgeClass(category: string): string {
        const classes: Record<string, string> = {
            'VENTA': 'bg-success',
            'PAGO_CREDITO': 'bg-info',
            'DEPOSITO_ANTICIPO': 'bg-primary',
            'GASTO': 'bg-danger',
            'PAGO_PROVEEDOR': 'bg-warning text-dark',
            'AJUSTE': 'bg-secondary'
        };
        return classes[category] || 'bg-secondary';
    }

    // Totales por categoría para el resumen
    getTotalByCategory(category: string): number {
        return this.transactions
            .filter(t => t.category === category)
            .reduce((sum, t) => sum + t.amount, 0);
    }

    get totalVentas(): number {
        return this.getTotalByCategory('VENTA');
    }

    get totalPagosCredito(): number {
        return this.getTotalByCategory('PAGO_CREDITO');
    }

    get totalDepositosAnticipo(): number {
        return this.getTotalByCategory('DEPOSITO_ANTICIPO');
    }

    get totalGastos(): number {
        return this.getTotalByCategory('GASTO');
    }

    get totalPagosProveedor(): number {
        return this.getTotalByCategory('PAGO_PROVEEDOR');
    }

    get totalCambiosEntregados(): number {
        return this.transactions
            .filter(t => t.category === 'AJUSTE' && t.description?.toLowerCase().includes('cambio venta'))
            .reduce((sum, t) => sum + t.amount, 0);
    }

    get totalAjustes(): number {
        return this.transactions
            .filter(t => t.category === 'AJUSTE' && !t.description?.toLowerCase().includes('cambio venta'))
            .reduce((sum, t) => sum + t.amount, 0);
    }
}
