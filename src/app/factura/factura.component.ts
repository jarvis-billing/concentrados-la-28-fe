import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy, ViewChild, inject, Input, OnInit } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, FormArray } from '@angular/forms';
import { toast } from 'ngx-sonner';
import { CurrencyPipe, DatePipe, CommonModule } from '@angular/common';
import { ESaleType, EVatType, Presentation, Product, UnitMeasure } from '../producto/producto';
import { FacturaService } from './factura.service';
import { Billing, saleTypeFromString, saleType } from './billing';
import { formatInTimeZone } from 'date-fns-tz';
import { Client } from '../cliente/cliente';
import { Order } from '../orden/orden';
import { ClienteService } from '../cliente/cliente.service';
import { ProductoService } from '../producto/producto.service';
import { SaleDetail } from './saleDetail';
import { Router } from '@angular/router';
import { Observable, Subscription } from 'rxjs';
import { CurrencyFormatDirective } from '../directive/currency-format.directive';
import { StorageService } from '../services/localStorage.service';
import { LoginUserService } from '../auth/login/loginUser.service';
import { Company } from './company';
import { ProductsSearchModalComponent } from '../producto/components/products-search-modal/products-search-modal.component';
import { ModalClientsListComponent } from '../cliente/components/modal-clients-list/modal-clients-list.component';
import { ExpensesFabComponent } from '../expenses/expenses-fab.component';
import { ClientCreditService } from '../cuenta-cliente/services/client-credit.service';
import { UseCreditRequest } from '../cuenta-cliente/models/client-credit';
import { UseCreditModalComponent } from '../cuenta-cliente/components/use-credit-modal/use-credit-modal.component';
import { BatchService } from '../lotes/services/batch.service';
import { Batch, BATCH_REQUIRED_CATEGORY } from '../lotes/models/batch';
import { BatchSelectorModalComponent } from '../lotes/components/batch-selector-modal/batch-selector-modal.component';
import { BatchExpirationAlertComponent } from '../lotes/components/batch-expiration-alert/batch-expiration-alert.component';
import { BankAccountSelectComponent } from '../shared/components/bank-account-select/bank-account-select.component';
import { PreSaleWebSocketService } from '../preventa/services/pre-sale-websocket.service';
import { PreSaleService } from '../preventa/services/pre-sale.service';
import { PreSaleNotification } from '../preventa/models/pre-sale';

interface ProductSuggestion {
  product: Product;
  presentation: Presentation;
  displayName: string;
  barcode: string;
  price: number;
  brand: string;
}

