import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { BankAccountService } from '../../services/bank-account.service';
import { BankAccountDto, BankAccountType, CreateBankAccountRequest } from '../../models/bank-account.model';
import { toast } from 'ngx-sonner';

@Component({
    selector: 'app-bank-accounts-page',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule],
    templateUrl: './bank-accounts-page.component.html',
    styleUrl: './bank-accounts-page.component.css'
})
export class BankAccountsPageComponent implements OnInit {

    private bankAccountService = inject(BankAccountService);
    private fb = inject(FormBuilder);

    accounts: BankAccountDto[] = [];
    isLoading: boolean = false;
    showInactive: boolean = false;

    // Modal
    showModal: boolean = false;
    editingAccount: BankAccountDto | null = null;
    isSaving: boolean = false;

    form: FormGroup = this.fb.nonNullable.group({
        name: ['', Validators.required],
        bankName: ['', Validators.required],
        accountNumber: ['', Validators.required],
        accountType: ['AHORROS' as BankAccountType, Validators.required],
        notes: ['']
    });

    ngOnInit(): void {
        this.loadAccounts();
    }

    loadAccounts(): void {
        this.isLoading = true;
        const call = this.showInactive
            ? this.bankAccountService.listAll()
            : this.bankAccountService.listActive();

        call.subscribe({
            next: (accounts) => {
                this.accounts = accounts;
                this.isLoading = false;
            },
            error: () => {
                toast.error('Error al cargar las cuentas bancarias');
                this.isLoading = false;
            }
        });
    }

    toggleShowInactive(): void {
        this.showInactive = !this.showInactive;
        this.loadAccounts();
    }

    // ---- Modal CRUD ----

    openNewAccountModal(): void {
        this.editingAccount = null;
        this.form.reset({
            name: '',
            bankName: '',
            accountNumber: '',
            accountType: 'AHORROS',
            notes: ''
        });
        this.showModal = true;
    }

    openEditModal(account: BankAccountDto): void {
        this.editingAccount = account;
        this.form.patchValue({
            name: account.name,
            bankName: account.bankName,
            accountNumber: account.accountNumber,
            accountType: account.accountType,
            notes: account.notes || ''
        });
        this.showModal = true;
    }

    closeModal(): void {
        this.showModal = false;
        this.editingAccount = null;
    }

    onSave(): void {
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            return;
        }

        this.isSaving = true;
        const raw = this.form.getRawValue();
        const request: CreateBankAccountRequest = {
            name: raw.name,
            bankName: raw.bankName,
            accountNumber: raw.accountNumber,
            accountType: raw.accountType,
            notes: raw.notes || undefined
        };

        if (this.editingAccount) {
            this.bankAccountService.update(this.editingAccount.id, request).subscribe({
                next: () => {
                    toast.success('Cuenta actualizada correctamente');
                    this.closeModal();
                    this.loadAccounts();
                    this.isSaving = false;
                },
                error: (err) => {
                    toast.error('Error al actualizar: ' + (err.error?.message || 'Intente nuevamente'));
                    this.isSaving = false;
                }
            });
        } else {
            this.bankAccountService.create(request).subscribe({
                next: () => {
                    toast.success('Cuenta creada correctamente');
                    this.closeModal();
                    this.loadAccounts();
                    this.isSaving = false;
                },
                error: (err) => {
                    toast.error('Error al crear: ' + (err.error?.message || 'Intente nuevamente'));
                    this.isSaving = false;
                }
            });
        }
    }

    confirmDeactivate(account: BankAccountDto): void {
        toast.warning(`¿Desactivar la cuenta "${account.name}"?`, {
            description: 'La cuenta quedará inactiva pero se conservará el historial.',
            duration: 10000,
            action: {
                label: 'Sí, desactivar',
                onClick: () => this.deactivate(account)
            },
            cancel: {
                label: 'Cancelar',
                onClick: () => {}
            }
        });
    }

    private deactivate(account: BankAccountDto): void {
        this.bankAccountService.deactivate(account.id).subscribe({
            next: () => {
                toast.success('Cuenta desactivada');
                this.loadAccounts();
            },
            error: (err) => {
                toast.error('Error al desactivar: ' + (err.error?.message || 'Intente nuevamente'));
            }
        });
    }

    // ---- Helpers ----

    maskAccountNumber(num: string): string {
        if (!num || num.length <= 4) return num || '-';
        return '****' + num.slice(-4);
    }

    getAccountTypeLabel(type: BankAccountType): string {
        return type === 'AHORROS' ? 'Ahorros' : 'Corriente';
    }

    formatDate(dateStr: string): string {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        return new Intl.DateTimeFormat('es-CO', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        }).format(date);
    }
}
