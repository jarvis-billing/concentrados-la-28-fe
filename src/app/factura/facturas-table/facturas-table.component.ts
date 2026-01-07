import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { FacturaService } from '../factura.service';
import { Billing, BillingReportFilter } from '../billing';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ClienteService } from '../../cliente/cliente.service';
import { Client } from '../../cliente/cliente';
import { ModalClientsListComponent } from "../../cliente/components/modal-clients-list/modal-clients-list.component";
import { User } from '../../auth/user';
import { ModalUsersListComponent } from "../../users/components/modal-users-list/modal-users-list.component";
import { CommonModule, CurrencyPipe } from '@angular/common';
import { ModalSaleDetailComponent } from "../components/modal-sale-detail/modal-sale-detail.component";
import { toast } from 'ngx-sonner';
import { LoginUserService } from '../../auth/login/loginUser.service';
import { ProductsSearchModalComponent } from '../../producto/components/products-search-modal/products-search-modal.component';
import { Product } from '../../producto/producto';

@Component({
  selector: 'app-facturas-table',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalClientsListComponent, ModalUsersListComponent, ReactiveFormsModule, CurrencyPipe, ModalSaleDetailComponent, ProductsSearchModalComponent],
  templateUrl: './facturas-table.component.html',
  styleUrl: './facturas-table.component.css'
})
export class FacturasTableComponent implements OnInit {

  private fb = inject(FormBuilder);
  facturaService = inject(FacturaService);
  clientService = inject(ClienteService);
  loginUserService = inject(LoginUserService);
  
  @ViewChild(ProductsSearchModalComponent, { static: false }) productsSearchModalComp!: ProductsSearchModalComponent;

  reportBilling: Billing[] = [];
  filteredBilling: Billing[] = [];
  clients: Client[] = [];
  filteredClientsForFilter: Client[] = [];
  clientSearchText: string = '';
  showClientDropdown: boolean = false;
  selectedClient: Client | null = null;
  selectedProduct: Product | null = null;
  today: string = '';

  selectedBilling: any = null;
  expandedBillingId: string | null = null;
  
  isLoading: boolean = false;
  userLogin = this.loginUserService.getUserFromToken();

  filterForm: FormGroup = this.fb.group({
    startDate: [''],
    endDate: [''],
    clientId: [''],
    productSearch: [''],
    saleType: [''],
    billNumber: ['']
  });

