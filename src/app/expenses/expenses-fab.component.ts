import { Component, EventEmitter, Input, Output, ViewChild, ElementRef, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Expense } from './expense';
import { ExpensesService } from './expenses.service';
import { formatInTimeZone } from 'date-fns-tz';
import { CurrencyPipe } from '@angular/common';
import { toast } from 'ngx-sonner';
import { CurrencyFormatDirective } from '../directive/currency-format.directive';
import { LoginUserService } from '../auth/login/loginUser.service';

@Component({
  selector: 'app-expenses-fab',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, CurrencyPipe, CurrencyFormatDirective],
  templateUrl: './expenses-fab.component.html',
  styleUrls: ['./expenses-fab.component.css']
})
export class ExpensesFabComponent implements OnInit {
  @Input() source: string = '';
  @Output() saved = new EventEmitter<Expense>();
  @ViewChild('expenseModal', { static: false }) expenseModalRef!: ElementRef;
  @ViewChild('amountInput', { static: false }) amountInput!: ElementRef<HTMLInputElement>;
  @ViewChild('expensesListModal', { static: false }) expensesListModalRef!: ElementRef;
  @ViewChild('expensesDetailModal', { static: false }) expensesDetailModalRef!: ElementRef;
  @ViewChild('editAmountInput', { static: false }) editAmountInput!: ElementRef<HTMLInputElement>;

  private fb = inject(FormBuilder);
  private service = inject(ExpensesService);
  private loginUserService = inject(LoginUserService);

  menuOpen = false;

  form: FormGroup = this.fb.group({
    amount: ['', [Validators.required]],
    paymentMethod: ['EFECTIVO', [Validators.required]],
    category: ['', [Validators.required, Validators.maxLength(50)]],
    description: ['', [Validators.required, Validators.maxLength(200)]],
    reference: ['']
  });

  listForm: FormGroup = this.fb.group({
    fromDate: [''],
    toDate: [''],
    category: ['']
  });

  listed: Expense[] = [];
  get listedTotal(): number {
    return this.listed.reduce((t, x) => t + (Number(x.amount) || 0), 0);
  }

  private applyDarkBackdrop() {
    try {
      const mark = () => {
        const bds = document.querySelectorAll('.modal-backdrop');
        const last = bds[bds.length - 1] as HTMLElement | undefined;
        if (last && !last.classList.contains('backdrop-dark')) {
          last.classList.add('backdrop-dark');
        }
      };
      // Intento inmediato
      mark();
      // Observar inserciones por si el backdrop se agrega después
      const obs = new MutationObserver((mutations) => {
        for (const m of mutations) {
          m.addedNodes.forEach(n => {
            if (n instanceof HTMLElement && n.classList.contains('modal-backdrop')) {
              n.classList.add('backdrop-dark');
              obs.disconnect();
            }
          });
        }
      });
      obs.observe(document.body, { childList: true });
      // Cortar la observación en 2s por seguridad
      setTimeout(() => { try { obs.disconnect(); } catch {} }, 2000);
    } catch { /* noop */ }
  }

  categories: string[] = [];

  selected: Expense | null = null;

  editForm: FormGroup = this.fb.group({
    amount: ['', [Validators.required]],
    paymentMethod: ['EFECTIVO', [Validators.required]],
    category: ['', [Validators.required, Validators.maxLength(50)]],
    description: ['', [Validators.required, Validators.maxLength(200)]],
    reference: ['']
  });

  ngOnInit(): void {
    // Cargar categorías desde backend y normalizarlas a MAYÚSCULAS
    try {
      this.service.categories().subscribe((cats) => {
        this.categories = (cats || []).map(c => (c || '').toString().trim().toUpperCase());
      });
    } catch { /* noop */ }
  }

  private showModal(el: HTMLElement) {
    const bs = (window as any).bootstrap;
    if (bs?.Modal) {
      // Limpia posibles backdrops antes de mostrar
      this.removeAllBackdrops();
      const modal = new bs.Modal(el);
      modal.show();
      this.applyDarkBackdrop();
      return;
    }
    // Fallback simple
    el.style.display = 'block';
    el.classList.add('show');
    document.body.classList.add('modal-open');
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop fade show backdrop-dark';
    backdrop.setAttribute('data-expense-backdrop', 'true');
    document.body.appendChild(backdrop);
  }

  private hideModal(el: HTMLElement) {
    const bs = (window as any).bootstrap;
    if (bs?.Modal) {
      const instance = bs.Modal.getInstance(el);
      instance?.hide();
      return;
    }
    // Fallback simple
    el.style.display = 'none';
    el.classList.remove('show');
    document.body.classList.remove('modal-open');
    const backdrop = document.querySelector('[data-expense-backdrop="true"]');
    backdrop?.parentElement?.removeChild(backdrop);
  }

