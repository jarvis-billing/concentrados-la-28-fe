import { Component, EventEmitter, inject, Input, Output, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Client } from '../../../cliente/cliente';
import { ClientCreditService } from '../../services/client-credit.service';
import { UseCreditRequest } from '../../models/client-credit';
import { toast } from 'ngx-sonner';
import { CurrencyFormatDirective } from '../../../directive/currency-format.directive';

@Component({
    selector: 'app-use-credit-modal',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, CurrencyFormatDirective],
    templateUrl: './use-credit-modal.component.html',
    styleUrl: './use-credit-modal.component.css'
})
export class UseCreditModalComponent implements OnChanges {

    @Input() client: Client | null = null;
    @Input() availableCredit: number = 0;
    @Input() billingTotal: number = 0;
    @Output() creditUsed = new EventEmitter<{ amount: number }>();
    @Output() cancelled = new EventEmitter<void>();

    fb = inject(FormBuilder);
    creditService = inject(ClientCreditService);

    isSubmitting: boolean = false;
    suggestedAmount: number = 0;

    creditForm: FormGroup = this.fb.group({
        amount: ['', [Validators.required, Validators.min(1)]]
    });

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['availableCredit'] || changes['billingTotal']) {
            this.suggestedAmount = Math.min(this.availableCredit, this.billingTotal);
            this.creditForm.patchValue({ amount: this.suggestedAmount });
        }
    }

    get amountControl() {
        return this.creditForm.get('amount');
    }

    get maxUsable(): number {
        return Math.min(this.availableCredit, this.billingTotal);
    }

    onConfirm(): void {
        if (this.creditForm.invalid || !this.client) {
            toast.warning('Ingrese un monto válido');
            return;
        }

        const amount = Number(this.creditForm.value.amount);
        
        if (amount > this.availableCredit) {
            toast.warning(`El monto no puede ser mayor al saldo disponible ($${this.availableCredit})`);
            return;
        }

        if (amount > this.billingTotal) {
            toast.warning(`El monto no puede ser mayor al total de la factura ($${this.billingTotal})`);
            return;
        }

        this.creditUsed.emit({ amount });
        this.closeModal();
    }

    onCancel(): void {
        this.cancelled.emit();
        this.closeModal();
    }

    setFullAmount(): void {
        this.creditForm.patchValue({ amount: this.maxUsable });
    }

    closeModal(): void {
        const modal = document.getElementById('useCreditModal');
        if (modal) {
            modal.classList.remove('show');
            modal.style.display = 'none';
            document.body.classList.remove('modal-open');
            const backdrop = document.querySelector('.modal-backdrop');
            backdrop?.remove();
        }
    }
}
