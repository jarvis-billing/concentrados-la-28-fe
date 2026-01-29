import { Component, EventEmitter, inject, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Client } from '../../../cliente/cliente';
import { ClientCreditService } from '../../services/client-credit.service';
import { DepositCreditRequest, PaymentMethodCredit } from '../../models/client-credit';
import { LoginUserService } from '../../../auth/login/loginUser.service';
import { toast } from 'ngx-sonner';
import { CurrencyFormatDirective } from '../../../directive/currency-format.directive';

@Component({
    selector: 'app-credit-register-modal',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, CurrencyFormatDirective],
    templateUrl: './credit-register-modal.component.html',
    styleUrl: './credit-register-modal.component.css'
})
export class CreditRegisterModalComponent {

    @Input() client: Client | null = null;
    @Output() creditRegistered = new EventEmitter<void>();

    fb = inject(FormBuilder);
    creditService = inject(ClientCreditService);
    loginUserService = inject(LoginUserService);

    paymentMethods = Object.values(PaymentMethodCredit);
    isSubmitting: boolean = false;

    creditForm: FormGroup = this.fb.group({
        amount: ['', [Validators.required, Validators.min(1)]],
        paymentMethod: [PaymentMethodCredit.EFECTIVO, Validators.required],
        reference: [''],
        notes: ['']
    });

    get amountControl() {
        return this.creditForm.get('amount');
    }

    onSubmit(): void {
        if (this.creditForm.invalid || !this.client) {
            toast.warning('Complete los campos requeridos');
            return;
        }

        this.isSubmitting = true;

        const request: DepositCreditRequest = {
            clientId: this.client.id,
            amount: Number(this.creditForm.value.amount),
            paymentMethod: this.creditForm.value.paymentMethod,
            reference: this.creditForm.value.reference || undefined,
            notes: this.creditForm.value.notes || undefined
        };

        this.creditService.registerDeposit(request).subscribe({
            next: () => {
                this.isSubmitting = false;
                this.creditForm.reset({
                    paymentMethod: PaymentMethodCredit.EFECTIVO
                });
                this.closeModal();
                this.creditRegistered.emit();
            },
            error: (err) => {
                this.isSubmitting = false;
                toast.error('Error al registrar el anticipo: ' + (err.error?.message || 'Intente nuevamente'));
            }
        });
    }

    closeModal(): void {
        const modal = document.getElementById('creditRegisterModal');
        if (modal) {
            modal.classList.remove('show');
            modal.style.display = 'none';
            document.body.classList.remove('modal-open');
            const backdrop = document.querySelector('.modal-backdrop');
            backdrop?.remove();
        }
    }
}
