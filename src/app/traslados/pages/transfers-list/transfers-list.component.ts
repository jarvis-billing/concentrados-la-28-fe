import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { InternalTransferService } from '../../services/internal-transfer.service';
import { InternalTransfer, InternalTransferStatus } from '../../models/internal-transfer.model';
import { CashToBankFormComponent } from '../../components/cash-to-bank-form/cash-to-bank-form.component';
import { CancelTransferModalComponent } from '../../components/cancel-transfer-modal/cancel-transfer-modal.component';
import { toast } from 'ngx-sonner';
import { formatInTimeZone } from 'date-fns-tz';

@Component({
    selector: 'app-transfers-list',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        CashToBankFormComponent,
        CancelTransferModalComponent
    ],
    templateUrl: './transfers-list.component.html'
})
export class TransfersListComponent implements OnInit {

    private transferService = inject(InternalTransferService);
    private fb = inject(FormBuilder);

    transfers: InternalTransfer[] = [];
    isLoading: boolean = false;

    // Formulario de filtros
    filterForm: FormGroup = this.fb.group({
        fromDate: [this.getDefaultFromDate()],
        toDate: [this.getDefaultToDate()],
        status: ['']
    });

    // Totales
    totalActive: number = 0;
    totalCancelled: number = 0;
    totalAmount: number = 0;

    // Modales
    showNewTransferModal: boolean = false;
    showCancelModal: boolean = false;
    transferToCancel: InternalTransfer | null = null;

    ngOnInit(): void {
        this.loadTransfers();
    }

    private getDefaultFromDate(): string {
        const date = new Date();
        date.setDate(date.getDate() - 30);
        return formatInTimeZone(date, 'America/Bogota', 'yyyy-MM-dd');
    }

    private getDefaultToDate(): string {
        return formatInTimeZone(new Date(), 'America/Bogota', 'yyyy-MM-dd');
    }

    loadTransfers(): void {
        this.isLoading = true;
        const raw = this.filterForm.getRawValue();

        this.transferService.list({
            fromDate: raw.fromDate || undefined,
            toDate: raw.toDate || undefined,
            status: raw.status || undefined
        }).subscribe({
            next: (transfers) => {
                this.transfers = transfers;
                this.calculateTotals();
                this.isLoading = false;
            },
            error: () => {
                toast.error('Error al cargar los traslados');
                this.isLoading = false;
            }
        });
    }

    calculateTotals(): void {
        const active = this.transfers.filter(t => t.status === 'ACTIVO');
        const cancelled = this.transfers.filter(t => t.status === 'ANULADO');
        this.totalActive = active.length;
        this.totalCancelled = cancelled.length;
        this.totalAmount = active.reduce((sum, t) => sum + t.amount, 0);
    }

    applyFilters(): void {
        this.loadTransfers();
    }

    clearFilters(): void {
        this.filterForm.reset({
            fromDate: this.getDefaultFromDate(),
            toDate: this.getDefaultToDate(),
            status: ''
        });
        this.loadTransfers();
    }

    // Modal nueva consignación
    openNewTransfer(): void {
        this.showNewTransferModal = true;
    }

    onNewTransferClosed(): void {
        this.showNewTransferModal = false;
    }

    onTransferCreated(): void {
        this.showNewTransferModal = false;
        this.loadTransfers();
    }

    // Modal anular
    openCancelModal(transfer: InternalTransfer): void {
        this.transferToCancel = transfer;
        this.showCancelModal = true;
    }

    onCancelModalClosed(): void {
        this.showCancelModal = false;
        this.transferToCancel = null;
    }

    onTransferCancelled(): void {
        this.showCancelModal = false;
        this.transferToCancel = null;
        this.loadTransfers();
    }

    // CSV Export
    exportToCSV(): void {
        if (this.transfers.length === 0) {
            toast.warning('No hay datos para exportar');
            return;
        }

        const headers = ['Fecha', 'Monto', 'Banco', 'Cuenta', 'Tipo Cuenta', 'Referencia', 'Responsable', 'Estado', 'Notas'];
        const rows = this.transfers.map(t => [
            t.transferDate,
            t.amount,
            t.destinationBankName || '',
            t.destinationAccountNumber || '',
            t.destinationAccountType || '',
            t.reference,
            t.responsibleUserName || '',
            t.status,
            (t.notes || '').replace(/,/g, ';')
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        const raw = this.filterForm.getRawValue();
        link.download = `traslados_banco_${raw.fromDate}_${raw.toDate}.csv`;
        link.click();
        toast.success('Reporte exportado exitosamente');
    }

    getStatusBadgeClass(status: InternalTransferStatus): string {
        return status === 'ACTIVO' ? 'bg-success' : 'bg-danger';
    }

    getStatusLabel(status: InternalTransferStatus): string {
        return status === 'ACTIVO' ? 'Activo' : 'Anulado';
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

    formatTime(dateTimeStr: string): string {
        if (!dateTimeStr) return '-';
        const date = new Date(dateTimeStr);
        return new Intl.DateTimeFormat('es-CO', {
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    }
}
