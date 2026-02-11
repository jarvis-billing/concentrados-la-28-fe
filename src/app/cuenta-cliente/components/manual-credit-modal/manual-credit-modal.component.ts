import { Component, EventEmitter, inject, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { ClientAccountService } from '../../services/client-account.service';
import { ManualDebtRequest } from '../../models/client-account';
import { ClienteService } from '../../../cliente/cliente.service';
import { Client } from '../../../cliente/cliente';
import { toast } from 'ngx-sonner';
import { CurrencyFormatDirective } from '../../../directive/currency-format.directive';

@Component({
    selector: 'app-manual-credit-modal',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, FormsModule, CurrencyFormatDirective],
    template: `
        @if (showModal) {
            <div class="modal-backdrop fade show"></div>
            <div class="modal fade show d-block" tabindex="-1">
                <div class="modal-dialog modal-dialog-centered modal-lg">
                    <div class="modal-content">
                        <div class="modal-header bg-warning text-dark">
                            <h5 class="modal-title">
                                <i class="bi bi-journal-text me-2"></i>
                                Registrar Cuenta por Cobrar (Migración de Cuaderno)
                            </h5>
                            <button type="button" class="btn-close" (click)="closeModal()"></button>
                        </div>
                        <div class="modal-body">
                            <div class="alert alert-warning mb-3">
                                <i class="bi bi-info-circle me-2"></i>
                                Use esta opción para migrar deudas registradas previamente en cuaderno.
                                Estas deudas se agregarán a las cuentas por cobrar del cliente.
                            </div>

                            <form [formGroup]="creditForm">
                                <!-- Búsqueda de Cliente -->
                                <div class="mb-3">
                                    <label class="form-label fw-bold">Cliente *</label>
                                    <div class="position-relative">
                                        <div class="input-group">
                                            <input 
                                                type="text" 
                                                class="form-control" 
                                                [(ngModel)]="clientSearchText"
                                                [ngModelOptions]="{standalone: true}"
                                                (input)="filterClients(clientSearchText)"
                                                (focus)="showClientDropdown = true"
                                                placeholder="Buscar por nombre o documento..."
                                                autocomplete="off">
                                            <button 
                                                type="button" 
                                                class="btn btn-outline-danger" 
                                                *ngIf="selectedClient"
                                                (click)="clearClientSelection()">
                                                <i class="bi bi-x"></i>
                                            </button>
                                        </div>
                                        @if (showClientDropdown && filteredClients.length > 0) {
                                            <div class="position-absolute w-100 bg-white border rounded shadow-sm mt-1"
                                                 style="max-height: 200px; overflow-y: auto; z-index: 1050;">
                                                @for (client of filteredClients; track client.id) {
                                                    <div class="p-2 border-bottom" 
                                                         style="cursor: pointer;"
                                                         (click)="selectClient(client)"
                                                         (mouseenter)="$event.target.style.backgroundColor='#f8f9fa'"
                                                         (mouseleave)="$event.target.style.backgroundColor='white'">
                                                        <div class="fw-bold">{{ getClientDisplayName(client) }}</div>
                                                        <small class="text-muted">{{ client.documentType }} {{ client.idNumber }}</small>
                                                    </div>
                                                }
                                            </div>
                                        }
                                    </div>
                                    @if (selectedClient) {
                                        <div class="mt-2 p-2 bg-success-subtle rounded">
                                            <i class="bi bi-person-check me-1"></i>
                                            <strong>{{ getClientDisplayName(selectedClient) }}</strong> - {{ selectedClient.documentType }} {{ selectedClient.idNumber }}
                                        </div>
                                    }
                                </div>

                                <!-- Monto -->
                                <div class="mb-3">
                                    <label class="form-label fw-bold">Monto de la Deuda *</label>
                                    <div class="input-group">
                                        <span class="input-group-text">$</span>
                                        <input type="text" class="form-control form-control-lg" 
                                               formControlName="amount" 
                                               appCurrencyFormat
                                               placeholder="Ej: 50.000">
                                    </div>
                                </div>

                                <!-- Fecha Original -->
                                <div class="mb-3">
                                    <label class="form-label fw-bold">Fecha Original de la Deuda *</label>
                                    <input type="date" class="form-control" formControlName="transactionDate">
                                    <small class="text-muted">Ingrese la fecha en que se registró originalmente en el cuaderno</small>
                                </div>

                                <!-- Notas -->
                                <div class="mb-3">
                                    <label class="form-label fw-bold">Descripción / Notas *</label>
                                    <textarea class="form-control" 
                                              formControlName="notes" 
                                              rows="3"
                                              placeholder="Ej: Deuda por venta de 2 bultos de concentrado - Migrado del cuaderno"></textarea>
                                    <small class="text-muted">Describa el origen de la deuda para referencia futura</small>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" (click)="closeModal()">
                                Cancelar
                            </button>
                            <button type="button" class="btn btn-warning" 
                                    (click)="onSubmit()"
                                    [disabled]="isSubmitting || !selectedClient || creditForm.invalid">
                                @if (isSubmitting) {
                                    <span class="spinner-border spinner-border-sm me-1"></span>
                                }
                                <i class="bi bi-check-circle me-1"></i>
                                Registrar Deuda
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        }
    `
})
export class ManualCreditModalComponent implements OnInit {

