import { Component, EventEmitter, inject, Input, Output, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { InternalTransferService } from '../../services/internal-transfer.service';
import { BankAccountType, InternalTransfer } from '../../models/internal-transfer.model';
import { BankAccountService } from '../../../bank-accounts/services/bank-account.service';
import { BankAccountDto } from '../../../bank-accounts/models/bank-account.model';
import { toast } from 'ngx-sonner';
import { HttpErrorResponse } from '@angular/common/http';
import { formatInTimeZone } from 'date-fns-tz';

@Component({
    selector: 'app-cash-to-bank-form',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule],
    templateUrl: './cash-to-bank-form.component.html'
})
export class CashToBankFormComponent implements OnChanges {

    @Input() isOpen: boolean = false;
    @Output() closed = new EventEmitter<void>();
    @Output() transferCreated = new EventEmitter<InternalTransfer>();

    private fb = inject(FormBuilder);
    private transferService = inject(InternalTransferService);
    private bankAccountService = inject(BankAccountService);

    isSaving: boolean = false;
    supportFile: File | null = null;
    supportFileError: string | null = null;
    readonly maxFileSizeMb: number = 5;
    readonly allowedFileTypes: string[] = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

    // Cuentas existentes
    bankAccounts: BankAccountDto[] = [];
    isLoadingAccounts: boolean = false;
    accountMode: 'existing' | 'new' = 'existing';

    form = this.fb.nonNullable.group({
        amount: [0, [Validators.required, Validators.min(1)]],
        bankAccountId: [''],
        accountName: [''],
        accountNumber: [''],
        bankName: [''],
        accountType: ['AHORROS' as BankAccountType],
        reference: ['', Validators.required],
        transferDate: [this.todayIso()],
        notes: ['']
    });

    private todayIso(): string {
        return formatInTimeZone(new Date(), 'America/Bogota', 'yyyy-MM-dd');
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['isOpen']?.currentValue === true) {
            this.loadBankAccounts();
        }
    }

    loadBankAccounts(): void {
        this.isLoadingAccounts = true;
        this.bankAccountService.listActive().subscribe({
            next: (accounts) => {
                this.bankAccounts = accounts;
                this.isLoadingAccounts = false;
                // Si hay cuentas, modo existente por defecto; si no, modo nuevo
                this.accountMode = accounts.length > 0 ? 'existing' : 'new';
                this.updateValidators();
            },
            error: () => {
                this.isLoadingAccounts = false;
                this.accountMode = 'new';
                this.updateValidators();
            }
        });
    }

    setAccountMode(mode: 'existing' | 'new'): void {
        this.accountMode = mode;
        this.form.controls.bankAccountId.setValue('');
        this.form.controls.accountName.setValue('');
        this.form.controls.accountNumber.setValue('');
        this.form.controls.bankName.setValue('');
        this.form.controls.accountType.setValue('AHORROS');
        this.updateValidators();
    }

    private updateValidators(): void {
        if (this.accountMode === 'existing') {
            this.form.controls.bankAccountId.setValidators([Validators.required]);
            this.form.controls.accountNumber.clearValidators();
            this.form.controls.bankName.clearValidators();
            this.form.controls.accountName.clearValidators();
        } else {
            this.form.controls.bankAccountId.clearValidators();
            this.form.controls.accountNumber.setValidators([Validators.required]);
            this.form.controls.bankName.setValidators([Validators.required]);
            this.form.controls.accountName.setValidators([Validators.required]);
        }
        this.form.controls.bankAccountId.updateValueAndValidity();
        this.form.controls.accountNumber.updateValueAndValidity();
        this.form.controls.bankName.updateValueAndValidity();
        this.form.controls.accountName.updateValueAndValidity();
    }

    get canSubmit(): boolean {
        return this.form.valid && !this.isSaving;
    }

    get selectedAccount(): BankAccountDto | undefined {
        const id = this.form.controls.bankAccountId.value;
        return id ? this.bankAccounts.find(a => a.id === id) : undefined;
    }

    onAmountInput(event: Event): void {
        const input = event.target as HTMLInputElement;
        const rawValue = input.value.replace(/\D/g, '');
        const numericValue = rawValue ? parseInt(rawValue, 10) : 0;
        this.form.controls.amount.setValue(numericValue);
        input.value = this.formatCurrencyInput(numericValue);
    }

    onSubmit(): void {
        if (!this.canSubmit) {
            this.form.markAllAsTouched();
            return;
        }

        this.isSaving = true;
        const raw = this.form.getRawValue();

        const request: any = {
            amount: raw.amount,
            reference: raw.reference,
            transferDate: raw.transferDate || undefined,
            notes: raw.notes || undefined,
            supportFile: this.supportFile || undefined
        };

        if (this.accountMode === 'existing') {
            request.bankAccountId = raw.bankAccountId;
        } else {
            request.accountName = raw.accountName || undefined;
            request.accountNumber = raw.accountNumber || undefined;
            request.bankName = raw.bankName || undefined;
            request.accountType = raw.accountType || undefined;
        }

        this.transferService.transferCashToBank(request).subscribe({
            next: (transfer) => {
                toast.success('Consignación registrada exitosamente');
                this.transferCreated.emit(transfer);
                this.resetForm();
                this.isSaving = false;
            },
            error: (err: HttpErrorResponse) => {
                if (err.status === 400) {
                    toast.error('Datos inválidos: ' + (err.error?.message || 'Verifique los campos'));
                } else {
                    toast.error(err.error?.message || 'Error al registrar la consignación');
                }
                this.isSaving = false;
            }
        });
    }

    close(): void {
        this.resetForm();
        this.closed.emit();
    }

    private resetForm(): void {
        this.form.reset({
            amount: 0,
            bankAccountId: '',
            accountName: '',
            accountNumber: '',
            bankName: '',
            accountType: 'AHORROS',
            reference: '',
            transferDate: this.todayIso(),
            notes: ''
        });
        this.supportFile = null;
        this.supportFileError = null;
    }

    onFileSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0] || null;
        this.supportFileError = null;

        if (!file) {
            this.supportFile = null;
            return;
        }

        if (!this.allowedFileTypes.includes(file.type)) {
            this.supportFileError = 'Formato no permitido. Solo PDF, PNG, JPG o WEBP.';
            input.value = '';
            this.supportFile = null;
            return;
        }

        const sizeMb = file.size / (1024 * 1024);
        if (sizeMb > this.maxFileSizeMb) {
            this.supportFileError = `El archivo supera el tamaño máximo de ${this.maxFileSizeMb} MB.`;
            input.value = '';
            this.supportFile = null;
            return;
        }

        this.supportFile = file;
    }

    removeSupportFile(): void {
        this.supportFile = null;
        this.supportFileError = null;
    }

    formatFileSize(bytes: number): string {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    formatCurrencyInput(value: number): string {
        if (!value && value !== 0) return '';
        return new Intl.NumberFormat('es-CO', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(value);
    }
}
