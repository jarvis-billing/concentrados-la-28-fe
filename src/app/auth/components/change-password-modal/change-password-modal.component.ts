import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { toast } from 'ngx-sonner';
import { UserService } from '../../../users/user.service';

function passwordsMatchValidator(g: AbstractControl) {
  const a = g.get('newPassword')?.value;
  const b = g.get('confirmPassword')?.value;
  return a && b && a !== b ? { mismatch: true } : null;
}

@Component({
  selector: 'app-change-password-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    @if (show) {
      <div class="cpw-backdrop" (click)="close()"></div>
      <div class="cpw-panel shadow-lg">
        <div class="cpw-header">
          <span><i class="bi bi-key-fill me-2 text-warning"></i>Cambiar contraseña</span>
          <button type="button" class="btn-close btn-close-white" (click)="close()"></button>
        </div>

        <form [formGroup]="form" (ngSubmit)="submit()" class="cpw-body" autocomplete="off">

          <div class="cpw-field">
            <label class="form-label fw-semibold">Nueva contraseña</label>
            <div class="input-group">
              <input
                [type]="showNew ? 'text' : 'password'"
                class="form-control"
                formControlName="newPassword"
                placeholder="Mínimo 6 caracteres"
                [class.is-invalid]="f['newPassword'].invalid && f['newPassword'].touched"
                autocomplete="new-password">
              <button type="button" class="btn btn-outline-secondary" (click)="showNew = !showNew" tabindex="-1">
                <i class="bi" [class.bi-eye]="!showNew" [class.bi-eye-slash]="showNew"></i>
              </button>
              <div class="invalid-feedback">Mínimo 6 caracteres requeridos.</div>
            </div>
          </div>

          <div class="cpw-field">
            <label class="form-label fw-semibold">Confirmar contraseña</label>
            <div class="input-group">
              <input
                [type]="showConfirm ? 'text' : 'password'"
                class="form-control"
                formControlName="confirmPassword"
                placeholder="Repite la nueva contraseña"
                [class.is-invalid]="(f['confirmPassword'].invalid && f['confirmPassword'].touched) || (form.hasError('mismatch') && f['confirmPassword'].touched)"
                autocomplete="new-password">
              <button type="button" class="btn btn-outline-secondary" (click)="showConfirm = !showConfirm" tabindex="-1">
                <i class="bi" [class.bi-eye]="!showConfirm" [class.bi-eye-slash]="showConfirm"></i>
              </button>
              @if (form.hasError('mismatch') && f['confirmPassword'].touched) {
                <div class="invalid-feedback d-block">Las contraseñas no coinciden.</div>
              }
            </div>
          </div>

          <div class="cpw-actions">
            <button type="button" class="btn btn-outline-secondary" (click)="close()" [disabled]="isSaving">
              Cancelar
            </button>
            <button type="submit" class="btn btn-warning fw-semibold" [disabled]="isSaving">
              @if (isSaving) {
                <span class="spinner-border spinner-border-sm me-1"></span>
              } @else {
                <i class="bi bi-check-lg me-1"></i>
              }
              Cambiar contraseña
            </button>
          </div>

        </form>
      </div>
    }
  `,
  styles: [`
    .cpw-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.45);
      z-index: 1200;
    }
    .cpw-panel {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 1201;
      background: #fff;
      border-radius: 14px;
      width: min(420px, 94vw);
      overflow: hidden;
    }
    .cpw-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 18px;
      background: #212529;
      color: #fff;
      font-weight: 600;
      font-size: 1rem;
    }
    .cpw-body {
      padding: 20px 18px 18px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .cpw-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .cpw-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding-top: 6px;
      border-top: 1px solid #dee2e6;
      margin-top: 4px;
    }
    @media (max-width: 480px) {
      .cpw-panel {
        top: auto;
        bottom: 0;
        left: 0;
        right: 0;
        transform: none;
        width: 100%;
        border-radius: 18px 18px 0 0;
      }
    }
  `]
})
export class ChangePasswordModalComponent {
  @Input() show = false;
  @Output() closed = new EventEmitter<void>();

  private userService = inject(UserService);

  isSaving = false;
  showNew = false;
  showConfirm = false;

  form = new FormGroup({
    newPassword: new FormControl('', [Validators.required, Validators.minLength(6)]),
    confirmPassword: new FormControl('', Validators.required),
  }, { validators: passwordsMatchValidator });

  get f() {
    return this.form.controls;
  }

  close(): void {
    this.form.reset();
    this.showNew = false;
    this.showConfirm = false;
    this.closed.emit();
  }

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.isSaving = true;
    this.userService.changeOwnPassword({ newPassword: this.form.value.newPassword! }).subscribe({
      next: () => {
        toast.success('Contraseña actualizada correctamente');
        this.isSaving = false;
        this.close();
      },
      error: () => {
        toast.error('Error al cambiar la contraseña. Inténtalo de nuevo.');
        this.isSaving = false;
      },
    });
  }
}
