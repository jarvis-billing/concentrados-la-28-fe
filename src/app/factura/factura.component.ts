import { AfterViewInit, Component, ElementRef, HostListener, inject, Input, OnInit, ViewChild } from '@angular/core';
import { Client } from '../cliente/cliente';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { toast } from 'ngx-sonner';
import { CurrencyPipe, DatePipe, } from '@angular/common';
import { EVat, Product } from '../producto/producto';
import { FacturaService } from './factura.service';
import { Billing } from './billing';
import { ClienteService } from '../cliente/cliente.service';
import { ProductoService } from '../producto/producto.service';
import { SaleDetail } from './saleDetail';
import { Router } from '@angular/router';
import { Order } from '../orden/orden';
import { Observable } from 'rxjs';
import { CurrencyFormatDirective } from '../directive/currency-format.directive';
import { StorageService } from '../services/localStorage.service';
import { LoginUserService } from '../auth/login/loginUser.service';
import { Company } from './company';

@Component({
  selector: 'app-factura',
  standalone: true,
  imports: [ReactiveFormsModule,
    DatePipe,
    CurrencyPipe,
    CurrencyFormatDirective],
  templateUrl: './factura.component.html',
  styleUrl: './factura.component.css'
})
export class FacturaComponent implements OnInit, AfterViewInit {

  @ViewChild('productsModal', { static: false }) productsModalRef!: ElementRef;
  @ViewChild('productsAmountModal', { static: false }) productsAmountModalRef!: ElementRef;
  @ViewChild('amountProductInput', { static: false }) amountProductInput!: ElementRef<HTMLInputElement>;
  @ViewChild('searchProductInput', { static: false }) searchProductInput!: ElementRef<HTMLInputElement>;

  ngAfterViewInit() {
    // Configuración para el modal "Cantidad a vender"
    this.setFocusOnModal('productsAmountModal', this.amountProductInput);

    // Configuración para el modal "Buscar producto"
    this.setFocusOnModal('productsModal', this.searchProductInput);
  }

  ngOnInit(): void {
    this.productService.productos$.subscribe(productos => {
      this.completeProductsList = productos;
    });
    this.productService.fetchAll();
    this.getClients();
    this.getAllProductsPage();
    this.getAllProducts();
    this.onInitBilling();
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

  originalListClients: Client[] = [];
  filteredListClients: Client[] = [];

  originalListProducts: Product[] = [];
  filteredListProducts: Product[] = [];
  completeProductsList: Product[] = [];
  selectedProducts: Product[] = [];
  productToSell: Product = new Product();

  productMatch: Boolean = false;
  paginaActual: number = 1;
  elementosPorPagina: number = 10;
  totalElementos: number = 0;
  totalPaginas: number = 0;

  totalBilling: number = 0;
  totalVatBilling: number = 0;
  totalMoneyChange: number = 0;
  totalRecivedValue: number = 0;
  paymentMethod: string = 'EFECTIVO';

  reciveValue = new FormControl('');

  pdfSrc: any;

  formOrden = new FormGroup({
    numeroOrden: new FormControl('')
  });

  formClient = new FormGroup({
    searchClient: new FormControl('')
  });

  formProduct = new FormGroup({
    searchProduct: new FormControl('')
  });

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
    const amountProduct = this.formProductAmount.controls.amountProduct.value ?? '';

    if (isNaN(Number(amountProduct))) {
      toast.warning('El valor ingresado debe ser numérico.');
      return;
    }

    let amount = parseInt(amountProduct);

    if (amount > 0) {
      this.productToSell.amount = amount;
      this.saleDetails.map(detail => {
        if (detail.product.barcode === this.productToSell.barcode) {
          detail.amount = amount;
        }
      });
      this.addProduct(this.productToSell);
      this.clearProductAmountField();
    } else {
      toast.warning('La cantidad debe ser mayor a 0.');
    }

    this.closeProductAmountModal();
  }

  clearProductAmountField() {
    this.formProductAmount.reset();
    const prodductAmountModal = document.getElementById('productsAmountModal');
    (prodductAmountModal?.getElementsByClassName('btn-close').item(0) as HTMLElement)?.click();
  }

  changePaymentMethod(event: any) {
    debugger
    this.paymentMethod = event.target.value;

    if (this.paymentMethod != 'EFECTIVO') {
      this.reciveValue.setValue(this.totalBilling.toString());
      this.totalRecivedValue = parseInt(this.reciveValue.value?.toString() || '0');
      this.totalMoneyChange = 0;
    } else {
      this.reciveValue.setValue('');
      this.totalRecivedValue = 0;
      this.totalMoneyChange = 0;
    }
  }

