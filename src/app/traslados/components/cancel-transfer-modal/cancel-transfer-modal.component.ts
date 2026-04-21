import { Component, EventEmitter, inject, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InternalTransferService } from '../../services/internal-transfer.service';
import { InternalTransfer } from '../../models/internal-transfer.model';
import { toast } from 'ngx-sonner';

@Component({
    selector: 'app-cancel-transfer-modal',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './cancel-transfer-modal.component.html'
})
export class CancelTransferModalComponent {

    @Input() isOpen: boolean = false;
    @Input() transfer: InternalTransfer | null = null;
    @Output() closed = new EventEmitter<void>();
    @Output() transferCancelled = new EventEmitter<InternalTransfer>();

    private transferService = inject(InternalTransferService);

    reason: string = '';
    isCancelling: boolean = false;

    onConfirm(): void {
        if (!this.transfer) return;

        this.isCancelling = true;
        this.transferService.cancel(this.transfer.id, this.reason || undefined).subscribe({
            next: (updated) => {
                toast.success('Traslado anulado correctamente');
                this.transferCancelled.emit(updated);
                this.close();
                this.isCancelling = false;
            },
            error: (err) => {
                toast.error('Error al anular: ' + (err.error?.message || 'Intente nuevamente'));
                this.isCancelling = false;
            }
        });
    }

    close(): void {
        this.reason = '';
        this.closed.emit();
    }

    formatCurrency(value: number): string {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(value);
    }
}
