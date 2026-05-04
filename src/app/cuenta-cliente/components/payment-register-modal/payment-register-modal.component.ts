import { Component, EventEmitter, inject, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Client } from '../../../cliente/cliente';
import { ClientAccountService } from '../../services/client-account.service';
import { ClientCreditService } from '../../services/client-credit.service';
import { AccountPayment, PaymentMethod } from '../../models/client-account';
import { UseCreditRequest } from '../../models/client-credit';
import { LoginUserService } from '../../../auth/login/loginUser.service';
import { toast } from 'ngx-sonner';
import { formatInTimeZone } from 'date-fns-tz';
import { CurrencyFormatDirective } from '../../../directive/currency-format.directive';
import jsPDF from 'jspdf';
import { forkJoin, of } from 'rxjs';
import { BankAccountSelectComponent } from '../../../shared/components/bank-account-select/bank-account-select.component';

@Component({
    selector: 'app-payment-register-modal',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, CurrencyFormatDirective, BankAccountSelectComponent],
    templateUrl: './payment-register-modal.component.html',
    styleUrl: './payment-register-modal.component.css'
})
export class PaymentRegisterModalComponent {

    @Input() client: Client | null = null;
    @Input() maxAmount: number = 0;
    @Input() clientCreditBalance: number = 0;
    @Output() paymentRegistered = new EventEmitter<void>();

    fb = inject(FormBuilder);
    accountService = inject(ClientAccountService);
    creditService = inject(ClientCreditService);
    loginUserService = inject(LoginUserService);

    paymentMethods = Object.values(PaymentMethod).filter(m => m !== PaymentMethod.SALDO_FAVOR);
    isSubmitting: boolean = false;
    creditToApply: number = 0;
    showPrintConfirmation: boolean = false;
    
    // Datos para el comprobante de pago
    lastPaymentData: {
        amount: number;
        paymentMethod: string;
        reference?: string;
        paymentDate: Date;
        createdBy: string;
        previousBalance: number;
        newBalance: number;
    } | null = null;

    paymentForm: FormGroup = this.fb.group({
        amount: ['', [Validators.required, Validators.min(1)]],
        paymentMethod: [PaymentMethod.EFECTIVO, Validators.required],
        bankAccountId: [''],
        reference: [''],
        notes: ['']
    });

    get amountControl() {
        return this.paymentForm.get('amount');
    }

    get totalPayment(): number {
        return this.creditToApply + Number(this.paymentForm.value.amount || 0);
    }

    get remainingAfterCredit(): number {
        return Math.max(0, this.maxAmount - this.creditToApply);
    }

    get maxCreditApplicable(): number {
        return Math.min(this.clientCreditBalance, this.maxAmount);
    }

    applyCredit(): void {
        if (this.clientCreditBalance <= 0) {
            toast.warning('El cliente no tiene saldo a favor disponible.');
            return;
        }
        this.creditToApply = this.maxCreditApplicable;
        toast.success(`Se aplicará ${this.formatCurrency(this.creditToApply)} del saldo a favor.`);
    }

    removeCredit(): void {
        this.creditToApply = 0;
        toast.info('Saldo a favor removido.');
    }

    applyCreditPartial(amount: number): void {
        if (amount <= 0 || amount > this.clientCreditBalance || amount > this.maxAmount) return;
        this.creditToApply = amount;
    }

