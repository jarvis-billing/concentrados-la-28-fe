import { Component, EventEmitter, inject, OnInit, Output } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { EStatusOrder, Order } from '../../../orden/orden';
import { OrdenService } from '../../../orden/orden.service';
import { CurrencyPipe } from '@angular/common';
import { toast } from 'ngx-sonner';

@Component({
  selector: 'app-import-order',
  standalone: true,
  imports: [ReactiveFormsModule, CurrencyPipe],
  templateUrl: './import-order.component.html',
  styleUrl: './import-order.component.css'
})
export class ImportOrderComponent implements OnInit {

  @Output() orderSelected = new EventEmitter<Order>();

  filteredListOrders: Order[] = [];

  orderService = inject(OrdenService);

  event: any = {
    pagina: 1,
    cantidad: 10
  }
  paginaActual: number = 1;
  totalPaginas: number = 10;
  elementosPorPagina: number = 10;
  totalElementos: number = 0;

  ngOnInit(): void {
    this.loadAllOrdersFinished();
  }


  changePage(pagina: number) {
    if (pagina >= 1 && pagina <= this.totalPaginas) {
      this.paginaActual = pagina;
      this.loadAllOrdersFinished();
    }
  }

  loadAllOrdersFinished() {
    this.orderService.ordersFinished(this.paginaActual - 1, this.elementosPorPagina).subscribe(orders => {
      this.filteredListOrders = orders.content;
      this.totalElementos = orders.totalElements;
      this.totalPaginas = orders.quantityPage;
    });
  }

  formOrder = new FormGroup({
    searchorder: new FormControl('')
  });


  searchorder() {
    const orderNumber = this.formOrder.controls.searchorder.value ?? '';
    this.orderService.findByNumeroOrden(orderNumber).subscribe({
      next: res => {
        let isOrderBilling = false;
        this.filteredListOrders = [];
        this.filteredListOrders.push(res);

        this.filteredListOrders.filter(order => {
          debugger
          isOrderBilling = order.status === EStatusOrder.FACTURADO;
        }) 

        this.filteredListOrders = this.filteredListOrders.filter(order => order.status === EStatusOrder.FINALIZADO);

        if (isOrderBilling) {
          toast.info('La orden No. ' + orderNumber + ' se encuentra FACTURADA.');
        }

      },
      error: error => {
        if (error.error) {
          toast.error(error.error);
          this.loadAllOrdersFinished();
        } else {
          toast.error('Ocurrió un error al buscar el registro');
        }
      }

    })
  }

  clearorderSearchField() {

  }

  selectorder(order: Order) {
    this.orderSelected.emit(order);
  }

}
