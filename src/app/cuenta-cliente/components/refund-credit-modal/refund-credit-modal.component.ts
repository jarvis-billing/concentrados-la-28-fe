import { Component, EventEmitter, inject, Input, Output, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Client } from '../../../cliente/cliente';
import { ClientCreditService } from '../../services/client-credit.service';
import { RefundCreditRequest, PaymentMethodCredit } from '../../models/client-credit';
import { toast } from 'ngx-sonner';
import { CurrencyFormatDirective } from '../../../directive/currency-format.directive';

@Component({
    selector: 'app-refund-credit-modal',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, CurrencyFormatDirective],
    templateUrl: './refund-credit-modal.component.html',
    styleUrl: './refund-credit-modal.component.css'
})
export class RefundCreditModalComponent implements OnChanges {

    @Input() client: Client | null = null;
    @Input() availableCredit: number = 0;
    @Output() refundProcessed = new EventEmitter<void>();

    fb = inject(FormBuilder);
    creditService = inject(ClientCreditService);

    paymentMethods = Object.values(PaymentMethodCredit);
    isSubmitting: boolean = false;

    refundForm: FormGroup = this.fb.group({
        amount: ['', [Validators.required, Validators.min(1)]],
        paymentMethod: [PaymentMethodCredit.EFECTIVO, Validators.required],
        reference: [''],
        notes: ['']
    });

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['availableCredit'] && this.availableCredit > 0) {
            this.refundForm.patchValue({ amount: this.availableCredit });
        }
    }

    get amountControl() {
        return this.refundForm.get('amount');
    }

    get paymentMethodControl() {
        return this.refundForm.get('paymentMethod');
    }

    get referenceControl() {
        return this.refundForm.get('reference');
    }

    get notesControl() {
        return this.refundForm.get('notes');
    }

    setFullAmount(): void {
        this.refundForm.patchValue({ amount: this.availableCredit });
    }

    onSubmit(): void {
        if (this.refundForm.invalid || !this.client) {
            toast.warning('Complete los campos requeridos');
            return;
        }

        const amount = Number(this.refundForm.value.amount);

        if (amount > this.availableCredit) {
            toast.warning(`El monto no puede ser mayor al saldo disponible (${this.formatCurrency(this.availableCredit)})`);
            return;
        }

        this.isSubmitting = true;

        const request: RefundCreditRequest = {
            clientId: this.client.id,
            amount: amount,
            paymentMethod: this.refundForm.value.paymentMethod,
            reference: this.refundForm.value.reference || undefined,
            notes: this.refundForm.value.notes || undefined
        };

        this.creditService.processRefund(request).subscribe({
            next: () => {
                this.isSubmitting = false;
                toast.success('Devolución procesada exitosamente');
                this.refundForm.reset({
                    paymentMethod: PaymentMethodCredit.EFECTIVO
                });
                this.closeModal();
                this.refundProcessed.emit();
            },
            error: (err) => {
                this.isSubmitting = false;
                toast.error('Error al procesar la devolución: ' + (err.error?.message || 'Intente nuevamente'));
            }
        });
    }

    closeModal(): void {
        const modal = document.getElementById('refundCreditModal');
        if (modal) {
            modal.classList.remove('show');
            modal.style.display = 'none';
            document.body.classList.remove('modal-open');
            const backdrop = document.querySelector('.modal-backdrop');
            backdrop?.remove();
        }
    }

    private formatCurrency(value: number): string {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            minimumFractionDigits: 0
        }).format(value);
    }
}