    onSubmit(): void {
        if (!this.client) {
            toast.warning('Seleccione un cliente');
            return;
        }

        const cashAmount = Number(this.paymentForm.value.amount || 0);
        const totalPaying = this.creditToApply + cashAmount;

        if (totalPaying <= 0) {
            toast.warning('Ingrese un monto de pago o aplique saldo a favor');
            return;
        }

        if (totalPaying > this.maxAmount) {
            toast.warning(`El monto total no puede ser mayor a la deuda pendiente (${this.formatCurrency(this.maxAmount)})`);
            return;
        }

        if (this.creditToApply > 0 && cashAmount <= 0 && this.paymentForm.invalid) {
            // Solo paga con saldo a favor, no necesita validar el form de monto
        } else if (cashAmount > 0 && this.paymentForm.invalid) {
            toast.warning('Complete los campos requeridos');
            return;
        }

        this.isSubmitting = true;
        const user = this.loginUserService.getUserFromToken();
        const previousBalance = this.maxAmount;
        const newBalance = previousBalance - totalPaying;

        // Preparar observables
        const creditNotes = this.creditToApply > 0 ? `Pago con saldo a favor: ${this.formatCurrency(this.creditToApply)}` : '';
        const cashNotes = cashAmount > 0 ? this.paymentForm.value.notes || '' : '';
        const combinedNotes = [creditNotes, cashNotes].filter(n => n).join(' | ');

        // 1) Registrar pago con saldo a favor si aplica
        const creditObs$ = this.creditToApply > 0
            ? this.creditService.useCredit({
                clientId: this.client.id,
                amount: this.creditToApply,
                notes: `Abono a cuenta crédito`
            } as UseCreditRequest)
            : of(null);

        // Validate bank account for transfers
        const payMethod = this.paymentForm.value.paymentMethod || PaymentMethod.EFECTIVO;
        if (cashAmount > 0 && payMethod === PaymentMethod.TRANSFERENCIA && !this.paymentForm.value.bankAccountId) {
            toast.warning('Seleccione una cuenta bancaria para transferencias');
            this.isSubmitting = false;
            return;
        }

        // 2) Registrar pago normal si hay monto en efectivo/otro
        const paymentObs$ = cashAmount > 0
            ? this.accountService.registerPayment({
                id: '',
                clientAccountId: this.client.id,
                amount: cashAmount,
                paymentMethod: payMethod,
                bankAccountId: payMethod === PaymentMethod.TRANSFERENCIA ? this.paymentForm.value.bankAccountId || undefined : undefined,
                reference: this.paymentForm.value.reference || undefined,
                notes: combinedNotes || undefined,
                paymentDate: formatInTimeZone(new Date(), 'America/Bogota', "yyyy-MM-dd'T'HH:mm:ssXXX"),
                createdBy: user?.username || '',
                createdAt: ''
            })
            : of(null);

        // 3) Si solo paga con saldo a favor (sin cash), registrar un pago con método SALDO_FAVOR
        const creditOnlyPaymentObs$ = (this.creditToApply > 0 && cashAmount <= 0)
            ? this.accountService.registerPayment({
                id: '',
                clientAccountId: this.client.id,
                amount: this.creditToApply,
                paymentMethod: PaymentMethod.SALDO_FAVOR,
                reference: undefined,
                notes: combinedNotes || 'Pago con saldo a favor',
                paymentDate: formatInTimeZone(new Date(), 'America/Bogota', "yyyy-MM-dd'T'HH:mm:ssXXX"),
                createdBy: user?.username || '',
                createdAt: ''
            })
            : of(null);

        forkJoin([creditObs$, cashAmount > 0 ? paymentObs$ : creditOnlyPaymentObs$]).subscribe({
            next: () => {
                this.isSubmitting = false;

                const paymentMethodLabel = this.creditToApply > 0 && cashAmount > 0
                    ? `SALDO_FAVOR + ${this.paymentForm.value.paymentMethod}`
                    : this.creditToApply > 0
                        ? 'SALDO_FAVOR'
                        : this.paymentForm.value.paymentMethod;

                this.lastPaymentData = {
                    amount: totalPaying,
                    paymentMethod: paymentMethodLabel,
                    reference: this.paymentForm.value.reference || undefined,
                    paymentDate: new Date(),
                    createdBy: user?.username || '',
                    previousBalance: previousBalance,
                    newBalance: newBalance
                };

                this.paymentForm.reset({
                    paymentMethod: PaymentMethod.EFECTIVO
                });
                this.creditToApply = 0;
                this.closeModal();
                this.showPrintConfirmation = true;
                this.paymentRegistered.emit();
            },
            error: (err) => {
                this.isSubmitting = false;
                const e = err?.error;
                if (e?.errors && typeof e.errors === 'object') {
                    const msgs = Object.values(e.errors as Record<string, string>).filter(Boolean) as string[];
                    if (msgs.length) { msgs.forEach(m => toast.warning(m)); return; }
                }
                toast.error('Error al registrar el pago: ' + (e?.message || 'Intente nuevamente'));
            }
        });
    }

