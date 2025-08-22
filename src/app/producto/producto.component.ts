import { Component, OnInit, inject } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Product } from './producto';
import { toast } from 'ngx-sonner';
import { ProductoService } from './producto.service';
import { Router, RouterModule } from '@angular/router';
import { debounceTime, Subject } from 'rxjs';
import { ProductPrice } from './productoPrice';

@Component({
  selector: 'app-producto',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './producto.component.html'
})
export class ProductoComponent implements OnInit {

  private searchTerms = new Subject<string>();

  search: string = "";
  productPrice: ProductPrice = new ProductPrice();
  lstProductos: Product[] = [];
  paginaActual: number = 1;
  elementosPorPagina: number = 10;
  totalElementos: number = 0;
  totalPaginas: number = 0;
  newPrice: number | null = null;
  selectAll = false;
  showChangePrice = false;
  
  minPrecio: number = 1;
  maxPrecio: number = 10000000;

  constructor(private service: ProductoService) {
    this.searchTerms.pipe(
      debounceTime(500) // Espera 500 ms después de la última pulsación de tecla
    ).subscribe(term => this.getAllProductsPageSearch()); 
  }

  router= inject(Router);

  ngOnInit(): void {
    this.getAllProductsPage();
  }

  limpiarFiltro(): void {
    this.search = "";
    this.getAllProductsPage();
  }

  onSearchChange(searchTerm: string): void {
    this.searchTerms.next(searchTerm);
  }

  updateAllPrice(){
    if (this.validateSelected() && this.newPrice != null && this.newPrice > 0) {
      toast('¿Está seguro que quiere actualizar los registros seleccionados?', {
        action: {
          label: 'Confirmar',
          onClick: () => {
            this.productPrice.ids = this.lstProductos
              .filter(producto => producto.selected)
              .map(producto => producto.id);
            this.productPrice.price = this.newPrice ? this.newPrice : 0;

            this.service.updatePriceByIds(this.productPrice).subscribe({
              next: () => {
                if (this.search.length > 1) {
                  this.getAllProductsPageSearch();
                } else {
                  this.getAllProductsPage();
                }
                this.selectAll = false;
                this.showChangePrice = false;
                toast.success('Registros actualizados correctamente');
              },
              error: error => {
                if (error.error) {
                  toast.error(error.error.message);
                } else {
                  toast.error('Ocurrió un error al actualizar los registros');
                }
              }
            })
          } 
        },
      });
    } else {
      if (!this.validateSelected()) {
        toast.warning("Debe seleccionar almenos un registro");
      } else if (this.newPrice == null || this.newPrice <= 0) {
        toast.warning("Ingrese un precio correcto");
      }
    }
  }

  validateSelected(): boolean {
    if (this.lstProductos.some(producto => producto.selected)) {
      this.showChangePrice = true;
      return true;
    }
    this.showChangePrice = false;
    return false;
  }

  getAllProductsPage() {
    this.service.getAllPage(this.paginaActual - 1, this.elementosPorPagina).subscribe(data => {
      this.lstProductos = data.content;
      this.totalElementos = data.totalElements;
      this.totalPaginas = data.quantityPage;
    });
  }

  getAllProductsPageSearch() {
    if (this.search.length > 0) {
      this.service.getAllPageSearch(this.paginaActual - 1, this.elementosPorPagina, this.search).subscribe(data => {
        this.lstProductos = data.content;
        this.totalElementos = data.totalElements;
        this.totalPaginas = data.quantityPage;
      });
    } else {
      this.getAllProductsPage();
    }
  }

  editarProducto(barcode: string){
    if (barcode) {
      this.router.navigate(['/main/crearproducto', barcode]);
    }
  }

  eliminarProducto(id: string) {
    toast('¿Esta seguro que quiere eliminar este registro?', {
      action: {
        label: 'Confirmar',
        onClick: () => {
          this.service.delete(id).subscribe({
            next: () => {
              if (this.search.length > 1) {
                this.getAllProductsPageSearch();
              } else {
                this.getAllProductsPage();
              }
              toast.success('Registro eliminado correctamente');
            },
            error: error => {
              if (error.error) {
                toast.error(error.error.message);
              } else {
                toast.error('Ocurrió un error al eliminar el registro');
              }
            }
          });
        } 
      },
    });
  }

  crearProducto() {
    this.router.navigate(['/main/crearproducto', ""]);
  }

  cambiarPagina(pagina: number) {
    if (pagina >= 1 && pagina <= this.totalPaginas) {
      this.paginaActual = pagina;
      if (this.search.length > 1) {
        this.getAllProductsPageSearch();
      } else {
        this.getAllProductsPage();
      }
    }
  }

  cambiarCantidadRegistrosPorPagina(event: any) {
    this.paginaActual = 1;
    this.elementosPorPagina = Number(event.target.value);
    if (this.search.length > 1) {
      this.getAllProductsPageSearch();
    } else {
      this.getAllProductsPage();
    }
  }

  checkAll() {
    this.lstProductos.forEach(producto => {
      if(this.selectAll) {
        this.showChangePrice = true;
        producto.selected = true;
      } else {
        producto.selected = false;
        this.validateSelected();
      }
    });
  }

  checkOne(product: Product) {
    if (product.selected) {
      product.selected = false;
      this.selectAll = false;
      this.validateSelected();
    } else {
      product.selected = true;
      this.showChangePrice = true;
    }


  }

  onSubmit(event: Event) {
    event.preventDefault();
  }

}