@Component({
  selector: 'app-factura',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    CommonModule,
    DatePipe,
    CurrencyPipe,
    CurrencyFormatDirective,
    ProductsSearchModalComponent,
    ModalClientsListComponent,
    ExpensesFabComponent,
    UseCreditModalComponent,
    BatchSelectorModalComponent,
    BatchExpirationAlertComponent,
    BankAccountSelectComponent,
  ],
  templateUrl: './factura.component.html',
  styleUrl: './factura.component.css'
})
export class FacturaComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('productsAmountModal', { static: false }) productsAmountModalRef!: ElementRef;
  @ViewChild('amountProductInput', { static: false }) amountProductInput!: ElementRef<HTMLInputElement>;
  @ViewChild(ProductsSearchModalComponent, { static: false }) productsSearchModalComp!: ProductsSearchModalComponent;
  @ViewChild(ModalClientsListComponent, { static: false }) clientsModalComp!: ModalClientsListComponent;
  @ViewChild('reciveValueInput', { static: false }) reciveValueInput!: ElementRef<HTMLInputElement>;
  @ViewChild('productAutocompleteInput', { static: false }) productAutocompleteInputRef!: ElementRef<HTMLInputElement>;
  @ViewChild('productDropdownEl', { static: false }) productDropdownEl!: ElementRef<HTMLElement>;
  @ViewChild('confirmSaveModal', { static: false }) confirmSaveModalRef!: ElementRef;
  @ViewChild('multiPaymentModal', { static: false }) multiPaymentModalRef!: ElementRef;
  @ViewChild('cashAmountInput', { static: false }) cashAmountInput!: ElementRef<HTMLInputElement>;

  // Estado temporal para el modal de multipagos
  modalCashAmount: number = 0;
  modalOtherPayments: { method: string; amount: number; reference: string; bankAccountId?: string }[] = [];

  ngAfterViewInit() {
    // Configuración para el modal "Cantidad a vender"
    this.setFocusOnModal('productsAmountModal', this.amountProductInput);
    // Configuración para el modal de multipagos
    this.setFocusOnModal('multiPaymentModal', this.cashAmountInput);
  }

  // Handler al seleccionar una presentación desde el modal hijo
  onPresentationSelected(mappedProduct: Product) {
    // Verificar si el producto requiere selección de lote (ANIMALES VIVOS)
    if (this.requiresBatchSelection(mappedProduct)) {
      this.productForBatchSelection = mappedProduct;
      this.openBatchSelectorModal();
      return;
    }
    
    this.ProductToSell(mappedProduct);
    // Abrir modal para ingresar cantidad (packs o unidades) o total en caso de granel
    setTimeout(() => {
      this.openProductsAmountModal();
    }, 300);
  }

  // Verificar si el producto requiere selección de lote
  requiresBatchSelection(product: Product): boolean {
    return product.category?.toUpperCase() === BATCH_REQUIRED_CATEGORY;
  }

  // Abrir modal de selección de lotes
  openBatchSelectorModal(): void {
    this.showBatchSelectorModal = true;
    // Esperar a que Angular renderice el componente antes de manipular el DOM
    setTimeout(() => {
      const modal = document.getElementById('batchSelectorModal');
      if (modal) {
        modal.classList.add('show');
        modal.style.display = 'block';
        document.body.classList.add('modal-open');
      }
    }, 0);
  }

  // Handler cuando se selecciona un lote
  onBatchSelected(event: { batch: Batch; quantity: number }): void {
    if (!this.productForBatchSelection) return;
    
    // Configurar el producto con el precio del lote seleccionado
    const product = { ...this.productForBatchSelection };
    product.price = event.batch.salePrice;
    product.amount = event.quantity;
    
    // Agregar información del lote al producto
    (product as any).selectedBatch = event.batch;
    (product as any).batchId = event.batch.id;
    (product as any).batchNumber = event.batch.batchNumber;
    
    this.ProductToSell(product);
    this.productToSell.amount = event.quantity;
    this.productToSell.price = event.batch.salePrice;
    
    // Agregar directamente a la venta sin abrir modal de cantidad
    this.addProduct(this.productToSell);
    
    this.showBatchSelectorModal = false;
    this.productForBatchSelection = null;
    
    toast.success(`Lote #${event.batch.batchNumber} agregado: ${event.quantity} unidades`);
  }

  // Handler cuando se cancela la selección de lote
  onBatchSelectionCancelled(): void {
    this.showBatchSelectorModal = false;
    this.productForBatchSelection = null;
    document.body.classList.remove('modal-open');
    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
  }

  // Selección de presentación viene del modal hijo vía onPresentationSelected

  ngOnInit(): void {
    this.getClients();
    this.onInitBilling();
    // Recalcular vueltos cuando cambia el control de dinero recibido
    this.reciveValue.valueChanges.subscribe((val) => {
      this.onCalculateMoneyChange(val as unknown);
    });
    this.initPaymentsForm();
    this.paymentsForm.valueChanges.subscribe(() => {
      this.recalculateFromPayments();
    });
    // Mantener lista local para autocomplete y lector de código de barras
    this.productService.productos$.subscribe(products => {
      this.allProducts = products || [];
    });
    // Cargar preventas PENDING existentes via REST al abrir la pantalla
    this.preSaleService.list({ status: 'PENDING' }).subscribe({
      next: (preSales) => {
        preSales.forEach(ps => {
          if (!this.pendingPreSaleNotifications.find(n => n.preSaleId === ps.id)) {
            this.pendingPreSaleNotifications.push({
              preSaleId: ps.id,
              preSaleNumber: ps.preSaleNumber,
              sellerName: ps.sellerName,
              totalAmount: ps.totalAmount,
              itemCount: ps.items?.length ?? 0,
              createdAt: ps.createdAt,
            });
          }
        });
      },
      error: () => {},
    });
    // Conectar WebSocket para notificaciones de preventa en tiempo real
    const token = window.localStorage.getItem('authToken');
    if (token) {
      this.preSaleWebSocketService.connect(token);
      this.wsSubscription = this.preSaleWebSocketService.notifications$.subscribe(
        (notification) => {
          const idx = this.pendingPreSaleNotifications.findIndex(
            n => n.preSaleId === notification.preSaleId
          );
          if (idx >= 0) {
            this.pendingPreSaleNotifications[idx] = notification;
          } else {
            this.pendingPreSaleNotifications.push(notification);
          }
        }
      );
    }
  }

  ngOnDestroy(): void {
    this.wsSubscription?.unsubscribe();
    this.preSaleWebSocketService.disconnect();
  }

  // --- Autocomplete cliente ---
  clientSuggestions: Client[] = [];
  showClientDropdown = false;
  clientSearchInput = new FormControl('');

  // --- Autocomplete + lector código de barras (producto) ---
  allProducts: Product[] = [];
  productSuggestions: ProductSuggestion[] = [];
  showProductDropdown = false;
  productSearchInput = new FormControl('');
  clientActiveIndex = -1;
  productActiveIndex = -1;

  // --- Barcode scanner buffer ---
  private barcodeBuffer = '';
  private barcodeStartTime = 0;
  private barcodeClearTimer: any;

  client!: Client;
  @Input() factura!: Billing;
  product!: Product;

  facturaService = inject(FacturaService);
  clientService = inject(ClienteService);
  productService = inject(ProductoService);
  router = inject(Router);
  localStorage = inject(StorageService);
  loginUserService = inject(LoginUserService);
  clientCreditService = inject(ClientCreditService);
  batchService = inject(BatchService);
  private preSaleWebSocketService = inject(PreSaleWebSocketService);
  private preSaleService = inject(PreSaleService);

  pendingPreSaleNotifications: PreSaleNotification[] = [];
  showPreventaPanel = false;
  preventaPanelSortOrder: 'desc' | 'asc' = 'desc';
  private wsSubscription: Subscription | null = null;
  private importedPreSaleIds: string[] = [];
  private importedNotifications: PreSaleNotification[] = [];

  // Lotes para productos de ANIMALES VIVOS
  showBatchSelectorModal = false;
  productForBatchSelection: Product | null = null;
  availableBatches: Batch[] = [];

  // Saldo a favor del cliente
  clientCreditBalance: number = 0;
  creditToApply: number = 0;
  showCreditModal: boolean = false;
  // Crédito aplicado en el modal de multipagos
  modalCreditApplied: number = 0;
  // Monto parcial ingresado por el usuario para aplicar del saldo
  creditInputAmount: number = 0;

  saleDetails: SaleDetail[] = [];
  // Vista previa en modo granel/peso
  bulkComputedAmount: number = 0;
  bulkInputValue: number = 0;  // Monto exacto ingresado por el usuario

  originalListClients: Client[] = [];
  filteredListClients: Client[] = [];

  // Listado y búsqueda de productos ahora es responsabilidad del componente hijo
  productToSell: Product = new Product();

  totalBilling: number = 0;
  totalVatBilling: number = 0;
  totalMoneyChange: number = 0;
  totalRecivedValue: number = 0;
  paymentMethod: string = 'EFECTIVO';
  // Tipo de venta: CONTADO o CREDITO
  paymentType: 'CONTADO' | 'CREDITO' = 'CONTADO';

  reciveValue = new FormControl('');

  paymentsForm = new FormArray<FormGroup<{
    method: FormControl<string>;
    amount: FormControl<string>;
    reference: FormControl<string>;
    bankAccountId: FormControl<string>;
  }>>([]);

  pdfSrc: any;

  formOrden = new FormGroup({
    numeroOrden: new FormControl('')
  });

  formClient = new FormGroup({
    searchClient: new FormControl('')
  });

  // Formulario de búsqueda de productos eliminado (lo maneja el hijo)

  formProductAmount = new FormGroup({
    amountProduct: new FormControl('')
  });

  private setFocusOnModal(modalId: string, inputRef: ElementRef<HTMLInputElement>) {
    const modalElement = document.getElementById(modalId);
    if (modalElement) {
      modalElement.addEventListener('shown.bs.modal', () => {
        setTimeout(() => {
          inputRef.nativeElement.focus();
          inputRef.nativeElement.select(); // Seleccionar texto si hay
        }, 100);
      });
    }
  }

  // Cambia tipo de venta (contado/crédito)
  setPaymentType(type: 'CONTADO' | 'CREDITO') {
    this.paymentType = type;
    if (type === 'CREDITO') {
      // En crédito no exigimos dinero recibido y no hay vueltas
      this.reciveValue.setValue('');
      this.totalRecivedValue = 0;
      this.totalMoneyChange = 0;
      // No permitir "consumidor final" para crédito
      if (this.client && this.isConsumidorFinal(this.client)) {
        toast.warning('Para ventas a CRÉDITO debe seleccionar un cliente distinto a "Consumidor Final".');
        this.client = new Client();
      }
    } else {
      // En contado, restablecer
      this.reciveValue.setValue('');
      this.totalRecivedValue = 0;
      this.totalMoneyChange = 0;
      // Asegurar cliente por defecto para CONTADO
      this.ensureDefaultClientForContado();
    }
    this.recalculateFromPayments();
  }

  // Heurística para identificar consumidor final. Ajustar según sus datos.
  private isConsumidorFinal(client: Client): boolean {
    // Detección por documento (fuente de verdad)
    const id = (client?.idNumber || '').trim();
    if (id === '22222222222') return true;

    // Fallback por nombre/razón social/apodo
    const name = `${(client?.name || '').trim()} ${(client?.surname || '').trim()}`.trim().toUpperCase();
    const business = (client?.businessName || '').trim().toUpperCase();
    const nick = (client?.nickname || '').trim().toUpperCase();
    return name === 'CONSUMIDOR FINAL' || business === 'CONSUMIDOR FINAL' || nick === 'CONSUMIDOR FINAL';
  }

  ProductToSell(product: Product) {
    this.productToSell = product;
  }

  onAddProductFromList(producto: Product) {
    this.ProductToSell(producto);
    this.closeProductModal();

    setTimeout(() => {
      this.openProductsAmountModal();
    }, 300);
  }


  addAmountProduct() {
    const rawInput = (this.formProductAmount.controls.amountProduct.value ?? '').toString().trim();

    if (rawInput === '') {
      toast.warning('Debe ingresar un valor.');
      return;
    }

    const numeric = Number(rawInput.replace(/,/g, '.'));
    if (isNaN(numeric) || numeric <= 0) {
      toast.warning('El valor ingresado debe ser numérico y mayor a 0.');
      return;
    }

    // Si es granel, el usuario ingresa el TOTAL vendido (dinero) y calculamos la cantidad
    let resolvedAmount = 0;
    let bulkInputAmount: number | undefined = undefined;
    
    if (this.productToSell?.isBulk) {
      const unitPrice = Number(this.productToSell.price) || 0;
      if (unitPrice <= 0) {
        toast.error('Precio unitario inválido para calcular cantidad por granel.');
        return;
      }
      const totalMoney = numeric;
      bulkInputAmount = totalMoney; // Guardar el monto exacto ingresado
      // Calcular cantidad redondeada a 4 decimales
      resolvedAmount = Math.round((totalMoney / unitPrice) * 10000) / 10000;
    } else {
      // Caso normal: el usuario ingresa la CANTIDAD
      resolvedAmount = numeric;
    }

    if (resolvedAmount > 0) {
      this.productToSell.amount = resolvedAmount;
      // Guardar el monto de granel en el producto temporalmente
      (this.productToSell as any)._bulkInputAmount = bulkInputAmount;
      
      // Actualizar si ya existe en el detalle
      const existingDetail = this.saleDetails.find(detail => detail.product.barcode === this.productToSell.barcode);
      if (existingDetail) {
        existingDetail.amount = resolvedAmount;
        existingDetail.isBulkSale = !!bulkInputAmount;
        existingDetail.bulkInputAmount = bulkInputAmount;
        // Para granel: subtotal = monto exacto ingresado; para normal: cantidad * precio
        existingDetail.subTotal = bulkInputAmount ?? (resolvedAmount * this.productToSell.price);
      } else {
        this.addProduct(this.productToSell);
      }
      this.clearProductAmountField();
    } else {
      toast.warning('La cantidad calculada debe ser mayor a 0.');
    }

    this.closeProductAmountModal();
  }

  clearProductAmountField() {
    this.formProductAmount.reset();
    this.bulkComputedAmount = 0;
    this.bulkInputValue = 0;
    const prodductAmountModal = document.getElementById('productsAmountModal');
    (prodductAmountModal?.getElementsByClassName('btn-close').item(0) as HTMLElement)?.click();
  }

  changePaymentMethod(event: any) {
    debugger
    this.paymentMethod = event.target.value;

    if (this.paymentMethod != 'EFECTIVO') {
      // Asignar como string para cumplir tipado actual del control
      this.reciveValue.setValue(this.totalBilling.toString());
      this.totalRecivedValue = Number(this.totalBilling) || 0;
      this.totalMoneyChange = 0;
    } else {
      this.reciveValue.setValue('0');
      this.totalRecivedValue = 0;
      this.totalMoneyChange = 0;
    }
  }

  saveBilling() {
    if (this.isValidBillingData()) {
      const userLogin = this.loginUserService.getUserFromToken();
      const billingType = this.totalBilling > 250000 ? 'ELECTRONICA' : 'FISICA';
      const payments = this.getPaymentsValues();
      const paymentMethods = Array.from(new Set(payments.filter(p => (p.amount || 0) > 0).map(p => p.method)));
      const totals = this.computeTotalsFromPayments(payments);
      this.factura = {
        ...this.factura,
        id: null,
        client: this.client,
        saleDetails: this.saleDetails,
        subTotalSale: this.totalBilling,
        totalIVAT: this.totalVatBilling,
        receivedValue: totals.totalReceived,
        returnedValue: totals.change,
        totalBilling: this.totalBilling,
        creationUser: userLogin,
        paymentMethods: paymentMethods.length ? paymentMethods : [this.paymentMethod],
        payments: payments,
        company: userLogin.company,
        billingType: billingType,
        dateTimeRecord: formatInTimeZone(new Date(), 'America/Bogota', "yyyy-MM-dd'T'HH:mm:ssXXX"),
        saleType: saleTypeFromString(this.paymentType) ?? saleType.CONTADO,
      };

      // Abrir modal de confirmación (control por teclado)
      this.openConfirmSaveModal();

    }
  }

  printTicketBilling() {
    this.facturaService.getBillingByNumber(this.factura.billNumber).subscribe({

      next: res => {
        this.facturaService.printTicketBilling(res).subscribe(printPDF => {
          this.pdfSrc = URL.createObjectURL(printPDF);
          const iframe = document.createElement('iframe');
          iframe.style.display = 'none';
          iframe.src = this.pdfSrc;
          document.body.appendChild(iframe);
          iframe?.contentWindow?.print();
        });
      },
      error: error => {
        if (error.error && error.status == 404) {
          toast.warning(`La factura No. ${this.factura.billNumber} NO se encuentra registrada.`);
        } else {
          toast.error('Ocurrió un error al buscar la factura.', error);
        }
      }
    }).unsubscribe(); // Close the subscribe
  }

  isValidBillingData() {
    // Recalcular totales antes de validar
    this.calculateTotalBilling();

    // Validación: Cliente requerido
    if (!this.client || !this.client.id) {
      if (this.paymentType === 'CONTADO') {
        // Intentar auto-asignar Consumidor Final y revalidar
        this.ensureDefaultClientForContado();
        if (!this.client || !this.client.id) {
          toast.warning('Para ventas de CONTADO debe seleccionar un cliente (sugerido: Consumidor Final).');
          return false;
        }
      } else {
        toast.warning('Por favor selecciona un cliente.');
        return false;
      }
    }

    // Validación: En crédito no se permite "Consumidor Final"
    if (this.paymentType === 'CREDITO' && this.isConsumidorFinal(this.client)) {
      toast.warning('Para ventas a CRÉDITO debe seleccionar un cliente distinto a "Consumidor Final".');
      return false;
    }

    // Validación: Dinero recibido (solo CONTADO)
    if (this.paymentType === 'CONTADO' && (this.totalRecivedValue || 0) < (this.totalBilling || 0)) {
      toast.warning('En ventas de CONTADO, el dinero recibido debe ser mayor o igual al total.');
      return false;
    }

    // Validación: Debe haber al menos un producto
    if (!this.saleDetails || this.saleDetails.length < 1) {
      toast.warning('Por favor selecciona un producto.');
      return false;
    }

    return true;
  }

  // Asigna cliente "Consumidor Final" si estamos en CONTADO y no hay cliente seleccionado
  private ensureDefaultClientForContado() {
    if (this.paymentType !== 'CONTADO') return;
    if (this.client && this.client.id) return;
    const cf = this.findConsumidorFinal();
    if (cf) {
      this.client = cf;
    }
  }

  // Busca Consumidor Final en el listado
  private findConsumidorFinal(): Client | undefined {
    if (!this.originalListClients?.length) return undefined;
    const byId = this.originalListClients.find(c => (c.idNumber || '').trim() === '22222222222');
    if (byId) return byId;
    const upper = (s: string | undefined) => (s || '').trim().toUpperCase();
    return this.originalListClients.find(c =>
      upper(`${c.name} ${c.surname}`) === 'CONSUMIDOR FINAL' ||
      upper(c.businessName) === 'CONSUMIDOR FINAL' ||
      upper(c.nickname) === 'CONSUMIDOR FINAL'
    );
  }

  // Client Logic Section
  getClients() {
    this.clientService.getAll().subscribe({
      next: res => {
        this.originalListClients = res;
        this.filteredListClients = [...this.originalListClients];
        // Si estamos en CONTADO y no hay cliente seleccionado, asignar Consumidor Final si existe
        this.ensureDefaultClientForContado();
      },
      error: error => {
        if (error.error) {
          toast.error(error.error);
        } else {
          toast.error('Ocurrió un error al buscar los clientes');
        }
      }
    });
  }

  searchClient() {
    const searchClient = this.formClient.controls.searchClient.value ?? '';
    if (searchClient) {
      this.filteredListClients = this.originalListClients.filter(client =>
        client.idNumber.toLowerCase().includes(searchClient) ||
        client.name.toLowerCase().includes(searchClient) ||
        client.surname.toLowerCase().includes(searchClient)
      );
    } else {
      this.filteredListClients = [...this.originalListClients];
    }

    if (this.filteredListClients.length === 0) {
      toast.info('No se encontró ningún cliente con ese criterio');
    }
  }

  clearClientSearchField() {
    this.formClient.reset();
    this.filteredListClients = [...this.originalListClients];
  }

  // Eliminado: getAllProducts (lo maneja el hijo)

  orderSelect(order: Order) {
    this.facturaService.importOrdenToSale(order.orderNumber).subscribe({
      next: res => {
        this.factura = res;
        this.client = this.factura.client;
        this.saleDetails = this.factura.saleDetails;
      },
      error: error => {
        if (error.error) {
          toast.error(error.error);
        } else {
          toast.error('Ocurrió un error al buscar el registro');
        }
      }
    });
  }

  // Eliminado: paginación de productos (lo maneja el hijo)

  // Eliminado: búsqueda de productos (lo maneja el hijo)

  // Ends of product logic

  // Handle selected client
  selectClient(client: Client) {
    // Evitar seleccionar consumidor final cuando el tipo de venta es CRÉDITO
    if (this.paymentType === 'CREDITO' && this.isConsumidorFinal(client)) {
      toast.warning('No se puede seleccionar "Consumidor Final" para ventas a CRÉDITO.');
      return;
    }
    this.client = client;
    this.creditToApply = 0;
    this.checkClientCredit(client);
    setTimeout(() => this.focusProductSearch(), 350);
  }

  // Verificar si el cliente tiene saldo a favor
  private checkClientCredit(client: Client): void {
    if (!client || !client.id || this.isConsumidorFinal(client)) {
      this.clientCreditBalance = 0;
      return;
    }

    // Usar getByClientId que devuelve el objeto ClientCredit completo con currentBalance
    this.clientCreditService.getByClientId(client.id).subscribe({
      next: (credit) => {
        this.clientCreditBalance = credit?.currentBalance || 0;
        if (this.clientCreditBalance > 0) {
          toast.info(`El cliente tiene un saldo a favor de $${this.clientCreditBalance.toLocaleString('es-CO')}`);
        }
      },
      error: () => {
        this.clientCreditBalance = 0;
      }
    });
  }

  // Abrir modal para usar saldo a favor
  openUseCreditModal(): void {
    if (this.clientCreditBalance <= 0) {
      toast.warning('El cliente no tiene saldo a favor disponible.');
      return;
    }
    if (this.totalBilling <= 0) {
      toast.warning('Agregue productos antes de aplicar el saldo a favor.');
      return;
    }
    const modal = document.getElementById('useCreditModal');
    if (modal) {
      modal.classList.add('show');
      modal.style.display = 'block';
      document.body.classList.add('modal-open');
    }
  }

  // Manejar cuando se aplica el saldo a favor
  onCreditUsed(event: { amount: number }): void {
    this.creditToApply = event.amount;
    toast.success(`Se aplicará $${this.creditToApply.toLocaleString('es-CO')} del saldo a favor.`);
    this.recalculateWithCredit();
  }

  // Manejar cuando se cancela el uso del saldo
  onCreditCancelled(): void {
    this.creditToApply = 0;
    document.body.classList.remove('modal-open');
    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
  }

  // Recalcular totales considerando el saldo a favor aplicado
  private recalculateWithCredit(): void {
    const totalAfterCredit = Math.max(0, this.totalBilling - this.creditToApply);
    if (this.paymentType === 'CONTADO') {
      // Ajustar el monto que debe pagar el cliente
      if (totalAfterCredit === 0) {
        // Todo cubierto por saldo a favor
        this.totalRecivedValue = 0;
        this.totalMoneyChange = 0;
        this.reciveValue.setValue('0');
      }
    }
  }

  // Obtener el total a pagar después de aplicar saldo a favor
  get totalAfterCredit(): number {
    return Math.max(0, this.totalBilling - this.creditToApply);
  }

  mapProductToSaleDetail(selectProduct: Product): SaleDetail {
    // Verificar si es venta a granel con monto exacto
    const bulkInputAmount = (selectProduct as any)._bulkInputAmount as number | undefined;
    const isBulkSale = !!bulkInputAmount;
    
    // Obtener batchId si existe (para productos de ANIMALES VIVOS)
    const batchId = (selectProduct as any).batchId as string | undefined;
    
    // Para granel: subtotal = monto exacto ingresado por el usuario
    // Para normal: subtotal = cantidad * precio
    const subTotal = bulkInputAmount ?? (selectProduct.amount * selectProduct.price);
    
    // Obtener el costo unitario de la presentación seleccionada (costPrice) como fallback
    const matchedPresentation = (selectProduct.presentations || []).find(
      pres => pres.barcode === selectProduct.barcode
    );
    const unitCost = matchedPresentation?.costPrice || 0;

    const saleDetail: SaleDetail = {
      id: selectProduct.id,
      product: selectProduct,
      amount: selectProduct.amount,
      unitPrice: selectProduct.price,
      unitCost: unitCost,
      subTotal: subTotal,
      totalVat: 0,
      isBulkSale: isBulkSale,
      bulkInputAmount: bulkInputAmount,
      batchId: batchId
    };
    
    // Limpiar los campos temporales del producto
    delete (selectProduct as any)._bulkInputAmount;
    delete (selectProduct as any).batchId;

    // Suscribimos a `calculateVatPrice` y asignamos `totalVat` cuando esté listo
    /* this.calculateVatPrice(selectProduct.price, selectProduct.amount, selectProduct.vatType)
       .subscribe(totalVat => {
         saleDetail.totalVat = totalVat;
       });*/

    return saleDetail;
  }

  // Handle selected products
  addProduct(product: Product) {
    const detail = this.saleDetails.find(detail => detail.product.barcode === product.barcode);
    if (detail) {
      // Para granel: mantener el subtotal exacto (bulkInputAmount)
      // Para normal: recalcular como cantidad * precio
      if (detail.isBulkSale && detail.bulkInputAmount) {
        detail.subTotal = detail.bulkInputAmount;
      } else {
        detail.subTotal = detail.amount * product.price;
      }
      return;
    }

    if (!product.amount) {
      product.amount = 1;
    }

    // Para granel con monto exacto, usar ese monto; sino calcular normal
    const bulkAmount = (product as any)._bulkInputAmount;
    product.totalValue = bulkAmount ?? (product.amount * product.price);

    this.saleDetails.push(this.mapProductToSaleDetail(product));
  }

  // Handle calculated vats total products
  calculateVatPrice(price: number, quantity: number, vat: EVatType): Observable<number> {
    return new Observable((observer) => {
      // Recupera el array de IVA desde localStorage y lo convierte a JSON
      const vats = JSON.parse(localStorage.getItem("allTypeVats") || '[]');

      // Encuentra el tipo de IVA en el array
      const vatData = vats.find((item: { vatType: EVatType }) => item.vatType === vat);

      if (vatData) {
        // Calcula el precio con el IVA
        const vatPercentage = vatData.percentage / 100;
        const totalPrice = price * quantity * vatPercentage;

        // Devuelve el valor calculado
        observer.next(totalPrice);
      } else {
        // Si no se encuentra el tipo de IVA, devuelve 0
        observer.next(0);
      }

      observer.complete();
    });
  }



  onCantidadChange(event: any, index: number) {
    const nuevoValor = event.target.value;
    this.product = this.saleDetails[index].product;
    this.product.amount = parseInt(nuevoValor);
    this.product.totalValue = this.product.amount * this.product.price;
    this.saleDetails[index] = this.mapProductToSaleDetail(this.product);
  }

  onUnitValueChange(event: any, index: number) {
    const newUnitValue = event.target.value;
    const unitPrice = newUnitValue.replace(/[^\d]/g, '');
    this.product = this.saleDetails[index].product;
    this.product.amount = this.saleDetails[index].amount;
    this.product.price = parseInt(unitPrice);
    this.product.totalValue = this.product.amount * this.product.price;
    this.saleDetails[index] = this.mapProductToSaleDetail(this.product);
  }

  sumarCantidad(index: number) {
    this.product = this.saleDetails[index].product;
    this.product.amount = this.saleDetails[index].amount;
    this.product.price = this.saleDetails[index].unitPrice;
    this.product.vatValue = this.saleDetails[index].totalVat;
    this.product.amount += 1;
    this.product.totalValue = this.product.amount * this.product.price;
    this.saleDetails[index] = this.mapProductToSaleDetail(this.product);
    this.totalBilling = this.saleDetails.reduce((total, producto) => total + producto.subTotal, 0);
  }

  restarCantidad(index: number, amount: number) {
    this.product = this.saleDetails[index].product;
    this.product.amount = amount;
    if (this.product.amount > 1) {
      this.product.price = this.saleDetails[index].unitPrice;
      this.product.vatValue = this.saleDetails[index].totalVat;
      this.product.amount = this.product.amount - 1;
      this.product.totalValue = this.product.amount * this.product.price;
      this.saleDetails[index] = this.mapProductToSaleDetail(this.product);
      this.totalBilling = this.saleDetails.reduce((total, producto) => total + producto.subTotal, 0);
    }

  }

  deleteProductOfList(index: number) {
    this.saleDetails.splice(index, 1);
    this.totalBilling = this.saleDetails.reduce((total, producto) => total + producto.subTotal, 0);
  }

  calculateTotalBilling() {
    this.totalBilling = this.saleDetails.reduce((total, producto) => total + producto.subTotal, 0);
    return this.totalBilling;
  }

  calculateTotalVat() {
    this.totalVatBilling = this.saleDetails.reduce((total, producto) => total + producto.totalVat, 0);
    return this.totalVatBilling;
  }

  // Normaliza entradas monetarias a número (acepta number o string con formato)
  private normalizeToNumber(value: unknown): number {
    if (typeof value === 'number') return isFinite(value) ? value : 0;
    if (typeof value === 'string') {
      const raw = value
        .toString()
        .replace(/[\s$\u00A0]/g, '')        // espacios y símbolos de moneda
        .replace(/\.(?=\d{3}(\D|$))/g, '') // puntos de miles
        .replace(/,/g, '.')                   // coma decimal a punto
        .replace(/[^0-9.\-]/g, '');          // limpiar residuos
      const n = Number(raw);
      return isNaN(n) ? 0 : n;
    }
    return 0;
  }

  // Actualiza dinero recibido y calcula vueltos (residuo positivo)
  onCalculateMoneyChange(value: unknown) {
    const received = this.normalizeToNumber(value);
    this.totalRecivedValue = received > 0 ? received : 0;
    const diff = this.totalRecivedValue - (this.totalBilling || 0);
    // Vueltos solo si supera o iguala el total; en caso contrario, 0
    this.totalMoneyChange = diff >= 0 ? diff : 0;
    // Sincroniza el primer renglón de pagos con el campo clásico cuando es CONTADO
    if (this.paymentType === 'CONTADO' && this.paymentsForm.length > 0) {
      const first = this.paymentsForm.at(0);
      (first.controls as any)['method'].setValue('EFECTIVO', { emitEvent: false });
      (first.controls as any)['amount'].setValue(String(received), { emitEvent: false });
      this.recalculateFromPayments();
    }
  }

  private initPaymentsForm() {
    if (this.paymentsForm.length === 0) {
      this.paymentsForm.push(new FormGroup<{
        method: FormControl<string>;
        amount: FormControl<string>;
        reference: FormControl<string>;
        bankAccountId: FormControl<string>;
      }>({
        method: new FormControl<string>('EFECTIVO', { nonNullable: true }),
        amount: new FormControl<string>('0', { nonNullable: true }),
        reference: new FormControl<string>('', { nonNullable: true }),
        bankAccountId: new FormControl<string>('', { nonNullable: true })
      }));
    }
  }

  private resetPaymentsForm() {
    while (this.paymentsForm.length) {
      this.paymentsForm.removeAt(0);
    }
    this.initPaymentsForm();
    this.recalculateFromPayments();
  }

  addPaymentRow() {
    this.paymentsForm.push(new FormGroup<{
      method: FormControl<string>;
      amount: FormControl<string>;
      reference: FormControl<string>;
      bankAccountId: FormControl<string>;
    }>({
      method: new FormControl<string>('TRANSFERENCIA', { nonNullable: true }),
      amount: new FormControl<string>('0', { nonNullable: true }),
      reference: new FormControl<string>('', { nonNullable: true }),
      bankAccountId: new FormControl<string>('', { nonNullable: true })
    }));
  }

  removePaymentRow(index: number) {
    if (this.paymentsForm.length > 1) {
      this.paymentsForm.removeAt(index);
      this.recalculateFromPayments();
    }
  }

  get paymentControls() { return this.paymentsForm.controls; }

  private getPaymentsValues(): { method: string; amount: number; reference?: string; bankAccountId?: string }[] {
    return this.paymentsForm.controls.map(ctrl => {
      const g = ctrl as FormGroup<{ method: FormControl<string>; amount: FormControl<string>; reference: FormControl<string>; bankAccountId: FormControl<string>; }>;
      const rawAmount = g.controls['amount'].value as unknown;
      return {
        method: (g.controls['method'].value as string) || 'EFECTIVO',
        amount: this.normalizeToNumber(rawAmount),
        reference: (g.controls['reference'].value as string) || '',
        bankAccountId: (g.controls['bankAccountId'].value as string) || undefined
      };
    });
  }

  private computeTotalsFromPayments(payments: { method: string; amount: number }[]) {
    const total = this.totalBilling || 0;
    const nonCash = payments.filter(p => p.method !== 'EFECTIVO').reduce((a, b) => a + (b.amount || 0), 0);
    const cash = payments.filter(p => p.method === 'EFECTIVO').reduce((a, b) => a + (b.amount || 0), 0);
    const totalReceived = (cash + nonCash) || 0;
    const remainingAfterNonCash = Math.max(0, total - nonCash);
    const change = Math.max(0, cash - remainingAfterNonCash);
    return { totalReceived, change };
  }

  private recalculateFromPayments() {
    const payments = this.getPaymentsValues();
    const totals = this.computeTotalsFromPayments(payments);
    if (this.paymentType === 'CONTADO') {
      this.totalRecivedValue = totals.totalReceived;
      this.totalMoneyChange = totals.change;
    } else {
      this.totalRecivedValue = 0;
      this.totalMoneyChange = 0;
    }
  }
  onInitBilling() {
    this.facturaService.getLastBillingNumber().subscribe(res => {
      this.factura = new Billing();
      this.saleDetails = [];
      this.totalRecivedValue = 0;
      this.totalMoneyChange = 0;
      // Iniciar como '0' para cumplir tipado actual del control
      this.reciveValue.setValue('0');
      this.pdfSrc = '';
      this.factura = {
        ...this.factura,
        billNumber: res.billingNumber,
        dateTimeRecord: formatInTimeZone(new Date(), 'America/Bogota', "yyyy-MM-dd'T'HH:mm:ssXXX"),
        order: new Order(),
        company: new Company(),
      }
      // Tipo de venta CONTADO y cliente Consumidor Final por defecto
      this.paymentType = 'CONTADO';
      this.client = new Client();
      this.creditToApply = 0;
      this.clientCreditBalance = 0;
      // Restaurar al panel las preventas importadas pero no facturadas (canceló sin guardar)
      this.importedNotifications.forEach(n => {
        if (!this.pendingPreSaleNotifications.find(x => x.preSaleId === n.preSaleId)) {
          this.pendingPreSaleNotifications.unshift(n);
        }
      });
      this.importedPreSaleIds = [];
      this.importedNotifications = [];
      this.ensureDefaultClientForContado();
      this.resetPaymentsForm();
    });
  }

  @HostListener('document:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {

    if (event.ctrlKey && event.key.toLowerCase() === 'F9') {
      event.preventDefault();
      this.printTicketBilling();
    }

    if (event.key === 'F2') {
      event.preventDefault();
      this.onInitBilling();
    }

    if (event.key === 'F3') {
      event.preventDefault();
      this.focusProductSearch();
    }

    if (event.key === 'F4') {
      event.preventDefault();
      this.saveBilling();
    }

    if (event.key === 'F9' && this.paymentType !== 'CREDITO') {
      event.preventDefault();
      this.openMultiPaymentModal();
    }

    // Evitar atajos cuando se está escribiendo en algún control
    const target = event.target as HTMLElement | null;
    const tag = (target?.tagName || '').toLowerCase();
    const isTyping = tag === 'input' || tag === 'textarea' || tag === 'select' || (target?.isContentEditable ?? false);
    if (!isTyping) {
      // --- Lector código de barras: acumular caracteres ---
      if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
        if (this.barcodeBuffer.length === 0) {
          this.barcodeStartTime = Date.now();
        }
        this.barcodeBuffer += event.key;
        clearTimeout(this.barcodeClearTimer);
        this.barcodeClearTimer = setTimeout(() => { this.barcodeBuffer = ''; }, 500);
      }
      if (event.key === 'Enter') {
        clearTimeout(this.barcodeClearTimer);
        const elapsed = Date.now() - this.barcodeStartTime;
        if (this.barcodeBuffer.length >= 3 && elapsed < 500) {
          event.preventDefault();
          const code = this.barcodeBuffer.trim();
          this.barcodeBuffer = '';
          this.searchProductByBarcode(code);
          return;
        }
        this.barcodeBuffer = '';
      }
      // Confirm modal keyboard handling
      if (this.isConfirmOpen()) {
        if (event.key === 'Enter' || event.key.toLowerCase() === 'y') {
          event.preventDefault();
          this.confirmSaveBilling();
          return;
        }
        if (event.key === 'Escape' || event.key.toLowerCase() === 'n') {
          event.preventDefault();
          this.cancelSaveBilling();
          return;
        }
      }
      // Atajo de una sola tecla: F8 para enfocar "Dinero Recibido"
      if (event.key === 'F8') {
        event.preventDefault();
        try {
          const el = this.reciveValueInput?.nativeElement;
          el?.focus();
          el?.select();
        } catch { /* noop */ }
      }
    }
  }

  private openConfirmSaveModal() {
    try {
      const el = this.confirmSaveModalRef?.nativeElement;
      if (!el) return;
      const Modal = (window as any).bootstrap?.Modal;
      const instance = Modal?.getOrCreateInstance(el);
      instance?.show();
    } catch { /* noop */ }
  }

  private closeConfirmSaveModal() {
    try {
      const el = this.confirmSaveModalRef?.nativeElement;
      if (!el) return;
      const Modal = (window as any).bootstrap?.Modal;
      const instance = Modal?.getInstance(el) || Modal?.getOrCreateInstance(el);
      instance?.hide();
    } catch { /* noop */ }
  }

  private isConfirmOpen(): boolean {
    const el = this.confirmSaveModalRef?.nativeElement as HTMLElement | undefined;
    return !!el && el.classList.contains('show');
  }

  confirmSaveBilling() {
    // Ejecutar guardado real
    this.closeConfirmSaveModal();
    this.facturaService.save(this.factura).subscribe({
      next: (factura) => {
        if (factura.id) {
          // Vincular preventas importadas a esta factura
          const billedPreSaleIds = [...this.importedPreSaleIds];
          billedPreSaleIds.forEach(preSaleId => {
            this.preSaleService.markAsBilled(preSaleId, factura.id).subscribe();
          });

          // Limpiar tracking ANTES de onInitBilling para que no restaure las notificaciones
          this.importedPreSaleIds = [];
          this.importedNotifications = [];

          // Verificar si hay pago con saldo a favor para descontarlo
          const creditPayment = this.factura.payments?.find(p => p.method === 'SALDO_FAVOR');
          if (creditPayment && creditPayment.amount > 0 && this.client?.id) {
            this.useCreditForBilling(factura.id, creditPayment.amount);
          }

          toast.success('La Factura fue registrada correctamente.');
          this.onInitBilling();
          // Refrescar listado de productos para actualizar stock
          this.productService.fetchAll();
        }
      },
      error: (err) => {
        const e = err?.error;
        if (e?.errors && typeof e.errors === 'object') {
          const msgs = Object.values(e.errors as Record<string, string>).filter(Boolean) as string[];
          if (msgs.length) { msgs.forEach(m => toast.warning(m)); return; }
        }
        toast.error(e?.message || 'Error al guardar la factura. Intente nuevamente.');
      }
    });
  }

  /**
   * Descuenta el saldo a favor del cliente cuando se usa en una factura
   */
  private useCreditForBilling(billingId: string, amount: number): void {
    if (!this.client?.id || amount <= 0) return;

    const request: UseCreditRequest = {
      clientId: this.client.id,
      amount: amount,
      billingId: billingId,
      notes: `Pago aplicado a factura`
    };

    this.clientCreditService.useCredit(request).subscribe({
      next: () => {
        toast.info(`Se descontó $${amount.toLocaleString('es-CO')} del saldo a favor del cliente.`);
      },
      error: (err) => {
        console.error('Error al descontar saldo a favor:', err);
        toast.warning('La factura se guardó pero hubo un error al descontar el saldo a favor. Verifique manualmente.');
      }
    });
  }

  cancelSaveBilling() {
    this.closeConfirmSaveModal();
  }

  openProductsModal() {
    this.productsSearchModalComp?.openModal();
  }

  openClientsModal() {
    this.clientsModalComp?.openModal();
  }

  returnToProductsModal() {
    this.closeProductAmountModal();
    setTimeout(() => {
      this.openProductsModal();
    }, 300);
  }

  openProductsAmountModal() {
    const modalEl = this.productsAmountModalRef?.nativeElement;
    if (modalEl) {
      // Resetear vista previa antes de abrir
      this.bulkComputedAmount = 0;
      this.bulkInputValue = 0;
      const modal = new (window as any).bootstrap.Modal(modalEl);
      modal.show();

      modalEl.addEventListener('shown.bs.modal', () => {
        this.amountProductInput?.nativeElement.focus();
        this.amountProductInput?.nativeElement.select();
      }, { once: true }); // solo la primera vez
    }
  }

  closeProductAmountModal() {
    const modalEl = this.productsAmountModalRef?.nativeElement;
    const modalInstance = (window as any).bootstrap?.Modal.getInstance(modalEl);
    modalInstance?.hide();
  }


  closeProductModal() {
    this.productsSearchModalComp?.closeModal();
  }

  // Handler para el input monetario en modo granel/peso
  onBulkTotalInput(value: unknown) {
    // Normalizar a número aunque venga formateado como string ("$ 5.000,00")
    let numeric = NaN;
    if (typeof value === 'number') {
      numeric = value;
    } else if (typeof value === 'string') {
      const raw = value
        .toString()
        .replace(/[^\d.,-]/g, '')      // quitar símbolos
        .replace(/\.(?=\d{3}(\D|$))/g, '') // quitar puntos de miles
        .replace(',', '.');             // usar punto como decimal
      numeric = Number(raw);
    }

    if (!isNaN(numeric)) {
      this.formProductAmount.controls.amountProduct.setValue(numeric.toString());
      const unitPrice = Number(this.productToSell?.price) || 0;
      // Guardar el monto exacto ingresado (sin redondeo)
      this.bulkInputValue = numeric;
      // Calcular cantidad redondeada a 4 decimales para referencia visual
      this.bulkComputedAmount = unitPrice > 0 ? Math.round((numeric / unitPrice) * 10000) / 10000 : 0;
    } else {
      this.bulkComputedAmount = 0;
      this.bulkInputValue = 0;
    }
  }

  // =============================================
  // MODAL DE MULTIPAGOS
  // =============================================

  openMultiPaymentModal() {
    this.loadPaymentsToModal();
    const modalEl = this.multiPaymentModalRef?.nativeElement;
    if (modalEl) {
      const modal = new (window as any).bootstrap.Modal(modalEl);
      modal.show();
      modalEl.addEventListener('shown.bs.modal', () => {
        this.cashAmountInput?.nativeElement?.focus();
        this.cashAmountInput?.nativeElement?.select();
      }, { once: true });
    }
  }

  closeMultiPaymentModal() {
    const modalEl = this.multiPaymentModalRef?.nativeElement;
    const modalInstance = (window as any).bootstrap?.Modal.getInstance(modalEl);
    modalInstance?.hide();
  }

  private loadPaymentsToModal() {
    const payments = this.getPaymentsValues();
    const cashPayment = payments.find(p => p.method === 'EFECTIVO');
    this.modalCashAmount = cashPayment?.amount || 0;
    this.modalOtherPayments = payments
      .filter(p => p.method !== 'EFECTIVO' && p.method !== 'SALDO_FAVOR')
      .map(p => ({ method: p.method, amount: p.amount, reference: p.reference || '', bankAccountId: (p as any).bankAccountId || '' }));
    // Cargar el saldo a favor aplicado previamente
    const creditPayment = payments.find(p => p.method === 'SALDO_FAVOR');
    this.modalCreditApplied = creditPayment?.amount || 0;
  }

  private syncModalToPaymentsForm() {
    while (this.paymentsForm.length) {
      this.paymentsForm.removeAt(0);
    }
    // Agregar saldo a favor si se aplicó
    if (this.modalCreditApplied > 0) {
      this.paymentsForm.push(new FormGroup<{
        method: FormControl<string>;
        amount: FormControl<string>;
        reference: FormControl<string>;
        bankAccountId: FormControl<string>;
      }>({
        method: new FormControl<string>('SALDO_FAVOR', { nonNullable: true }),
        amount: new FormControl<string>(String(this.modalCreditApplied), { nonNullable: true }),
        reference: new FormControl<string>('', { nonNullable: true }),
        bankAccountId: new FormControl<string>('', { nonNullable: true })
      }));
      // Actualizar creditToApply para que se refleje en la UI principal
      this.creditToApply = this.modalCreditApplied;
    } else {
      this.creditToApply = 0;
    }
    if (this.modalCashAmount > 0) {
      this.paymentsForm.push(new FormGroup<{
        method: FormControl<string>;
        amount: FormControl<string>;
        reference: FormControl<string>;
        bankAccountId: FormControl<string>;
      }>({
        method: new FormControl<string>('EFECTIVO', { nonNullable: true }),
        amount: new FormControl<string>(String(this.modalCashAmount), { nonNullable: true }),
        reference: new FormControl<string>('', { nonNullable: true }),
        bankAccountId: new FormControl<string>('', { nonNullable: true })
      }));
    }
    for (const p of this.modalOtherPayments) {
      if (p.amount > 0) {
        this.paymentsForm.push(new FormGroup<{
          method: FormControl<string>;
          amount: FormControl<string>;
          reference: FormControl<string>;
          bankAccountId: FormControl<string>;
        }>({
          method: new FormControl<string>(p.method, { nonNullable: true }),
          amount: new FormControl<string>(String(p.amount), { nonNullable: true }),
          reference: new FormControl<string>(p.reference || '', { nonNullable: true }),
          bankAccountId: new FormControl<string>(p.bankAccountId || '', { nonNullable: true })
        }));
      }
    }
    if (this.paymentsForm.length === 0) {
      this.initPaymentsForm();
    }
    this.recalculateFromPayments();
  }

  confirmMultiPayment() {
    // Validar que transferencias tengan cuenta bancaria
    for (const p of this.modalOtherPayments) {
      if (p.method === 'TRANSFERENCIA' && !p.bankAccountId) {
        toast.warning('Seleccione una cuenta bancaria para cada transferencia');
        return;
      }
    }
    this.syncModalToPaymentsForm();
    this.closeMultiPaymentModal();
    toast.success('Pagos registrados correctamente');
  }

  getCashPaymentAmount(): string {
    return this.modalCashAmount > 0 ? this.formatCurrency(this.modalCashAmount) : '';
  }

  onCashAmountChange(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.modalCashAmount = this.normalizeToNumber(value);
  }

  getCashChange(): number {
    const totalPaid = this.getTotalPaid();
    const total = this.totalBilling || 0;
    return Math.max(0, totalPaid - total);
  }

  getTotalPaid(): number {
    const otherTotal = this.modalOtherPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    return (this.modalCashAmount || 0) + otherTotal + (this.modalCreditApplied || 0);
  }

  getPendingAmount(): number {
    const total = this.totalBilling || 0;
    const paid = this.getTotalPaid();
    return Math.max(0, total - paid);
  }

  // Saldo a favor disponible después de aplicar en el modal
  getAvailableCreditBalance(): number {
    return Math.max(0, this.clientCreditBalance - this.modalCreditApplied);
  }

  // Máximo aplicable del saldo: el menor entre saldo disponible y total pendiente
  getMaxCreditApplicable(): number {
    const pending = this.getPendingAmount() + this.modalCreditApplied;
    return Math.min(this.clientCreditBalance, pending);
  }

  // Handler del input de monto parcial de saldo a favor
  onCreditInputChange(event: Event): void {
    const raw = (event.target as HTMLInputElement).value.replace(/[^\d]/g, '');
    const val = Number(raw) || 0;
    const max = this.getMaxCreditApplicable();
    this.creditInputAmount = Math.min(val, max);
  }

  // Aplicar monto parcial del saldo a favor
  applyCredit(): void {
    if (this.clientCreditBalance <= 0) {
      toast.warning('El cliente no tiene saldo a favor disponible.');
      return;
    }

    const pending = this.getPendingAmount();
    if (pending <= 0) {
      toast.info('No hay monto pendiente por pagar.');
      return;
    }

    const max = this.getMaxCreditApplicable();
    const toApply = Math.min(this.creditInputAmount, max);
    if (toApply <= 0) {
      toast.warning('Ingrese un monto mayor a 0 para aplicar del saldo.');
      return;
    }

    this.modalCreditApplied = toApply;
    this.creditInputAmount = 0;

    if (toApply >= this.totalBilling) {
      toast.success(`Saldo a favor cubre el total de la factura.`);
    } else {
      toast.success(`Se aplicó ${this.formatCurrency(toApply)} del saldo a favor.`);
    }
  }

  // Aplicar el máximo posible del saldo en un clic
  applyCreditMax(): void {
    this.creditInputAmount = this.getMaxCreditApplicable();
    this.applyCredit();
  }

  // Quitar el saldo a favor aplicado
  removeCredit(): void {
    this.modalCreditApplied = 0;
    this.creditInputAmount = 0;
    toast.info('Saldo a favor removido.');
  }

  // Verificar si el cliente puede usar saldo a favor
  canUseCredit(): boolean {
    return this.clientCreditBalance > 0 && !this.isConsumidorFinal(this.client);
  }

  getOtherPayments(): { method: string; amount: number; reference: string; bankAccountId?: string }[] {
    return this.modalOtherPayments;
  }

  addOtherPaymentRow() {
    this.modalOtherPayments = [
      ...this.modalOtherPayments,
      { method: 'TRANSFERENCIA', amount: 0, reference: '', bankAccountId: '' }
    ];
  }

  removeOtherPaymentRow(index: number) {
    this.modalOtherPayments = this.modalOtherPayments.filter((_, i) => i !== index);
  }

  onOtherPaymentMethodChange(index: number, event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    this.modalOtherPayments = this.modalOtherPayments.map((p, i) =>
      i === index ? { ...p, method: value } : p
    );
  }

  onOtherPaymentAmountChange(index: number, event: Event) {
    const value = (event.target as HTMLInputElement).value;
    const num = this.normalizeToNumber(value);
    this.modalOtherPayments = this.modalOtherPayments.map((p, i) =>
      i === index ? { ...p, amount: num } : p
    );
  }

  onOtherPaymentReferenceChange(index: number, event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.modalOtherPayments = this.modalOtherPayments.map((p, i) =>
      i === index ? { ...p, reference: value } : p
    );
  }

  onOtherPaymentBankAccountChange(index: number, bankAccountId: string | null) {
    this.modalOtherPayments = this.modalOtherPayments.map((p, i) =>
      i === index ? { ...p, bankAccountId: bankAccountId || '' } : p
    );
  }

  getPaymentsSummary(): { method: string; amount: number; reference?: string }[] {
    return this.getPaymentsValues().filter(p => p.amount > 0);
  }

  getPaymentIcon(method: string): string {
    switch (method) {
      case 'EFECTIVO': return 'bi-cash-stack';
      case 'SALDO_FAVOR': return 'bi-wallet2';
      case 'TRANSFERENCIA': return 'bi-bank';
      case 'TARJETA_CREDITO': return 'bi-credit-card';
      case 'TARJETA_DEBITO': return 'bi-credit-card-2-front';
      case 'CHEQUE': return 'bi-file-earmark-text';
      default: return 'bi-wallet2';
    }
  }

  formatCurrency(value: number): string {
    if (!value || value === 0) return '';
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  }

  // =============================================
  // AUTOCOMPLETE CLIENTE
  // =============================================

  onClientSearchInput() {
    const query = (this.clientSearchInput.value || '').trim().toLowerCase();
    this.clientActiveIndex = -1;
    if (!query) {
      this.clientSuggestions = [];
      this.showClientDropdown = false;
      return;
    }
    this.clientSuggestions = this.originalListClients.filter(c =>
      (c.idNumber || '').toLowerCase().includes(query) ||
      (c.name || '').toLowerCase().includes(query) ||
      (c.surname || '').toLowerCase().includes(query) ||
      (c.businessName || '').toLowerCase().includes(query) ||
      (c.nickname || '').toLowerCase().includes(query)
    ).slice(0, 8);
    this.showClientDropdown = true;
  }

  selectClientFromAutocomplete(c: Client) {
    this.selectClient(c);
    this.clientSearchInput.setValue('');
    this.showClientDropdown = false;
  }

  hideClientDropdownDelayed() {
    setTimeout(() => { this.showClientDropdown = false; this.clientActiveIndex = -1; }, 200);
  }

  getClientDisplayName(c: Client): string {
    if (c?.name || c?.surname) return `${c.name || ''} ${c.surname || ''}`.trim();
    return c?.businessName || c?.nickname || '';
  }

  // =============================================
  // AUTOCOMPLETE PRODUCTO
  // =============================================

  onProductSearchInput() {
    const query = (this.productSearchInput.value || '').trim().toLowerCase();
    this.productActiveIndex = -1;
    if (query.length < 2) {
      this.productSuggestions = [];
      this.showProductDropdown = false;
      return;
    }
    const suggestions: ProductSuggestion[] = [];
    for (const prod of this.allProducts) {
      for (const pres of (prod.presentations || [])) {
        const barcode = (pres.barcode || '').toLowerCase();
        const rootDesc = (prod.description || '').toLowerCase();
        const label = (pres.label || '').toLowerCase();
        const productCode = (prod.productCode || '').toLowerCase();
        const combined = `${rootDesc} ${label}`.trim();
        if (barcode.includes(query) || combined.includes(query) || productCode.includes(query)) {
          const labelPart = (pres.label || '').trim();
          const rootPart = (prod.description || '').trim();
          suggestions.push({
            product: prod,
            presentation: pres,
            displayName: labelPart ? `${rootPart} - ${labelPart}` : rootPart,
            barcode: pres.barcode || '',
            price: pres.salePrice || 0,
            brand: prod.brand || ''
          });
        }
      }
      if (suggestions.length >= 10) break;
    }
    this.productSuggestions = suggestions.slice(0, 10);
    this.showProductDropdown = this.productSuggestions.length > 0;
  }

  onProductSearchEnter() {
    const query = (this.productSearchInput.value || '').trim();
    if (!query) return;
    const found = this.findPresentationByBarcode(query);
    if (found) {
      this.productSearchInput.setValue('');
      this.showProductDropdown = false;
      this.addOrAskAmount(this.mapPresentation(found.product, found.presentation));
      return;
    }
    this.onProductSearchInput();
    if (this.productSuggestions.length === 1) {
      this.selectProductSuggestion(this.productSuggestions[0]);
    } else if (this.productSuggestions.length === 0) {
      toast.warning(`No se encontró producto: "${query}"`);
    }
  }

  selectProductSuggestion(s: ProductSuggestion) {
    this.productSearchInput.setValue('');
    this.showProductDropdown = false;
    this.addOrAskAmount(this.mapPresentation(s.product, s.presentation));
  }

  hideProductDropdownDelayed() {
    setTimeout(() => { this.showProductDropdown = false; this.productActiveIndex = -1; }, 200);
  }

  focusProductSearch() {
    try {
      this.productAutocompleteInputRef?.nativeElement?.focus();
      this.productAutocompleteInputRef?.nativeElement?.select();
    } catch { /* noop */ }
  }

  onClientKeydown(event: KeyboardEvent) {
    if (!this.showClientDropdown) return;
    const total = this.clientSuggestions.length + 1; // +1 para "Nuevo cliente"
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.clientActiveIndex = Math.min(this.clientActiveIndex + 1, total - 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.clientActiveIndex = Math.max(this.clientActiveIndex - 1, -1);
    } else if (event.key === 'Enter' && this.clientActiveIndex >= 0) {
      event.preventDefault();
      if (this.clientActiveIndex < this.clientSuggestions.length) {
        this.selectClientFromAutocomplete(this.clientSuggestions[this.clientActiveIndex]);
      } else {
        this.goToNewClient();
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.showClientDropdown = false;
      this.clientActiveIndex = -1;
    }
  }

  onProductKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!this.showProductDropdown) { this.onProductSearchInput(); return; }
      this.productActiveIndex = Math.min(this.productActiveIndex + 1, this.productSuggestions.length - 1);
      this.scrollProductDropdown();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.productActiveIndex = Math.max(this.productActiveIndex - 1, -1);
      this.scrollProductDropdown();
    } else if (event.key === 'Enter') {
      if (this.productActiveIndex >= 0) {
        event.preventDefault();
        this.selectProductSuggestion(this.productSuggestions[this.productActiveIndex]);
      } else {
        this.onProductSearchEnter();
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.showProductDropdown = false;
      this.productActiveIndex = -1;
    }
  }

  private scrollProductDropdown(): void {
    if (!this.productDropdownEl) return;
    const container = this.productDropdownEl.nativeElement;
    const items = container.querySelectorAll('.product-suggestion-item');
    if (this.productActiveIndex >= 0 && items[this.productActiveIndex]) {
      (items[this.productActiveIndex] as HTMLElement).scrollIntoView({ block: 'nearest' });
    }
  }

  goToNewClient() {
    this.showClientDropdown = false;
    this.clientSearchInput.setValue('');
    this.openClientsModal();
  }

  // =============================================
  // LECTOR CÓDIGO DE BARRAS
  // =============================================

  searchProductByBarcode(barcode: string) {
    const found = this.findPresentationByBarcode(barcode);
    if (!found) {
      toast.warning(`Código de barras no encontrado: ${barcode}`);
      return;
    }
    this.addOrAskAmount(this.mapPresentation(found.product, found.presentation));
  }

  private addOrAskAmount(mapped: Product) {
    const code = (mapped.barcode || '').toLowerCase();
    const existingIndex = this.saleDetails.findIndex(
      d => (d.product.barcode || '').toLowerCase() === code
    );

    // Ya en tabla y no es granel → sumar +1 directamente
    if (existingIndex >= 0 && !this.saleDetails[existingIndex].isBulkSale) {
      this.sumarCantidad(existingIndex);
      const desc = this.saleDetails[existingIndex].product.description || '';
      toast.success(`+1 · ${desc} → ${this.saleDetails[existingIndex].amount} uds.`);
      return;
    }

    // Nuevo producto, no es granel ni requiere lote → agregar directo con cantidad 1
    if (!mapped.isBulk && !this.requiresBatchSelection(mapped)) {
      mapped.amount = 1;
      mapped.totalValue = mapped.amount * mapped.price;
      this.addProduct(mapped);
      this.calculateTotalBilling();
      toast.success(`✓ ${mapped.description} agregado`);
      return;
    }

    // Granel o requiere lote → flujo normal (abre modal de cantidad/lote)
    this.onPresentationSelected(mapped);
  }

  private findPresentationByBarcode(barcode: string): { product: Product; presentation: Presentation } | null {
    const code = barcode.trim().toLowerCase();
    for (const prod of this.allProducts) {
      for (const pres of (prod.presentations || [])) {
        if ((pres.barcode || '').toLowerCase() === code) {
          return { product: prod, presentation: pres };
        }
      }
    }
    return null;
  }

  private mapPresentation(product: Product, presentation: Presentation): Product {
    const mapped: Product = { ...product };
    mapped.barcode = presentation.barcode;
    mapped.price = presentation.salePrice;
    mapped.selectedUnitMeasure = presentation.unitMeasure;
    mapped.selectedPresentationLabel = presentation.label || '';
    const rootDesc = (product.description || '').trim();
    const label = (presentation.label || '').trim();
    mapped.description = label ? `${rootDesc} - ${label}` : rootDesc;
    const bulkFlag = presentation.isBulk ?? /granel/i.test(label);
    mapped.isBulk = !!bulkFlag;
    if (presentation.isFixedAmount && (presentation.fixedAmount ?? 0) > 0) {
      mapped.hasFixedAmount = true;
      mapped.fixedAmount = presentation.fixedAmount;
    } else {
      mapped.hasFixedAmount = false;
      mapped.fixedAmount = undefined;
    }
    if (!mapped.amount || mapped.amount < 1) mapped.amount = 1;
    return mapped;
  }

  // =============================================
  // PREVENTA — Importar al facturador
  // =============================================

  importPreSale(notification: PreSaleNotification): void {
    this.preSaleService.getById(notification.preSaleId).subscribe({
      next: (preSale) => {
        preSale.items.forEach(item => {
          const existingIdx = this.saleDetails.findIndex(
            d => (d.product.barcode || '').toLowerCase() === (item.barcode || '').toLowerCase()
          );
          if (existingIdx >= 0 && !item.isBulk) {
            this.saleDetails[existingIdx].amount += item.amount;
            this.saleDetails[existingIdx].subTotal =
              this.saleDetails[existingIdx].amount * this.saleDetails[existingIdx].unitPrice;
          } else {
            const prod = new Product();
            prod.id = item.productId;
            prod.barcode = item.barcode;
            prod.description = item.description;
            prod.price = item.price;
            prod.amount = item.amount;
            prod.saleType = item.saleType as ESaleType;
            prod.selectedUnitMeasure = item.unitMeasure as UnitMeasure;
            prod.selectedPresentationLabel = item.presentationLabel;
            prod.isBulk = item.isBulk;
            prod.totalValue = item.subTotal;
            if (item.isBulk && item.bulkInputAmount) {
              (prod as any)._bulkInputAmount = item.bulkInputAmount;
            }
            const detail = new SaleDetail();
            detail.id = item.productId;
            detail.product = prod;
            detail.amount = item.amount;
            detail.unitPrice = item.price;
            detail.unitCost = 0;
            detail.subTotal = item.subTotal;
            detail.isBulkSale = item.isBulk;
            detail.bulkInputAmount = item.bulkInputAmount;
            this.saleDetails.push(detail);
          }
        });
        this.calculateTotalBilling();
        this.importedPreSaleIds.push(preSale.id);
        this.importedNotifications.push(notification);
        this.dismissPreSaleNotification(notification);
        toast.success(`Preventa ${preSale.preSaleNumber} importada — ${preSale.items.length} ítem(s)`);
      },
      error: () => toast.error('Error al cargar la preventa'),
    });
  }

  dismissPreSaleNotification(notification: PreSaleNotification): void {
    this.pendingPreSaleNotifications = this.pendingPreSaleNotifications.filter(
      n => n.preSaleId !== notification.preSaleId
    );
  }

  get sortedPreSaleNotifications(): PreSaleNotification[] {
    return [...this.pendingPreSaleNotifications].sort((a, b) => {
      const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return this.preventaPanelSortOrder === 'desc' ? -diff : diff;
    });
  }

  togglePreventaSort(): void {
    this.preventaPanelSortOrder = this.preventaPanelSortOrder === 'desc' ? 'asc' : 'desc';
  }
}
