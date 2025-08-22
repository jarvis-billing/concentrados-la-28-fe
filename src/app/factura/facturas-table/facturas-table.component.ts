import { Component, inject, OnInit } from '@angular/core';
import { FacturaService } from '../factura.service';
import { Billing, BillingReportFilter } from '../billing';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ClienteService } from '../../cliente/cliente.service';
import { Client } from '../../cliente/cliente';
import { ModalClientsListComponent } from "../../cliente/components/modal-clients-list/modal-clients-list.component";
import { User } from '../../auth/user';
import { ModalUsersListComponent } from "../../users/components/modal-users-list/modal-users-list.component";
import { CurrencyPipe } from '@angular/common';
import { ModalSaleDetailComponent } from "../components/modal-sale-detail/modal-sale-detail.component";
import { toast } from 'ngx-sonner';
import { LoginUserService } from '../../auth/login/loginUser.service';

@Component({
  selector: 'app-facturas-table',
  standalone: true,
  imports: [FormsModule, ModalClientsListComponent, ModalUsersListComponent, ReactiveFormsModule, CurrencyPipe, ModalSaleDetailComponent],
  templateUrl: './facturas-table.component.html',
  styleUrl: './facturas-table.component.css'
})
export class FacturasTableComponent implements OnInit {

  facturaService = inject(FacturaService);
  clientService = inject(ClienteService);
  loginUserService = inject(LoginUserService);
  
  filterReport: BillingReportFilter = new BillingReportFilter();

  reportBilling: Billing[] = [];
  clients: Client[] = [];
  filteredClients: Client[] = [];
  selectedClient: Client | null = null;
  selectedUser: User | null = null;
  today: string = '';

  selectedBilling: any = null;
  
  isLoading: boolean = false;
  userLogin = this.loginUserService.getUserFromToken();

  openSaleDetailModal(billing: any): void {
    this.selectedBilling = billing;
    const modal = document.getElementById('modalSaleDetail');
    if (modal) {
      modal.classList.add('show');
      modal.style.display = 'block';
    }
  }

  formFilter = new FormGroup({
    billNumber: new FormControl('')
  });

  formatDate(dateInput: string | Date): string {
    const date = new Date(dateInput);
    return new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  }


  ngOnInit(): void {
    const now = new Date();
    this.today = now.toISOString().split('T')[0];
    this.clientService.getAll().subscribe(client => this.clients = client);
  }

  findAllBilling() {
    this.filterReport.client = this.selectedClient?.idNumber || "";
    debugger
    this.filterReport.userSale = this.selectedUser?.numberIdentity || "";
    this.filterReport.billNumber = this.formFilter.controls.billNumber.value ?? '';
    

    this.isLoading = true; // Inicia el indicador de carga
    this.facturaService.findAllBilling(this.filterReport).subscribe(billings => {
      this.reportBilling = billings;
      this.isLoading = false; // Detiene el indicador de carga
      if (this.reportBilling.length === 0) {
        toast.info('No se encontraron facturas con los criterios de búsqueda proporcionados.');
      }
    });
  }

  subTotal(): number {
    let total = 0;

    if (this.reportBilling.length > 0) {
      this.reportBilling.forEach(billing => {
        total += billing.subTotalSale;
      });
    }

    return total;
  }

  totalReceived(): number {
    let total = 0;

    if (this.reportBilling.length > 0) {
      this.reportBilling.forEach(billing => {
        total += billing.receivedValue;
      });
    }

    return total;
  }

  totalIvat(): number {
    let total = 0;

    if (this.reportBilling.length > 0) {
      this.reportBilling.forEach(billing => {
        total += billing.totalIVAT;
      });
    }

    return total;
  }



  // Filtra la lista de clientes al escribir en el input
  onClientInput(event: Event): void {
    const input = (event.target as HTMLInputElement).value.toLowerCase();
    this.filteredClients = this.clients.filter(client =>
      client.name.toLowerCase().includes(input)
    );
  }

  handleClientSelected(client: Client | null): void {
    if (client) {
      this.selectedClient = client;
    }
  }

  handleUserSelected(user: User): void {
    this.selectedUser = user;
  }

  removeClientSelected() {
    this.selectedClient = null;
  }

  removeUserSelected() {
    this.selectedUser = null;
  }

  get fullNameClient(): string {
    if (this.selectedClient?.name?.trim()) {
      return `${this.selectedClient?.name} ${this.selectedClient?.surname}`.trim();
    }
    if (this.selectedClient?.businessName?.trim()) {
      return this.selectedClient?.businessName;
    }
    if (this.selectedClient?.nickname?.trim()) {
      return this.selectedClient?.nickname;
    }
    return "Sin nombre"; // Valor por defecto si ninguno está definido
  }

  printTicketBilling(billing: Billing) {
    this.facturaService.generatedTicketBilling(billing);
  }
}
