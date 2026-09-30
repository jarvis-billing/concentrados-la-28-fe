import { Component, EventEmitter, inject, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { FacturaService } from '../../factura.service';
import { ClienteService } from '../../../cliente/cliente.service';
import { Client } from '../../../cliente/cliente';
import { Billing, PaymentEntry } from '../../billing';
import { toast } from 'ngx-sonner';

interface PaymentRow {
  method: string;
  amount: number | null;
  reference: string;
  bankAccountName: string;
}

@Component({
  selector: 'app-edit-billing-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './edit-billing-modal.component.html',
  styleUrl: './edit-billing-modal.component.css'
})
export class EditBillingModalComponent implements OnChanges {

  @Input() billing: Billing | null = null;
  @Output() billingUpdated = new EventEmitter<Billing>();

  private facturaService = inject(FacturaService);
  private clienteService = inject(ClienteService);
  private fb = inject(FormBuilder);

  isOpen = false;
  isSaving = false;

  // Cliente autocomplete
  clients: Client[] = [];
  filteredClients: Client[] = [];
  clientSearchText = '';
  showClientDropdown = false;
  selectedClient: Client | null = null;

  // Métodos de pago
  paymentMethods = ['EFECTIVO', 'TRANSFERENCIA', 'TARJETA_CREDITO', 'TARJETA_DEBITO', 'CHEQUE', 'SALDO_FAVOR'];
  paymentRows: PaymentRow[] = [];

  form: FormGroup = this.fb.group({
    dateTimeRecord: ['', Validators.required],
    saleType:       ['CONTADO', Validators.required],
    billingType:    ['FISICA'],
    receivedValue:  [0],
    returnedValue:  [0],
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['billing'] && this.billing) {
      this.loadClients();
    }
  }

  private loadClients(): void {
    if (this.clients.length === 0) {
      this.clienteService.getAll().subscribe(c => {
        this.clients = c;
        this.filteredClients = c;
      });
    }
  }

  open(billing: Billing): void {
    this.billing = billing;
    this.loadClients();

    // Parse date to datetime-local format (YYYY-MM-DDTHH:mm)
    const dt = billing.dateTimeRecord ? new Date(billing.dateTimeRecord) : new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const local = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;

    this.form.patchValue({
      dateTimeRecord: local,
      saleType:       billing.saleType || 'CONTADO',
      billingType:    (billing as any).billingType || 'FISICA',
      receivedValue:  billing.receivedValue || 0,
      returnedValue:  billing.returnedValue || 0,
    });

    // Client
    const c = billing.client;
    if (c) {
      this.selectedClient = c as any;
      this.clientSearchText = c.fullName || `${c.name || ''} ${(c as any).surname || ''}`.trim();
    } else {
      this.selectedClient = null;
      this.clientSearchText = '';
    }

    // Payment rows
    if (billing.payments && billing.payments.length > 0) {
      this.paymentRows = billing.payments.map(p => ({
        method: p.method,
        amount: p.amount ?? null,
        reference: p.reference || '',
        bankAccountName: p.bankAccountName || '',
      }));
    } else {
      this.paymentRows = [{ method: 'EFECTIVO', amount: null, reference: '', bankAccountName: '' }];
    }

    this.isOpen = true;
  }

  close(): void {
    this.isOpen = false;
  }

  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    if (!this.billing?.id) return;

    this.isSaving = true;
    const f = this.form.value;

    const payments: PaymentEntry[] = this.paymentRows
      .filter(r => r.amount && r.amount > 0)
      .map(r => ({
        method: r.method,
        amount: r.amount!,
        reference: r.reference || undefined,
        bankAccountName: r.bankAccountName || undefined,
      }));

    const payload: Partial<Billing> = {
      dateTimeRecord: f.dateTimeRecord ? new Date(f.dateTimeRecord).toISOString() : undefined,
      saleType:       f.saleType,
      billingType:    f.billingType,
      receivedValue:  Number(f.receivedValue),
      returnedValue:  Number(f.returnedValue),
      paymentMethods: payments.map(p => p.method),
      payments,
    } as any;

    if (this.selectedClient) {
      (payload as any).client = this.selectedClient;
    }

    this.facturaService.updateBilling(this.billing.id, payload).subscribe({
      next: (updated) => {
        toast.success(`Factura ${this.billing?.billNumber} actualizada`);
        this.billingUpdated.emit(updated);
        this.isSaving = false;
        this.close();
      },
      error: () => {
        toast.error('Error al actualizar la factura');
        this.isSaving = false;
      }
    });
  }

  // ─── Pagos ───────────────────────────────────────────────
  addPaymentRow(): void {
    this.paymentRows.push({ method: 'EFECTIVO', amount: null, reference: '', bankAccountName: '' });
  }

  removePaymentRow(i: number): void {
    if (this.paymentRows.length > 1) this.paymentRows.splice(i, 1);
  }

  isTransfer(method: string): boolean {
    return method === 'TRANSFERENCIA';
  }

  // ─── Cliente autocomplete ────────────────────────────────
  filterClients(q: string): void {
    this.clientSearchText = q;
    if (!q.trim()) { this.filteredClients = this.clients; this.showClientDropdown = false; return; }
    const lq = q.toLowerCase();
    this.filteredClients = this.clients.filter(c =>
      (c.name || '').toLowerCase().includes(lq) ||
      (c.surname || '').toLowerCase().includes(lq) ||
      (c.businessName || '').toLowerCase().includes(lq) ||
      (c.idNumber || '').toLowerCase().includes(lq)
    );
    this.showClientDropdown = this.filteredClients.length > 0;
  }

  selectClient(c: Client): void {
    this.selectedClient = c;
    this.clientSearchText = c.name?.trim()
      ? `${c.name} ${c.surname || ''}`.trim()
      : c.businessName || c.nickname || 'Sin nombre';
    this.showClientDropdown = false;
  }

  clearClient(): void {
    this.selectedClient = null;
    this.clientSearchText = '';
    this.filteredClients = this.clients;
  }

  // ─── Labels ──────────────────────────────────────────────
  paymentLabel(m: string): string {
    const map: Record<string, string> = {
      EFECTIVO: 'Efectivo', TRANSFERENCIA: 'Transferencia',
      TARJETA_CREDITO: 'T. Crédito', TARJETA_DEBITO: 'T. Débito',
      CHEQUE: 'Cheque', SALDO_FAVOR: 'Saldo a Favor'
    };
    return map[m] ?? m;
  }
}
