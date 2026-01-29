import { Component, EventEmitter, inject, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Client } from '../../../cliente/cliente';
import { ClientAccountService } from '../../services/client-account.service';
import { AccountPayment, PaymentMethod } from '../../models/client-account';
import { LoginUserService } from '../../../auth/login/loginUser.service';
import { toast } from 'ngx-sonner';
import { formatInTimeZone } from 'date-fns-tz';
import { CurrencyFormatDirective } from '../../../directive/currency-format.directive';
import jsPDF from 'jspdf';

@Component({
    selector: 'app-payment-register-modal',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, CurrencyFormatDirective],
    templateUrl: './payment-register-modal.component.html',
    styleUrl: './payment-register-modal.component.css'
})
export class PaymentRegisterModalComponent {

    @Input() client: Client | null = null;
    @Input() maxAmount: number = 0;
    @Output() paymentRegistered = new EventEmitter<void>();

    fb = inject(FormBuilder);
    accountService = inject(ClientAccountService);
    loginUserService = inject(LoginUserService);

    paymentMethods = Object.values(PaymentMethod);
    isSubmitting: boolean = false;
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
        reference: [''],
        notes: ['']
    });

    get amountControl() {
        return this.paymentForm.get('amount');
    }

    onSubmit(): void {
        if (this.paymentForm.invalid || !this.client) {
            toast.warning('Complete los campos requeridos');
            return;
        }

        const amount = Number(this.paymentForm.value.amount);
        if (amount > this.maxAmount) {
            toast.warning(`El monto no puede ser mayor a la deuda pendiente (${this.maxAmount})`);
            return;
        }

        this.isSubmitting = true;
        const user = this.loginUserService.getUserFromToken();

        const payment: AccountPayment = {
            id: '',
            clientAccountId: '',
            amount: amount,
            paymentMethod: this.paymentForm.value.paymentMethod,
            reference: this.paymentForm.value.reference || undefined,
            notes: this.paymentForm.value.notes || undefined,
            paymentDate: formatInTimeZone(new Date(), 'America/Bogota', "yyyy-MM-dd'T'HH:mm:ssXXX"),
            createdBy: user?.username || '',
            createdAt: ''
        };

        const previousBalance = this.maxAmount;
        const newBalance = previousBalance - amount;

        this.accountService.registerPayment({
            ...payment,
            clientAccountId: this.client.id
        }).subscribe({
            next: () => {
                this.isSubmitting = false;
                
                // Guardar datos para el comprobante
                this.lastPaymentData = {
                    amount: amount,
                    paymentMethod: this.paymentForm.value.paymentMethod,
                    reference: this.paymentForm.value.reference || undefined,
                    paymentDate: new Date(),
                    createdBy: user?.username || '',
                    previousBalance: previousBalance,
                    newBalance: newBalance
                };
                
                this.paymentForm.reset({
                    paymentMethod: PaymentMethod.EFECTIVO
                });
                this.closeModal();
                this.showPrintConfirmation = true;
                this.paymentRegistered.emit();
            },
            error: (err) => {
                this.isSubmitting = false;
                toast.error('Error al registrar el pago: ' + (err.error?.message || 'Intente nuevamente'));
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
        this.paymentForm.patchValue({ amount: this.maxAmount });
    }
}