  private removeAllBackdrops() {
    try {
      document.querySelectorAll('.modal-backdrop').forEach(el => el.parentElement?.removeChild(el));
      document.querySelectorAll('[data-expense-backdrop="true"]').forEach(el => el.parentElement?.removeChild(el));
      // Si no hay ningún modal visible, asegúrate de quitar modal-open del body
      const anyVisible = document.querySelector('.modal.show');
      if (!anyVisible) {
        document.body.classList.remove('modal-open');
      }
    } catch { /* noop */ }
  }

  toggleMenu() {
    this.menuOpen = !this.menuOpen;
  }

  open() {
    this.menuOpen = false;
    const modalEl = this.expenseModalRef?.nativeElement as HTMLElement;
    if (modalEl) {
      this.showModal(modalEl);
      modalEl.addEventListener('shown.bs.modal', () => {
        this.amountInput?.nativeElement.focus();
        this.amountInput?.nativeElement.select();
      }, { once: true });
    }
  }

  close() {
    const modalEl = this.expenseModalRef?.nativeElement as HTMLElement;
    this.hideModal(modalEl);
  }

  openList() {
    this.menuOpen = false;
    // Fechas por defecto: día actual en America/Bogota
    const today = formatInTimeZone(new Date(), 'America/Bogota', 'yyyy-MM-dd');
    const cur = this.listForm.value as { fromDate?: string; toDate?: string };
    this.listForm.patchValue({
      fromDate: cur.fromDate || today,
      toDate: cur.toDate || today,
    }, { emitEvent: false });
    // Carga inicial con filtros actualizados
    this.applyFilters();
    const modalEl = this.expensesListModalRef?.nativeElement as HTMLElement;
    if (modalEl) this.showModal(modalEl);
  }

  closeList() {
    const modalEl = this.expensesListModalRef?.nativeElement as HTMLElement;
    this.hideModal(modalEl);
    // Limpieza defensiva
    setTimeout(() => { this.removeAllBackdrops(); }, 50);
  }

  applyFilters() {
    const f = this.listForm.value as { fromDate?: string; toDate?: string; category?: string };
    // Normalizar categoría a MAYÚSCULAS solo a nivel UI
    const normalized = { ...f, category: (f.category || '').toString().trim().toUpperCase() || undefined } as any;
    this.service.list(normalized).subscribe({
      next: items => { this.listed = items; },
      error: () => { /* Silencioso en filtro */ }
    });
  }

  openDetail(expense: Expense) {
    this.selected = expense;
    // Ocultar el modal de listado y esperar a que termine antes de abrir detalle
    try {
      const listEl = this.expensesListModalRef?.nativeElement as HTMLElement;
      const bs = (window as any).bootstrap;
      if (listEl && bs?.Modal) {
        // Evitar aria-hidden con foco en un descendiente
        try { (document.activeElement as HTMLElement)?.blur?.(); } catch { /* noop */ }
        const instance = bs.Modal.getInstance(listEl);
        if (instance) {
          listEl.addEventListener('hidden.bs.modal', () => {
            // Forzar estado completamente oculto del modal de lista
            try {
              listEl.style.display = 'none';
              listEl.classList.remove('show');
              listEl.setAttribute('aria-hidden', 'true');
            } catch { /* noop */ }
            document.body.classList.remove('modal-open');
            this.removeAllBackdrops();
            const detailEl = this.expensesDetailModalRef?.nativeElement as HTMLElement;
            if (detailEl) {
              this.showModal(detailEl);
              // Enfocar campo monto al mostrar
              detailEl.addEventListener('shown.bs.modal', () => {
                try { this.editAmountInput?.nativeElement?.focus(); this.editAmountInput?.nativeElement?.select(); } catch { }
              }, { once: true });
            }
          }, { once: true });
          instance.hide();
        } else {
          // No hay instancia bootstrap; usar fallback
          this.hideModal(listEl);
          this.removeAllBackdrops();
          const detailEl = this.expensesDetailModalRef?.nativeElement as HTMLElement;
          if (detailEl) {
            this.showModal(detailEl);
            // Fallback focus
            setTimeout(() => { try { this.editAmountInput?.nativeElement?.focus(); this.editAmountInput?.nativeElement?.select(); } catch { } }, 0);
          }
        }
      } else if (listEl) {
        try { (document.activeElement as HTMLElement)?.blur?.(); } catch { /* noop */ }
        this.hideModal(listEl);
        this.removeAllBackdrops();
        const detailEl = this.expensesDetailModalRef?.nativeElement as HTMLElement;
        if (detailEl) {
          this.showModal(detailEl);
          // Fallback focus
          setTimeout(() => { try { this.editAmountInput?.nativeElement?.focus(); this.editAmountInput?.nativeElement?.select(); } catch { } }, 0);
        }
      }
    } catch { /* noop */ }
    // Patch values in edit form
    this.editForm.reset({
      amount: expense.amount,
      paymentMethod: expense.paymentMethod,
      category: (expense.category || '').toString().trim().toUpperCase(),
      description: expense.description,
      reference: expense.reference || ''
    });
    // Si no estamos usando bootstrap o no había list modal, abrir directamente
    try {
      const bs = (window as any).bootstrap;
      const listEl = this.expensesListModalRef?.nativeElement as HTMLElement;
      const hasInstance = bs?.Modal && listEl && bs.Modal.getInstance(listEl);
      if (!hasInstance) {
        const modalEl = this.expensesDetailModalRef?.nativeElement as HTMLElement;
        if (modalEl) {
          this.showModal(modalEl);
          modalEl.addEventListener('shown.bs.modal', () => {
            try { this.editAmountInput?.nativeElement?.focus(); this.editAmountInput?.nativeElement?.select(); } catch { }
          }, { once: true });
        }
      }
    } catch {
      const modalEl = this.expensesDetailModalRef?.nativeElement as HTMLElement;
      if (modalEl) {
        this.showModal(modalEl);
        setTimeout(() => { try { this.editAmountInput?.nativeElement?.focus(); this.editAmountInput?.nativeElement?.select(); } catch { } }, 0);
      }
    }
  }

