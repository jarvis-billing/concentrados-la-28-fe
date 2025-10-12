import { Component, OnInit, AfterViewInit, inject } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Product } from './producto';
import { toast } from 'ngx-sonner';
import { ProductoService } from './producto.service';
import { Router, RouterModule } from '@angular/router';
import { debounceTime, Subject } from 'rxjs';
import { ProductPrice } from './productoPrice';
import { ExpensesFabComponent } from '../expenses/expenses-fab.component';

@Component({
  selector: 'app-producto',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, ExpensesFabComponent],
  templateUrl: './producto.component.html'
})
export class ProductoComponent implements OnInit, AfterViewInit {

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
  selectedProduct: Product | null = null;
  maxPrecio: number = 10000000;

  constructor(private service: ProductoService) {
    this.searchTerms.pipe(
      debounceTime(500) // Espera 500 ms después de la última pulsación de tecla
    ).subscribe(term => this.getAllProductsPageSearch());
  }

  // Determina si una presentación fija es "Bulto completo" o "Medio bulto" comparando contra el mayor fixedAmount del producto
  getFixedRole(product: Product | null | undefined, pres: any): 'FULL' | 'HALF' | null {
    if (!product || !pres?.isFixedAmount) return null;
    const fixed = (product.presentations || [])
      .filter(p => p?.isFixedAmount && typeof p.fixedAmount === 'number' && p.fixedAmount > 0)
      .map(p => Number(p.fixedAmount));
    if (fixed.length === 0) return null;
    const max = Math.max(...fixed);
    const amt = Number(pres.fixedAmount) || 0;
    const eps = 1e-6;
    if (Math.abs(amt - max) <= eps) return 'FULL';
    if (Math.abs(amt - (max / 2)) <= eps) return 'HALF';
    return null;
  }

  router = inject(Router);

  ngOnInit(): void {
    this.getAllProductsPage();
  }

  ngAfterViewInit(): void {
    this.initTooltips();
  }

  private initTooltips() {
    try {
      const tooltipTriggerList = Array.from(document.querySelectorAll('[data-bs-toggle="tooltip"]')) as HTMLElement[];
      tooltipTriggerList.forEach((el) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Tip = (window as any)?.bootstrap?.Tooltip;
        if (Tip) new Tip(el);
      });
    } catch {
      // noop
    }
  }

  limpiarFiltro(): void {
    this.search = "";
    this.getAllProductsPage();
  }

  onSearchChange(searchTerm: string): void {
    this.searchTerms.next(searchTerm);
  }

  updateAllPrice() {
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
      setTimeout(() => this.initTooltips());
    });
  }

  getAllProductsPageSearch() {
    if (this.search.length > 0) {
      this.service.getAllPageSearch(this.paginaActual - 1, this.elementosPorPagina, this.search).subscribe(data => {
        this.lstProductos = data.content;
        this.totalElementos = data.totalElements;
        this.totalPaginas = data.quantityPage;
        setTimeout(() => this.initTooltips());
      });
    } else {
      this.getAllProductsPage();
    }
  }

  editarProducto(barcode: string) {
    if (barcode) {
      this.router.navigate(['/main/crearproducto', barcode]);
    }
  }

  editProduct(product: Product) {
    const firstBarcode = product?.presentations?.[0]?.barcode as string | undefined;
    if (firstBarcode) {
      this.editarProducto(firstBarcode);
      return;
    }
    if (product?.id) {
      toast.warning('Este producto no tiene presentaciones con código de barras, abriendo edición por ID');
      this.router.navigate(['/main/crearproducto'], { queryParams: { id: product.id } });
      return;
    }
    toast.warning('No es posible editar: no hay barcode ni ID');
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
    this.router.navigate(['/main/crearproducto']);
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
      if (this.selectAll) {
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

  viewDetails(product: Product) {
    this.selectedProduct = product;
    setTimeout(() => this.initTooltips());
  }

  getMinPrice(product: Product): number | null {
    if (!product?.presentations || product.presentations.length === 0) return null;
    const prices = product.presentations
      .map(p => p?.salePrice)
      .filter((v): v is number => typeof v === 'number' && !isNaN(v));
    if (prices.length === 0) return null;
    return Math.min(...prices);
  }

  async copyToClipboard(text: string | number | null | undefined) {
    try {
      const value = text != null ? String(text) : '';
      await navigator.clipboard.writeText(value);
      toast.success('Copiado al portapapeles');
    } catch (e) {
      console.error(e);
      toast.error('No se pudo copiar');
    }
  }

  selectPrevProduct() {
    if (!this.selectedProduct) return;
    const idx = this.lstProductos.findIndex(p => p.id === this.selectedProduct?.id);
    if (idx > 0) {
      this.selectedProduct = this.lstProductos[idx - 1];
    }
  }

  selectNextProduct() {
    if (!this.selectedProduct) return;
    const idx = this.lstProductos.findIndex(p => p.id === this.selectedProduct?.id);
    if (idx > -1 && idx < this.lstProductos.length - 1) {
      this.selectedProduct = this.lstProductos[idx + 1];
    }
  }

  editPresentation(barcode: string | undefined | null) {
    if (barcode) {
      this.editarProducto(barcode);
    } else {
      toast.warning('No hay código de barras para editar');
    }
  }

}
