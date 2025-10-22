import { AfterViewInit, Component, ElementRef, HostListener, ViewChild, inject, Input, OnInit } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, FormArray } from '@angular/forms';
import { toast } from 'ngx-sonner';
import { CurrencyPipe, DatePipe, CommonModule } from '@angular/common';
import { EVatType, Product } from '../producto/producto';
import { FacturaService } from './factura.service';
import { Billing, saleTypeFromString, saleType } from './billing';
import { formatInTimeZone } from 'date-fns-tz';
import { Client } from '../cliente/cliente';
import { Order } from '../orden/orden';
import { ClienteService } from '../cliente/cliente.service';
import { ProductoService } from '../producto/producto.service';
import { SaleDetail } from './saleDetail';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { CurrencyFormatDirective } from '../directive/currency-format.directive';
import { StorageService } from '../services/localStorage.service';
import { LoginUserService } from '../auth/login/loginUser.service';
import { Company } from './company';
import { ProductsSearchModalComponent } from '../producto/components/products-search-modal/products-search-modal.component';
import { ModalClientsListComponent } from '../cliente/components/modal-clients-list/modal-clients-list.component';
import { ExpensesFabComponent } from '../expenses/expenses-fab.component';

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
  ],
  templateUrl: './factura.component.html',
  styleUrl: './factura.component.css'
})
export class FacturaComponent implements OnInit, AfterViewInit {
  @ViewChild('productsAmountModal', { static: false }) productsAmountModalRef!: ElementRef;
  @ViewChild('amountProductInput', { static: false }) amountProductInput!: ElementRef<HTMLInputElement>;
  @ViewChild(ProductsSearchModalComponent, { static: false }) productsSearchModalComp!: ProductsSearchModalComponent;
  @ViewChild(ModalClientsListComponent, { static: false }) clientsModalComp!: ModalClientsListComponent;
  @ViewChild('reciveValueInput', { static: false }) reciveValueInput!: ElementRef<HTMLInputElement>;
  @ViewChild('confirmSaveModal', { static: false }) confirmSaveModalRef!: ElementRef;

  ngAfterViewInit() {
    // Configuración para el modal "Cantidad a vender"
    this.setFocusOnModal('productsAmountModal', this.amountProductInput);
  }

  // Handler al seleccionar una presentación desde el modal hijo
  onPresentationSelected(mappedProduct: Product) {
    this.ProductToSell(mappedProduct);
    // Abrir modal para ingresar cantidad (packs o unidades) o total en caso de granel
    setTimeout(() => {
      this.openProductsAmountModal();
    }, 300);
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
  }

  client!: Client;
  @Input() factura!: Billing;
  product!: Product;

  facturaService = inject(FacturaService);
  clientService = inject(ClienteService);
  productService = inject(ProductoService);
  router = inject(Router);
  localStorage = inject(StorageService);
  loginUserService = inject(LoginUserService);

  saleDetails: SaleDetail[] = [];
  // Vista previa en modo granel/peso
  bulkComputedAmount: number = 0;

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
    if (this.productToSell?.isBulk) {
      const unitPrice = Number(this.productToSell.price) || 0;
      if (unitPrice <= 0) {
        toast.error('Precio unitario inválido para calcular cantidad por granel.');
        return;
      }
      const totalMoney = numeric;
      resolvedAmount = +(totalMoney / unitPrice).toFixed(1); // 2 decimales para claridad
    } else {
      // Caso normal: el usuario ingresa la CANTIDAD
      resolvedAmount = numeric;
    }

    if (resolvedAmount > 0) {
      this.productToSell.amount = resolvedAmount;
      // Actualizar si ya existe en el detalle
      this.saleDetails.map(detail => {
        if (detail.product.barcode === this.productToSell.barcode) {
          detail.amount = resolvedAmount;
        }
      });
      this.addProduct(this.productToSell);
      this.clearProductAmountField();
    } else {
      toast.warning('La cantidad calculada debe ser mayor a 0.');
    }

    this.closeProductAmountModal();
  }

  clearProductAmountField() {
    this.formProductAmount.reset();
    this.bulkComputedAmount = 0;
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
  }

  mapProductToSaleDetail(selectProduct: Product): SaleDetail {
    // Creamos el objeto SaleDetail sin `totalVat`
    const saleDetail: SaleDetail = {
      id: selectProduct.id,
      product: selectProduct,
      amount: selectProduct.amount,
      unitPrice: selectProduct.price,
      subTotal: selectProduct.amount * selectProduct.price,
      totalVat: 0 // Inicializamos como 0 temporalmente
    };

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
      debugger
      //detail.amount += 1;
      detail.subTotal = detail.amount * product.price;
      /* this.calculateVatPrice(product.price, detail.amount, product.vatType).subscribe(totalVat => {
         detail.totalVat = totalVat;
       });*/
      return;
    }

    if (!product.amount) {
      product.amount = 1;
    }

    product.totalValue = product.amount * product.price;

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
      }>({
        method: new FormControl<string>('EFECTIVO', { nonNullable: true }),
        amount: new FormControl<string>('0', { nonNullable: true }),
        reference: new FormControl<string>('', { nonNullable: true })
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
    }>({
      method: new FormControl<string>('TRANSFERENCIA', { nonNullable: true }),
      amount: new FormControl<string>('0', { nonNullable: true }),
      reference: new FormControl<string>('', { nonNullable: true })
    }));
  }

  removePaymentRow(index: number) {
    if (this.paymentsForm.length > 1) {
      this.paymentsForm.removeAt(index);
      this.recalculateFromPayments();
    }
  }

  get paymentControls() { return this.paymentsForm.controls; }

  private getPaymentsValues(): { method: string; amount: number; reference?: string }[] {
    return this.paymentsForm.controls.map(ctrl => {
      const g = ctrl as FormGroup<{ method: FormControl<string>; amount: FormControl<string>; reference: FormControl<string>; }>;
      const rawAmount = g.controls['amount'].value as unknown;
      return {
        method: (g.controls['method'].value as string) || 'EFECTIVO',
        amount: this.normalizeToNumber(rawAmount),
        reference: (g.controls['reference'].value as string) || ''
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
      event.preventDefault(); // evita que el navegador use F3 por defecto
      this.openProductsModal();
    }

    if (event.key === 'F4') {
      event.preventDefault();
      this.saveBilling();
    }
debugger;
    // Evitar atajos cuando se está escribiendo en algún control
    const target = event.target as HTMLElement | null;
    const tag = (target?.tagName || '').toLowerCase();
    const isTyping = tag === 'input' || tag === 'textarea' || tag === 'select' || (target?.isContentEditable ?? false);
    if (!isTyping) {
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
      // Atajo de una sola tecla: R para enfocar "Dinero Recibido"
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
    this.facturaService.save(this.factura).subscribe(factura => {
      if (factura.id) {
        toast.success('La Factura fue registrada correctamente.');
        this.onInitBilling();
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
      this.bulkComputedAmount = unitPrice > 0 ? +(numeric / unitPrice).toFixed(1) : 0; // 2 decimales en preview
    } else {
      this.bulkComputedAmount = 0;
    }
  }
}