    @Output() creditRegistered = new EventEmitter<void>();

    private fb = inject(FormBuilder);
    private accountService = inject(ClientAccountService);
    private clienteService = inject(ClienteService);

    showModal = false;
    isSubmitting = false;

    // Clientes
    clients: Client[] = [];
    filteredClients: Client[] = [];
    clientSearchText = '';
    showClientDropdown = false;
    selectedClient: Client | null = null;

    creditForm: FormGroup = this.fb.group({
        amount: ['', [Validators.required, Validators.min(1)]],
        transactionDate: ['', Validators.required],
        notes: ['', Validators.required]
    });

    ngOnInit(): void {
        this.loadClients();
    }

    loadClients(): void {
        this.clienteService.getAll().subscribe({
            next: (clients: Client[]) => {
                this.clients = clients;
                this.filteredClients = clients;
            },
            error: () => {
                toast.error('Error al cargar la lista de clientes');
            }
        });
    }

    openModal(): void {
        this.showModal = true;
        this.resetForm();
        if (this.clients.length === 0) {
            this.loadClients();
        }
    }

    closeModal(): void {
        this.showModal = false;
        this.resetForm();
    }

    resetForm(): void {
        this.creditForm.reset();
        this.selectedClient = null;
        this.clientSearchText = '';
        this.showClientDropdown = false;
    }

    filterClients(searchText: string): void {
        this.clientSearchText = searchText;
        if (!searchText.trim()) {
            this.filteredClients = this.clients;
            this.showClientDropdown = false;
            return;
        }

        const query = searchText.toLowerCase();
        this.filteredClients = this.clients.filter(c => {
            const name = (c.name || '').toLowerCase();
            const surname = (c.surname || '').toLowerCase();
            const nickname = (c.nickname || '').toLowerCase();
            const idNumber = (c.idNumber || '').toLowerCase();
            return name.includes(query) || surname.includes(query) || nickname.includes(query) || idNumber.includes(query);
        });
        this.showClientDropdown = this.filteredClients.length > 0;
    }

    selectClient(client: Client): void {
        this.selectedClient = client;
        this.clientSearchText = `${this.getClientDisplayName(client)} (${client.documentType} ${client.idNumber})`;
        this.showClientDropdown = false;
    }

    getClientDisplayName(client: Client): string {
        let displayName = client.name || '';
        if (client.surname) {
            displayName += ' ' + client.surname;
        }
        if (client.nickname) {
            displayName += ` (${client.nickname})`;
        }
        return displayName.trim();
    }

    clearClientSelection(): void {
        this.selectedClient = null;
        this.clientSearchText = '';
        this.filteredClients = this.clients;
    }

    onSubmit(): void {
        if (this.creditForm.invalid || !this.selectedClient) {
            toast.warning('Complete todos los campos requeridos');
            return;
        }

        this.isSubmitting = true;

        const rawAmount = this.creditForm.value.amount;
        const amount = this.normalizeToNumber(rawAmount);

        const request: ManualDebtRequest = {
            clientId: this.selectedClient.id,
            amount: amount,
            transactionDate: this.creditForm.value.transactionDate,
            notes: this.creditForm.value.notes,
            source: 'MIGRACION_CUADERNO'
        };

        this.accountService.registerManualDebt(request).subscribe({
            next: () => {
                toast.success(`Deuda de $${amount.toLocaleString('es-CO')} registrada para ${this.selectedClient?.name}`);
                this.isSubmitting = false;
                this.closeModal();
                this.creditRegistered.emit();
            },
            error: (err) => {
                this.isSubmitting = false;
                toast.error('Error al registrar la deuda: ' + (err.error?.message || 'Intente nuevamente'));
            }
        });
    }

    private normalizeToNumber(value: unknown): number {
        if (typeof value === 'number') return isFinite(value) ? value : 0;
        if (typeof value === 'string') {
            const raw = value
                .toString()
                .replace(/[\s$\u00A0]/g, '')
                .replace(/\.(?=\d{3}(\D|$))/g, '')
                .replace(/,/g, '.')
                .replace(/[^0-9.\-]/g, '');
            const n = Number(raw);
            return isNaN(n) ? 0 : n;
        }
        return 0;
    }
}
