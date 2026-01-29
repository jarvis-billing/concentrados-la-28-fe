import { Component, inject, OnInit } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ClientAccountService } from '../../services/client-account.service';
import { ClientCreditService } from '../../services/client-credit.service';
import { ClienteService } from '../../../cliente/cliente.service';
import { Client } from '../../../cliente/cliente';
import { ClientAccount, AccountPayment } from '../../models/client-account';
import { ClientCredit, CreditTransaction } from '../../models/client-credit';
import { toast } from 'ngx-sonner';
import { PaymentRegisterModalComponent } from '../payment-register-modal/payment-register-modal.component';
import { CreditRegisterModalComponent } from '../credit-register-modal/credit-register-modal.component';

@Component({
    selector: 'app-client-account-view',
    standalone: true,
    imports: [
        CommonModule, 
        FormsModule, 
        ReactiveFormsModule, 
        CurrencyPipe,
        PaymentRegisterModalComponent,
        CreditRegisterModalComponent
    ],
    templateUrl: './client-account-view.component.html',
    styleUrl: './client-account-view.component.css'
})
export class ClientAccountViewComponent implements OnInit {

    clientService = inject(ClienteService);
    accountService = inject(ClientAccountService);
    creditService = inject(ClientCreditService);

    clients: Client[] = [];
    filteredClients: Client[] = [];
    selectedClient: Client | null = null;
    clientSearchText: string = '';
    showClientDropdown: boolean = false;

    clientAccount: ClientAccount | null = null;
    clientCredit: ClientCredit | null = null;
    paymentHistory: AccountPayment[] = [];
    creditTransactions: CreditTransaction[] = [];

    isLoading: boolean = false;
    activeTab: 'debt' | 'credit' = 'debt';

    ngOnInit(): void {
        this.loadClients();
    }

    loadClients(): void {
        this.clientService.getAll().subscribe({
            next: (clients) => {
                this.clients = clients.filter(c => c.idNumber !== '22222222222');
                this.filteredClients = [...this.clients];
            },
            error: () => toast.error('Error al cargar clientes')
        });
    }

    filterClients(searchText: string): void {
        this.clientSearchText = searchText;
        if (!searchText.trim()) {
            this.filteredClients = [...this.clients];
            this.showClientDropdown = false;
            return;
        }

        const query = searchText.toLowerCase();
        this.filteredClients = this.clients.filter(c => {
            const name = (c.name || '').toLowerCase();
            const surname = (c.surname || '').toLowerCase();
            const businessName = (c.businessName || '').toLowerCase();
            const idNumber = (c.idNumber || '').toLowerCase();
            return name.includes(query) || surname.includes(query) ||
                businessName.includes(query) || idNumber.includes(query);
        });
        this.showClientDropdown = this.filteredClients.length > 0;
    }

    selectClient(client: Client): void {
        this.selectedClient = client;
        this.clientSearchText = this.getClientDisplayName(client);
        this.showClientDropdown = false;
        this.loadClientData();
    }

    getClientDisplayName(client: Client): string {
        if (client.businessName) {
            return client.businessName;
        }
        return `${client.name} ${client.surname}`.trim();
    }

    clearClientSelection(): void {
        this.selectedClient = null;
        this.clientSearchText = '';
        this.clientAccount = null;
        this.clientCredit = null;
        this.paymentHistory = [];
        this.creditTransactions = [];
        this.filteredClients = [...this.clients];
    }

    loadClientData(): void {
        if (!this.selectedClient) return;

        this.isLoading = true;
        const clientId = this.selectedClient.id;

        this.accountService.getByClientId(clientId).subscribe({
            next: (account) => {
                this.clientAccount = account;
                this.loadPaymentHistory(clientId);
            },
            error: () => {
                this.clientAccount = null;
                this.isLoading = false;
            }
        });

        this.creditService.getByClientId(clientId).subscribe({
            next: (credit) => {
                this.clientCredit = credit;
                this.loadCreditTransactions(clientId);
            },
            error: () => {
                this.clientCredit = null;
            }
        });
    }

    loadPaymentHistory(clientId: string): void {
        this.accountService.getPaymentHistoryByClientId(clientId).subscribe({
            next: (payments) => {
                this.paymentHistory = payments;
                this.isLoading = false;
            },
            error: () => {
                this.paymentHistory = [];
                this.isLoading = false;
            }
        });
    }

    loadCreditTransactions(clientId: string): void {
        this.creditService.getTransactionHistory(clientId).subscribe({
            next: (transactions) => {
                this.creditTransactions = transactions;
            },
            error: () => {
                this.creditTransactions = [];
            }
        });
    }

    setActiveTab(tab: 'debt' | 'credit'): void {
        this.activeTab = tab;
    }

    onPaymentRegistered(): void {
        if (this.selectedClient) {
            this.loadClientData();
            toast.success('Pago registrado exitosamente');
        }
    }

    onCreditRegistered(): void {
        if (this.selectedClient) {
            this.loadClientData();
            toast.success('Anticipo registrado exitosamente');
        }
    }

    formatDate(dateInput: string | Date): string {
        if (!dateInput) return '-';
        const date = new Date(dateInput);
        return new Intl.DateTimeFormat('es-CO', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    }

    getTransactionTypeLabel(type: string): string {
        const labels: Record<string, string> = {
            'DEPOSIT': 'Anticipo',
            'CONSUMPTION': 'Uso en factura',
            'REFUND': 'Devolución',
            'ADJUSTMENT': 'Ajuste'
        };
        return labels[type] || type;
    }

    getTransactionTypeClass(type: string): string {
        const classes: Record<string, string> = {
            'DEPOSIT': 'badge bg-success',
            'CONSUMPTION': 'badge bg-warning text-dark',
            'REFUND': 'badge bg-info',
            'ADJUSTMENT': 'badge bg-secondary'
        };
        return classes[type] || 'badge bg-secondary';
    }
}