  closeDetail() {
    const modalEl = this.expensesDetailModalRef?.nativeElement as HTMLElement;
    this.hideModal(modalEl);
    this.selected = null;
    // Limpieza defensiva
    setTimeout(() => { this.removeAllBackdrops(); }, 50);
  }

  submitUpdate() {
    if (!this.selected?.id) return;
    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      toast.warning('Por favor complete los campos requeridos.');
      return;
    }
    const rawAmount = (this.editForm.value.amount ?? '').toString();
    const normalizedAmount = Number(
      rawAmount
        .toString()
        .replace(/[\s$\u00A0]/g, '')
        .replace(/\.(?=\d{3}(\D|$))/g, '')
        .replace(/,/g, '.')
        .replace(/[^0-9.\-]/g, '')
    ) || 0;

    const payload: Partial<Expense> = {
      amount: normalizedAmount,
      paymentMethod: this.editForm.value.paymentMethod,
      category: (this.editForm.value.category || '').toString().trim().toUpperCase(),
      description: this.editForm.value.description,
      reference: this.editForm.value.reference,
    };

    this.service.update(this.selected.id as string, payload).subscribe({
      next: (updated) => {
        toast.success('Gasto actualizado');
        this.closeDetail();
        this.applyFilters();
      },
      error: (err) => {
        const e = err?.error;
        if (e?.errors && typeof e.errors === 'object') {
          const msgs = Object.values(e.errors as Record<string, string>).filter(Boolean) as string[];
          if (msgs.length) { msgs.forEach(m => toast.warning(m)); return; }
        }
        toast.error(e?.message || 'Error actualizando el gasto');
      }
    });
  }

  deleteSelected() {
    if (!this.selected?.id) return;
    const doDelete = () => {
      this.service.delete(this.selected!.id as string).subscribe({
        next: () => {
          toast.success('Gasto eliminado');
          this.closeDetail();
          // Reabrir listado con datos actualizados
          this.openList();
        },
        error: (err) => {
          toast.error(err?.error?.message || 'Error eliminando el gasto');
        }
      });
    };
    // Confirmación con toast de acción
    toast('¿Desea eliminar este gasto?', {
      action: {
        label: 'Confirmar',
        onClick: () => doDelete()
      }
    });
  }

  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      toast.warning('Por favor complete los campos requeridos.');
      return;
    }

    const userLogin = this.loginUserService.getUserFromToken?.();

    const rawAmount = (this.form.value.amount ?? '').toString();
    const normalizedAmount = Number(
      rawAmount
        .toString()
        .replace(/[\s$\u00A0]/g, '')
        .replace(/\.(?=\d{3}(\D|$))/g, '')
        .replace(/,/g, '.')
        .replace(/[^0-9.\-]/g, '')
    ) || 0;

    const expense: Expense = {
      amount: normalizedAmount,
      paymentMethod: this.form.value.paymentMethod,
      category: (this.form.value.category || '').toString().trim().toUpperCase(),
      description: this.form.value.description,
      reference: this.form.value.reference,
      source: this.source,
      createdBy: userLogin?.username ?? userLogin?.name ?? '',
      dateTimeRecord: formatInTimeZone(new Date(), 'America/Bogota', "yyyy-MM-dd'T'HH:mm:ssXXX"),
    };

    this.service.save(expense).subscribe({
      next: (saved) => {
        toast.success('Gasto registrado correctamente');
        this.saved.emit(saved);
        this.form.reset({ paymentMethod: 'EFECTIVO' });
        this.close();
      },
      error: (err) => {
        const e = err?.error;
        if (e?.errors && typeof e.errors === 'object') {
          const msgs = Object.values(e.errors as Record<string, string>).filter(Boolean) as string[];
          if (msgs.length) {
            msgs.forEach(m => toast.warning(m));
            return;
          }
        }
        toast.error(e?.message || 'Error registrando el gasto');
      }
    });
  }
}