  saveBilling() {
    if (this.isValidBillingData()) {
      const userLogin = this.loginUserService.getUserFromToken();
      const billingType = this.totalBilling > 250000 ? 'ELECTRONICA' : 'FISICA';
      this.factura = {
        ...this.factura,
        id: null,
        client: this.client,
        saleDetails: this.saleDetails,
        subTotalSale: this.totalBilling,
        totalIVAT: this.totalVatBilling,
        receivedValue: this.totalRecivedValue,
        returnedValue: this.totalMoneyChange,
        totalBilling: this.totalBilling,
        creationUser: userLogin,
        paymentMethods: [this.paymentMethod],
        company: userLogin.company,
        billingType: billingType,
        dateTimeRecord: this.factura.dateTimeRecord
      };

      console.log('Guardar esta factura: ', this.factura);
      toast('¿Esta seguro que desea guardar la factura?', {
        action: {
          label: 'Confirmar',
          onClick: () => {
            this.facturaService.save(this.factura).subscribe(factura => {
              if (factura.id) {
                toast.success('La Factura registrada correctamente.');
              }
            });

          }
        },
      });

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

    });
  }

  isValidBillingData() {
    if (this.totalRecivedValue < this.totalBilling) {
      toast.warning('El dinero recibido debe ser mayor o igual al SubTotal.');
      return;
    }

    if (!this.client || !this.client.id) {
      toast.warning('Por favor selecciona un cliente.');
      return;
    }

    if (!this.saleDetails || this.saleDetails.length < 1) {
      toast.warning('Por favor selecciona un producto.');
      return;
    }

    return true;
  }

  // Client Logic Section
  getClients() {
    this.clientService.getAll().subscribe({
      next: res => {
        this.originalListClients = res;
        this.filteredListClients = [...this.originalListClients];
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

  getAllProducts() {
    this.productService.getAll().subscribe({
      next: res => {
        this.completeProductsList = res;
      },
      error: error => {
        if (error.error) {
          toast.error(error.error);
        } else {
          toast.error('Ocurrió un error al buscar los productos');
        }
      }
    });

  }

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

  getAllProductsPage() {
    this.productService.getAllPage(this.paginaActual - 1, this.elementosPorPagina).subscribe(product => {
      this.originalListProducts = product.content;
      this.totalElementos = product.totalElements;
      this.totalPaginas = product.quantityPage;
      this.filteredListProducts = [...this.originalListProducts];
    });
  }

  changePage(pagina: number) {
    if (pagina >= 1 && pagina <= this.totalPaginas) {
      this.paginaActual = pagina;
      this.getAllProductsPage();
    }
  }

  searchProduct() {
    const searchProduct = this.formProduct.controls.searchProduct.value?.toLowerCase() ?? '';

    if (searchProduct.length < 3) {
      toast.warning('El criterio de búsqueda debe tener al menos 3 caracteres.');
      return;
    }

    this.filteredListProducts = this.completeProductsList.filter(product => {
      try {
        return (
          product.barcode?.toLowerCase().includes(searchProduct) ||
          product.description?.toLowerCase().includes(searchProduct)
        );
      } catch (err) {
        console.error("❌ Error con producto:", product, err);
        return false;
      }
    });


    this.productMatch = true;

    if (this.filteredListProducts.length === 0) {
      toast.info('No se encontró ningún producto con ese criterio');
      return;
    }

    if (this.filteredListProducts.length === 1) {
      this.ProductToSell(this.filteredListProducts[0]);
      this.closeProductModal();
      setTimeout(() => {
        this.openProductsAmountModal();
      }, 300);
    }
  }

  clearProductSearchField() {
    this.formProduct.reset();
    this.filteredListProducts = [...this.originalListProducts];
    this.productMatch = false;
  }

  // Ends of product logic

  // Handle selected client
  selectClient(client: Client) {
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
    this.calculateVatPrice(selectProduct.price, selectProduct.amount, selectProduct.vatType)
      .subscribe(totalVat => {
        saleDetail.totalVat = totalVat;
      });

    return saleDetail;
  }

  // Handle selected products
  addProduct(product: Product) {
    const detail = this.saleDetails.find(detail => detail.product.barcode === product.barcode);
    if (detail) {
      debugger
      //detail.amount += 1;
      detail.subTotal = detail.amount * product.price;
      this.calculateVatPrice(product.price, detail.amount, product.vatType).subscribe(totalVat => {
        detail.totalVat = totalVat;
      });
      return;
    }

    if (!product.amount) {
      product.amount = 1;
    }

    product.totalValue = product.amount * product.price;

    this.saleDetails.push(this.mapProductToSaleDetail(product));
  }

  // Handle calculated vats total products
  calculateVatPrice(price: number, quantity: number, vat: EVat): Observable<number> {
    return new Observable((observer) => {
      // Recupera el array de IVA desde localStorage y lo convierte a JSON
      const vats = JSON.parse(localStorage.getItem("allTypeVats") || '[]');

      // Encuentra el tipo de IVA en el array
      const vatData = vats.find((item: { vatType: EVat }) => item.vatType === vat);

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

  onCalculateMoneyChange(receivedValue: number) {
    this.totalMoneyChange = 0;
    if (receivedValue > 0 && this.totalBilling > 0 && receivedValue >= this.totalBilling) {
      this.totalMoneyChange = receivedValue - this.totalBilling;
      this.totalRecivedValue = receivedValue;
    }
  }

  onInitBilling() {
    this.facturaService.getLastBillingNumber().subscribe(res => {
      this.factura = new Billing();
      this.saleDetails = [];
      this.totalRecivedValue = 0;
      this.totalMoneyChange = 0;
      this.reciveValue.setValue('$ 0');
      this.pdfSrc = '';
      this.factura = {
        ...this.factura,
        billNumber: res.billingNumber,
        dateTimeRecord: new Date().toISOString(),
        order: new Order(),
        company: new Company(),
      }
    });
  }

  @HostListener('document:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {

    if (event.ctrlKey && event.key.toLowerCase() === 'p') {
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
  }

  openProductsModal() {
    const modalEl = this.productsModalRef?.nativeElement;
    if (modalEl) {
      const modal = new (window as any).bootstrap.Modal(modalEl);
      modal.show();
      
      this.productService.productos$.subscribe(productos => {
        this.filteredListProducts = productos;
      });


      this.filteredListProducts = [...this.originalListProducts];
      this.productMatch = false;
      this.formProduct.get('searchProduct')?.reset();

      setTimeout(() => {
        this.searchProductInput?.nativeElement.focus();
        this.searchProductInput?.nativeElement.select();
      }, 300);
    }
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
    const modalEl = this.productsModalRef?.nativeElement;
    const modalInstance = (window as any).bootstrap?.Modal.getInstance(modalEl);
    modalInstance?.hide();
  }
}