  openSaleDetailModal(billing: any): void {
    this.selectedBilling = billing;
    const modal = document.getElementById('modalSaleDetail');
    if (modal) {
      modal.classList.add('show');
      modal.style.display = 'block';
    }
  }


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
    this.clientService.getAll().subscribe(clients => {
      this.clients = clients;
      this.filteredClientsForFilter = clients;
    });
    this.loadBillings();
  }

  loadBillings() {
    this.isLoading = true;
    const filterReport = new BillingReportFilter();
    filterReport.toDate = '';
    filterReport.fromDate = '';
    
    this.facturaService.findAllBilling(filterReport).subscribe(billings => {
      this.reportBilling = billings.sort((a, b) => {
        const dateA = new Date(a.dateTimeRecord || 0).getTime();
        const dateB = new Date(b.dateTimeRecord || 0).getTime();
        return dateB - dateA;
      });
      this.filteredBilling = [...this.reportBilling];
      this.isLoading = false;
    });
  }

  applyFilters() {
    const filters = this.filterForm.value;
    let filtered = [...this.reportBilling];

    // Filtro por fecha de inicio
    if (filters.startDate) {
      filtered = filtered.filter(billing => {
        if (!billing.dateTimeRecord) return false;
        const billingDate = billing.dateTimeRecord.split('T')[0];
        return billingDate >= filters.startDate;
      });
    }

    // Filtro por fecha fin
    if (filters.endDate) {
      filtered = filtered.filter(billing => {
        if (!billing.dateTimeRecord) return false;
        const billingDate = billing.dateTimeRecord.split('T')[0];
        return billingDate <= filters.endDate;
      });
    }

    // Filtro por cliente
    if (filters.clientId) {
      filtered = filtered.filter(billing => 
        billing.client && billing.client.id === filters.clientId
      );
    }

    // Filtro por producto
    if (this.selectedProduct) {
      filtered = filtered.filter(billing => {
        return billing.saleDetails?.some(detail => 
          detail.product?.id === this.selectedProduct!.id ||
          detail.product?.barcode === this.selectedProduct!.barcode
        );
      });
    }

    // Filtro por tipo de venta
    if (filters.saleType) {
      filtered = filtered.filter(billing => 
        billing.saleType === filters.saleType
      );
    }

    // Filtro por número de factura
    if (filters.billNumber && filters.billNumber.trim()) {
      const query = filters.billNumber.toLowerCase().trim();
      filtered = filtered.filter(billing => 
        billing.billNumber?.toLowerCase().includes(query)
      );
    }

    this.filteredBilling = filtered;
    
    if (this.filteredBilling.length === 0) {
      toast.info('No se encontraron facturas con los criterios de búsqueda proporcionados.');
    }
  }

  subTotal(): number {
    return this.filteredBilling.reduce((sum, billing) => sum + (billing.subTotalSale || 0), 0);
  }

  totalReceived(): number {
    return this.filteredBilling.reduce((sum, billing) => sum + (billing.receivedValue || 0), 0);
  }

  totalIvat(): number {
    return this.filteredBilling.reduce((sum, billing) => sum + (billing.totalIVAT || 0), 0);
  }

  // Métodos para autocompletado de clientes
  filterClients(searchText: string) {
    this.clientSearchText = searchText;
    if (!searchText.trim()) {
      this.filteredClientsForFilter = this.clients;
      this.showClientDropdown = false;
      return;
    }
    
    const query = searchText.toLowerCase();
    this.filteredClientsForFilter = this.clients.filter(c => {
      const name = (c.name || '').toLowerCase();
      const surname = (c.surname || '').toLowerCase();
      const businessName = (c.businessName || '').toLowerCase();
      const idNumber = (c.idNumber || '').toLowerCase();
      return name.includes(query) || surname.includes(query) || 
             businessName.includes(query) || idNumber.includes(query);
    });
    this.showClientDropdown = this.filteredClientsForFilter.length > 0;
  }

  selectClientForFilter(client: Client) {
    this.selectedClient = client;
    this.clientSearchText = this.getClientDisplayName(client);
    this.filterForm.patchValue({ clientId: client.id });
    this.showClientDropdown = false;
  }

  clearClientSelection() {
    this.selectedClient = null;
    this.clientSearchText = '';
    this.filterForm.patchValue({ clientId: '' });
    this.filteredClientsForFilter = this.clients;
  }

  getClientDisplayName(client: Client): string {
    if (client.name?.trim()) {
      return `${client.name} ${client.surname || ''}`.trim();
    }
    if (client.businessName?.trim()) {
      return client.businessName;
    }
    if (client.nickname?.trim()) {
      return client.nickname;
    }
    return 'Sin nombre';
  }

  // Métodos para filtro de productos
  openProductModal() {
    this.productsSearchModalComp?.openModal();
  }

  onProductSelected(product: Product) {
    this.selectedProduct = product;
    const displayText = `${product.description || ''} - ${product.barcode || ''}`.trim();
    this.filterForm.patchValue({ productSearch: displayText });
  }

  clearProductFilter() {
    this.selectedProduct = null;
    this.filterForm.patchValue({ productSearch: '' });
  }

  clearFilters() {
    this.selectedClient = null;
    this.selectedProduct = null;
    this.clientSearchText = '';
    this.filteredClientsForFilter = this.clients;
    this.filterForm.reset({
      startDate: '',
      endDate: '',
      clientId: '',
      productSearch: '',
      saleType: '',
      billNumber: ''
    });
    this.filteredBilling = [...this.reportBilling];
  }

  toggleBillingDetails(billingId: string) {
    this.expandedBillingId = this.expandedBillingId === billingId ? null : billingId;
  }

  printTicketBilling(billing: Billing) {
    this.facturaService.generatedTicketBilling(billing);
  }
}
