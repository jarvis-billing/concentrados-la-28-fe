import { Component, EventEmitter, inject, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Client } from '../../../cliente/cliente';
import { ClientCreditService } from '../../services/client-credit.service';
import { DepositCreditRequest, PaymentMethodCredit } from '../../models/client-credit';
import { LoginUserService } from '../../../auth/login/loginUser.service';
import { toast } from 'ngx-sonner';
import { CurrencyFormatDirective } from '../../../directive/currency-format.directive';
import { BankAccountSelectComponent } from '../../../shared/components/bank-account-select/bank-account-select.component';

@Component({
    selector: 'app-credit-register-modal',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, CurrencyFormatDirective, BankAccountSelectComponent],
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
        bankAccountId: [''],
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

        const isTransfer = this.creditForm.value.paymentMethod === PaymentMethodCredit.TRANSFERENCIA;
        if (isTransfer && !this.creditForm.value.bankAccountId) {
            toast.warning('Seleccione una cuenta bancaria para transferencias');
            return;
        }
        const request: DepositCreditRequest = {
            clientId: this.client.id,
            amount: Number(this.creditForm.value.amount),
            paymentMethod: this.creditForm.value.paymentMethod,
            bankAccountId: isTransfer ? this.creditForm.value.bankAccountId || undefined : undefined,
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
                const e = err?.error;
                if (e?.errors && typeof e.errors === 'object') {
                    const msgs = Object.values(e.errors as Record<string, string>).filter(Boolean) as string[];
                    if (msgs.length) { msgs.forEach(m => toast.warning(m)); return; }
                }
                toast.error('Error al registrar el anticipo: ' + (e?.message || 'Intente nuevamente'));
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
