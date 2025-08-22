import { Component, ElementRef, OnInit, ViewChild, OnChanges, SimpleChanges } from '@angular/core';
import { OrdenService } from './orden.service';
import { EStatusOrder, Order } from './orden';
import { toast } from 'ngx-sonner';
import { ProductoService } from '../producto/producto.service';
import { Product } from '../producto/producto';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { handleError } from '../util/manejador.error.util';
import { ClienteService } from '../cliente/cliente.service';
import { Client, SearchCriteriaClient } from '../cliente/cliente';

@Component({
  selector: 'app-orden',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './orden.component.html',
  styleUrl: './orden.component.css'
})
export class OrdenComponent implements OnInit {

  orden : Order = new Order;
  producto: Product = new Product;
  lstProducto: Product[] = [];
  totalOrden: number = 0;
  showOrder: boolean = false;
  searchCriteriaClient: SearchCriteriaClient = new SearchCriteriaClient();
  cliente: Client = new Client();
  showSpinnerAutosave = false;

  lstOrdenesAbiertas: Order[] = [];

  @ViewChild('hiddenBarcodeInput', { static: false }) hiddenBarcodeInput?: ElementRef;

  constructor(
    private service: OrdenService,
    private productoService: ProductoService,
    private clienteService: ClienteService) {
  }


  ngOnInit(): void {
    this.checkOrdenesAbiertas();
  }

  startOrder() {
    this.service.startOrder().subscribe({
      next: res => {
        // console.log('Start order response: ', res);
        this.limpiarVariables();
        this.orden = res;
        this.showOrder = true;
        this.checkOrdenesAbiertas();
        toast.success('Se ha generado una nueva orden');
      },
      error: error => {
        this.showOrder = false;
        handleError(error, 'Ocurrió un error al crear el registro');
      }
    });
  }

  abrirOrder(ordenLista: Order) {
    this.orden = ordenLista;
    this.showOrder = true;
    this.lstProducto = ordenLista.products ?? [];
    this.totalOrden = ordenLista.totalOrder ?? 0;
    this.cliente = ordenLista.client ?? new Client();
    toast.success('Se ha abierto la orden # ' + ordenLista.orderNumber);
  }

  guardarOrden(){
    if (this.lstProducto.length === 0) {
      toast.error('Debe añadir productos a la orden.');
      return;
    }

    this.orden.products = this.lstProducto;
    this.orden.totalOrder = this.totalOrden;
    this.orden.client = this.cliente;

    this.service.update(this.orden, this.orden.id).subscribe({
      next: () => {
        this.limpiarVariables();
        toast.success('Registro guardado correctamente');
      },
      error: error => {
        if (error.error) {
          toast.error(error.error.message);
        } else {
          toast.error('Ocurrió un error al guardar el registro');
        }
      }
    });
  }

  private limpiarVariables() {
    this.orden = new Order();
    this.producto = new Product();
    this.lstProducto = [];
    this.totalOrden = 0;
    this.showOrder = false;
    this.cliente = new Client();
  }

  buscarProductoPorCodigoBarras(barcode: string) {
    this.productoService.getProductByBarcode(barcode).subscribe({
      next: res => {
        const existingProduct = this.lstProducto.find(producto => producto.barcode === barcode);
        if (existingProduct) {
          existingProduct.amount += 1;
          existingProduct.totalValue = existingProduct.amount * existingProduct.price;
        } else {
          res.amount = 1;
          res.totalValue = res.amount * res.price;
          this.lstProducto.push(res);
        }

        this.hiddenBarcodeInput!.nativeElement.value = '';
        this.totalOrden = this.lstProducto.reduce((total, producto) => total + producto.totalValue, 0);

        this.autoguardarOrden();

      },
      error: error => {
        this.hiddenBarcodeInput!.nativeElement.value = '';
        if (error.error) {
          toast.error(error.error);
        } else {
          toast.error('No se encontró el registro');
        }
      }
    });
  }

  handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      const scannedCode = this.hiddenBarcodeInput?.nativeElement.value;
      // console.log(scannedCode);
      this.buscarProductoPorCodigoBarras(scannedCode);
    }
  }

  onCantidadChange(event: any, index: number) {
    const nuevoValor = event.target.value;
    this.producto = this.lstProducto[index];
    this.producto.amount = parseInt(nuevoValor);
    this.producto.totalValue = this.producto.amount * this.producto.price;
    this.lstProducto[index] = this.producto;

    this.totalOrden = this.lstProducto.reduce((total, producto) => total + producto.totalValue, 0);

    this.autoguardarOrden();
  }

  sumarCantidad(index: number) {
    this.producto = this.lstProducto[index];
    this.producto.amount += 1;
    this.producto.totalValue = this.producto.amount * this.producto.price;
    this.lstProducto[index] = this.producto;

    this.totalOrden = this.lstProducto.reduce((total, producto) => total + producto.totalValue, 0);

    this.autoguardarOrden();
  }

  restarCantidad(index: number) {
    this.producto = this.lstProducto[index];
    if (this.producto.amount > 1 ){
      this.producto.amount = this.producto.amount - 1;
      this.producto.totalValue = this.producto.amount * this.producto.price;
      this.lstProducto[index] = this.producto;
      this.totalOrden = this.lstProducto.reduce((total, producto) => total + producto.totalValue, 0);
    }

    this.autoguardarOrden();
  }

  deleteProductOfList(index: number){
    this.lstProducto.splice(index, 1);
    this.totalOrden = this.lstProducto.reduce((total, producto) => total + producto.totalValue, 0);
    this.autoguardarOrden();
  }

  eliminarOrden(){
    this.service.delete(this.orden.id).subscribe({
      next: res => {
        this.limpiarVariables();
        toast.success('Se cancelo correctamente la orden');
      },
      error: error => {
        if (error.error) {
          toast.error(error.error);
        } else {
          toast.error('Ocurrio un error al cancelar la orden');
        }
      }
    });
  }

  eliminarOrdenListado(id: string){
    this.service.delete(id).subscribe({
      next: res => {
        toast.success('Se elimino correctamente la orden');
        this.checkOrdenesAbiertas();
      },
      error: error => {
        if (error.error) {
          toast.error(error.error);
        } else {
          toast.error('Ocurrio un error al eliminar la orden');
        }
      }
    });
  }

  buscarCliente() {
    if(!this.searchCriteriaClient.idNumber || this.searchCriteriaClient.idNumber === ''){
      toast.warning('Ingrese el número de documento');
      return;
    }
    this.clienteService.findByDocument(this.searchCriteriaClient).subscribe({
      next: (res) => {
        toast.info('Cliente encontrado');
        this.cliente = res;

        if(!this.cliente.name){
          this.cliente.name = ''
        }

        if(!this.cliente.surname){
          this.cliente.surname = ''
        }

        this.autoguardarOrden();
      },
      error: error => {
        handleError(error, 'Ocurrio un error al buscar el cliente');
      }
    });
  }

  autoguardarOrden() {
    this.orden.products = this.lstProducto;
    this.orden.totalOrder = this.totalOrden;
    this.orden.client = this.cliente;
    this.setDefaultClient();
    this.showSpinnerAutosave = true;
    this.service.update(this.orden, this.orden.id).subscribe({
      next: () => {
      }
    });
    this.showSpinnerAutosave = false;
  }

  private setDefaultClient() {
    if (this.orden.client.idNumber == "") {
      this.searchCriteriaClient.idNumber = "22222222222";
      this.searchCriteriaClient.documentType = "CEDULA_CIUDADANIA";
      this.clienteService.findByDocument(this.searchCriteriaClient).subscribe({
        next: (defaultClient) => {
          this.orden.client = defaultClient;
        },
      });
    }
  }

  checkOrdenesAbiertas() {
    this.service.findByOrderStatus(EStatusOrder.INICIADO).subscribe({
      next: res => {
        if (res.length > 0) {
          this.lstOrdenesAbiertas = res;
        }

        if (res.length === 0) {
          this.lstOrdenesAbiertas = [];
        }
      }, error(err) {
        console.dir(err);
      },
    });
  }

  crearNuevaOrdenAfterInit() {
    this.startOrder();
  }

  handleEndOrder() {
    if(this.orden.products != null) {
      this.service.endOrder(this.orden.orderNumber).subscribe({
        next: (res) => {
          if (res) {
            toast.info('Orden finalizada');
            this.limpiarVariables();
            this.showSpinnerAutosave = true;
            this.checkOrdenesAbiertas();
          }
          this.showSpinnerAutosave = false;
        }
      });
    } else {
      toast.warning('Por favor, ingresa un producto.');
    }

  }
}
