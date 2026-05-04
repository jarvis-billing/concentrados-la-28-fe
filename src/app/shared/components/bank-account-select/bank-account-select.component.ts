import { Component, Input, Output, EventEmitter, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import { BankAccountService } from '../../../bank-accounts/services/bank-account.service';
import { BankAccountDto } from '../../../bank-accounts/models/bank-account.model';

@Component({
  selector: 'app-bank-account-select',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="mb-3" *ngIf="isTransferMethod">
      <label class="form-label fw-bold">
        Cuenta Bancaria
        <span class="text-danger" *ngIf="required">*</span>
      </label>
      <select
        class="form-select"
        [formControl]="accountControl"
        [class.is-invalid]="accountControl.invalid && accountControl.touched"
      >
        <option value="" disabled>Seleccione cuenta...</option>
        <option *ngFor="let a of bankAccounts" [value]="a.id">
          {{ a.bankName }} - {{ a.accountNumber }}
        </option>
      </select>
      <div class="invalid-feedback" *ngIf="accountControl.invalid && accountControl.touched">
        Cuenta bancaria requerida
      </div>
    </div>
  `,
})
export class BankAccountSelectComponent implements OnInit, OnDestroy {

  @Input() paymentMethod: string = 'EFECTIVO';
  @Input() bankAccountId: string | null = null;
  @Input() required: boolean = false;
  @Output() bankAccountIdChange = new EventEmitter<string | null>();

  bankAccounts: BankAccountDto[] = [];

  private bankService = inject(BankAccountService);
  private fb = inject(FormBuilder);
  private valueChangesSub?: Subscription;

  form: FormGroup = this.fb.group({
    accountId: ['']
  });

  get accountControl() {
    return this.form.get('accountId')!;
  }

  get isTransferMethod(): boolean {
    return this.paymentMethod === 'TRANSFERENCIA';
  }

  ngOnInit(): void {
    this.loadBankAccounts();
    // Single subscription to user-driven value changes
    this.valueChangesSub = this.accountControl.valueChanges.subscribe(value => {
      if (this.isTransferMethod) {
        this.bankAccountIdChange.emit(value || null);
      }
    });
    this.updateControl();
  }

  ngOnDestroy(): void {
    this.valueChangesSub?.unsubscribe();
  }

  private loadBankAccounts(): void {
    this.bankService.listActive().subscribe({
      next: (accounts) => {
        this.bankAccounts = accounts;
      },
      error: () => {
        this.bankAccounts = [];
      }
    });
  }

  ngOnChanges(): void {
    this.updateControl();
  }

  private updateControl(): void {
    const ctrl = this.accountControl;
    if (!this.isTransferMethod) {
      ctrl.setValue('', { emitEvent: false });
      ctrl.clearValidators();
      ctrl.setErrors(null);
      ctrl.markAsUntouched();
      ctrl.updateValueAndValidity({ emitEvent: false });
      // Do NOT emit here; parent already knows method is not transfer
    } else {
      if (this.bankAccountId) {
        ctrl.setValue(this.bankAccountId, { emitEvent: false });
      } else {
        ctrl.setValue('', { emitEvent: false });
      }
      if (this.required) {
        ctrl.setValidators([Validators.required]);
      } else {
        ctrl.clearValidators();
      }
      ctrl.updateValueAndValidity({ emitEvent: false });
    }
  }

  /** Valida el control y muestra errores. Retorna true si es válido. */
  validate(): boolean {
    if (!this.isTransferMethod) return true;
    this.accountControl.markAsTouched();
    this.accountControl.updateValueAndValidity();
    return this.accountControl.valid;
  }

  /** Obtiene el nombre de la cuenta bancaria seleccionada. */
  get selectedAccountName(): string | null {
    const id = this.accountControl.value;
    if (!id) return null;
    const acc = this.bankAccounts.find(a => a.id === id);
    return acc ? `${acc.bankName} - ${acc.accountNumber}` : null;
  }
}