    closeModal(): void {
        const modal = document.getElementById('paymentRegisterModal');
        if (modal) {
            modal.classList.remove('show');
            modal.style.display = 'none';
            document.body.classList.remove('modal-open');
            const backdrop = document.querySelector('.modal-backdrop');
            backdrop?.remove();
        }
    }

    closePrintConfirmation(): void {
        this.showPrintConfirmation = false;
        this.lastPaymentData = null;
    }

    printReceipt(): void {
        if (this.lastPaymentData && this.client) {
            this.generatePaymentReceiptPdf();
        }
        this.closePrintConfirmation();
    }

    private generatePaymentReceiptPdf(): void {
        if (!this.lastPaymentData || !this.client) return;

        const doc = new jsPDF('portrait', 'mm', [80, 150]); // Tamaño ticket
        const pageWidth = doc.internal.pageSize.getWidth();
        let yPos = 10;

        // Encabezado
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('COMPROBANTE DE PAGO', pageWidth / 2, yPos, { align: 'center' });
        yPos += 8;

        // Línea separadora
        doc.setLineWidth(0.5);
        doc.line(5, yPos, pageWidth - 5, yPos);
        yPos += 6;

        // Datos del cliente
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('Cliente:', 5, yPos);
        doc.setFont('helvetica', 'normal');
        const clientName = this.client.businessName || `${this.client.name} ${this.client.surname}`;
        doc.text(clientName, 5, yPos + 4);
        yPos += 12;

        if (this.client.idNumber) {
            doc.setFont('helvetica', 'bold');
            doc.text('Documento:', 5, yPos);
            doc.setFont('helvetica', 'normal');
            doc.text(this.client.idNumber, 30, yPos);
            yPos += 6;
        }

        // Línea separadora
        doc.line(5, yPos, pageWidth - 5, yPos);
        yPos += 6;

        // Datos del pago
        doc.setFont('helvetica', 'bold');
        doc.text('Fecha:', 5, yPos);
        doc.setFont('helvetica', 'normal');
        doc.text(this.formatDateTime(this.lastPaymentData.paymentDate), 20, yPos);
        yPos += 5;

        doc.setFont('helvetica', 'bold');
        doc.text('Método:', 5, yPos);
        doc.setFont('helvetica', 'normal');
        doc.text(this.lastPaymentData.paymentMethod, 22, yPos);
        yPos += 5;

        if (this.lastPaymentData.reference) {
            doc.setFont('helvetica', 'bold');
            doc.text('Ref:', 5, yPos);
            doc.setFont('helvetica', 'normal');
            doc.text(this.lastPaymentData.reference, 14, yPos);
            yPos += 5;
        }

        // Línea separadora
        yPos += 2;
        doc.line(5, yPos, pageWidth - 5, yPos);
        yPos += 6;

        // Montos
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text('Deuda anterior:', 5, yPos);
        doc.text(this.formatCurrency(this.lastPaymentData.previousBalance), pageWidth - 5, yPos, { align: 'right' });
        yPos += 5;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('ABONO:', 5, yPos);
        doc.text(this.formatCurrency(this.lastPaymentData.amount), pageWidth - 5, yPos, { align: 'right' });
        yPos += 6;

        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text('Saldo pendiente:', 5, yPos);
        doc.text(this.formatCurrency(this.lastPaymentData.newBalance), pageWidth - 5, yPos, { align: 'right' });
        yPos += 8;

        // Línea separadora
        doc.line(5, yPos, pageWidth - 5, yPos);
        yPos += 5;

        // Pie
        doc.setFontSize(7);
        doc.text(`Registrado por: ${this.lastPaymentData.createdBy}`, 5, yPos);
        yPos += 4;
        doc.text(`Impreso: ${this.formatDateTime(new Date())}`, 5, yPos);

        // Imprimir
        const pdfUrl = doc.output('bloburl');
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = pdfUrl.toString();
        document.body.appendChild(iframe);
        iframe.contentWindow?.print();
    }

    private formatDateTime(date: Date): string {
        return date.toLocaleString('es-CO', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    private formatCurrency(value: number): string {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(value);
    }

    setFullAmount(): void {
        this.paymentForm.patchValue({ amount: this.remainingAfterCredit });
    }
}
