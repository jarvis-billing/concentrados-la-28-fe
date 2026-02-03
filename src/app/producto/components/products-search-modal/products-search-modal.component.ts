import { Component, ElementRef, EventEmitter, OnDestroy, OnInit, Output, ViewChild, inject } from '@angular/core';
import { Presentation, Product } from '../../producto';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ProductoService } from '../../producto.service';
import { CommonModule } from '@angular/common';
import { toast } from 'ngx-sonner';
import { Subscription, debounceTime } from 'rxjs';
import { Router } from '@angular/router';

@Component({
  selector: 'app-products-search-modal',
  standalone: true,
  imports: [
    FormsModule,
    CommonModule,
    ReactiveFormsModule,
  ],
  templateUrl: './products-search-modal.component.html',
  styleUrl: './products-search-modal.component.css'
})
export class ProductsSearchModalComponent implements OnInit, OnDestroy {

  productService = inject(ProductoService);
  router = inject(Router);

  originalListProducts: Product[] = [];
  filteredListProducts: Product[] = [];
  completeProductsList: Product[] = [];
  selectedProducts: Product[] = [];
  productMatch: Boolean = false;
  productToSell: Product = new Product();

  @Output() selectPresentation = new EventEmitter<Product>();

  @ViewChild('productsModal', { static: false }) productsModalRef!: ElementRef;
  @ViewChild('searchProductInput', { static: false }) searchProductInput!: ElementRef<HTMLInputElement>;

  paginaActual: number = 1;
  elementosPorPagina: number = 10;
  totalElementos: number = 0;
  totalPaginas: number = 0;
  private productosSub?: Subscription;
  // Seguimiento para resaltar el producto recién agregado
  private prevProductIds = new Set<string>();
  highlightProductId?: string;
  private highlightTimeout?: any;

  formProduct = new FormGroup({
    searchProduct: new FormControl('')
  });

  
  ngOnInit(): void {
    // Mantener lista completa alimentada por el servicio y refrescar la página actual
    this.productosSub = this.productService.productos$
      .pipe(debounceTime(150))
      .subscribe(productos => {
        this.completeProductsList = productos || [];
        // Detectar nuevos productos por id
        try {
          const currentIds = new Set((this.completeProductsList || []).map(p => p?.id).filter(Boolean));
          const newOnes: string[] = [];
          currentIds.forEach(id => { if (!this.prevProductIds.has(id as string)) newOnes.push(id as string); });
          this.prevProductIds = currentIds;
          if (newOnes.length > 0) {
            this.highlightProductId = newOnes[0];
          }
        } catch { /* noop */ }
        // Si tenemos lista completa, paginamos en cliente; si no, pedimos backend
        if (this.isClientSource()) {
          this.refreshClientPage();
          this.applyHighlightScroll();
        } else {
          this.getAllProductsPage(true);
        }
      });
    // Precarga inicial
    this.productService.fetchAll();
    // Primer render: hasta que llegue productos$, mostramos página del backend
    this.getAllProductsPage(false);
  }

  ngOnDestroy(): void {
    this.productosSub?.unsubscribe();
  }

  // Determina si una presentación fija es "Bulto completo" o "Medio bulto" comparando contra el mayor fixedAmount del producto
  getFixedRole(product: Product | null | undefined, pres: any): 'FULL' | 'HALF' | null {
    try {
      if (!product || !pres?.isFixedAmount) return null;
      const fixed = (product.presentations || [])
        .filter(p => (p as any)?.isFixedAmount && typeof (p as any).fixedAmount === 'number' && (p as any).fixedAmount > 0)
        .map(p => Number((p as any).fixedAmount));
      if (fixed.length === 0) return null;
      const max = Math.max(...fixed);
      const amt = Number(pres.fixedAmount) || 0;
      const eps = 1e-6;
      if (Math.abs(amt - max) <= eps) return 'FULL';
      if (Math.abs(amt - (max / 2)) <= eps) return 'HALF';
      return null;
    } catch {
      return null;
    }
  }

  openModal() {
    const modalEl = this.productsModalRef?.nativeElement;
    if (modalEl) {
      // Enfocar cuando el modal termine de mostrarse
      modalEl.addEventListener('shown.bs.modal', () => {
        this.searchProductInput?.nativeElement.focus();
        this.searchProductInput?.nativeElement.select();
      }, { once: true });

      const modal = new (window as any).bootstrap.Modal(modalEl);
      modal.show();
    }
  }

  closeModal() {
    const modalEl = this.productsModalRef?.nativeElement;
    const modalInstance = (window as any).bootstrap?.Modal.getInstance(modalEl);
    modalInstance?.hide();
  }

  ProductToSell(product: Product) {
    this.productToSell = product;
  }

  ProductToSellFromPresentation(product: Product, presentation: Presentation) {
    // Clonar y mapear datos de presentación
    const mapped: Product = { ...product };
    mapped.barcode = presentation.barcode;
    mapped.price = presentation.salePrice;
    mapped.selectedUnitMeasure = presentation.unitMeasure;
    mapped.selectedPresentationLabel = presentation.label || '';
    const rootDesc = (product.description || '').trim();
    const label = (presentation.label || '').trim();
    mapped.description = label ? `${rootDesc} - ${label}` : rootDesc;
    // Preferir flags explícitos; para granel permitimos fallback por etiqueta
    const bulkFlag = presentation.isBulk ?? /granel/i.test(label);
    mapped.isBulk = !!bulkFlag;

    // Para packs de cantidad fija SOLO usamos flags explícitos
    const fixedFlag = !!presentation.isFixedAmount;
    const fixedAmount = presentation.fixedAmount;
    if (fixedFlag && (fixedAmount ?? 0) > 0) {
      mapped.hasFixedAmount = true;
      mapped.fixedAmount = fixedAmount as number; // ej. 40kg o 20kg
    } else {
      mapped.hasFixedAmount = false;
      mapped.fixedAmount = undefined;
    }
    if (!mapped.amount || mapped.amount < 1) mapped.amount = 1;
    this.productToSell = mapped;
    // Emitir selección al padre y cerrar modal
    this.selectPresentation.emit(mapped);
    this.closeModal();
  }

  goToCreateOrEditProduct(product?: Product) {
    try {
      if (product) {
        const firstBarcode = product?.presentations?.[0]?.barcode as string | undefined;
        if (firstBarcode) {
          this.closeModal();
          this.router.navigate(['/main/crearproducto', firstBarcode]);
          return;
        }
        if (product.id) {
          this.closeModal();
          this.router.navigate(['/main/crearproducto'], { queryParams: { id: product.id } });
          return;
        }
      }
      this.closeModal();
      this.router.navigate(['/main/crearproducto']);
    } catch {
      toast.error('No fue posible abrir el formulario de producto');
    }
  }

  getAllProductsPage(applyHighlight: boolean = false) {
    this.productService.getAllPage(this.paginaActual - 1, this.elementosPorPagina).subscribe(product => {
      this.originalListProducts = product.content;
      this.totalElementos = product.totalElements;
      this.totalPaginas = product.quantityPage;
      this.filteredListProducts = [...this.originalListProducts];
      if (applyHighlight) this.applyHighlightScroll();
    });
  } 

  changePage(pagina: number) {
    if (pagina >= 1 && pagina <= this.totalPaginas) {
      this.paginaActual = pagina;
      if (this.isClientSource()) {
        this.refreshClientPage();
      } else {
        this.getAllProductsPage();
      }
    }
  }


  searchProduct() {
    const query = this.formProduct.controls.searchProduct.value?.toLowerCase() ?? '';

    if (query.length < 3) {
      toast.warning('El criterio de búsqueda debe tener al menos 3 caracteres.');
      return;
    }

    const source = this.isClientSource() ? this.completeProductsList : this.originalListProducts;

    this.filteredListProducts = source.filter(product => {
      try {
        const rootDescription = product.description?.toLowerCase() || '';
        const productCode = product.productCode?.toLowerCase() || '';

        const inPresentations = (product.presentations || []).some(pres => {
          const barcode = pres.barcode?.toLowerCase() || '';
          const label = pres.label?.toLowerCase() || '';
          const combinedDescription = `${rootDescription} ${label}`.trim();
          return barcode.includes(query) || combinedDescription.includes(query);
        });

        const byProductCode = productCode.includes(query);
        return inPresentations || byProductCode;
      } catch (err) {
        console.error('❌ Error en la búsqueda del producto:', product, err);
        return false;
      }
    });

    this.productMatch = true;

    if (this.filteredListProducts.length === 0) {
      toast.info('No se encontró ningún producto con ese criterio');
      this.productMatch = true;
    }

    // Autoselección cuando hay un único resultado
    if (this.filteredListProducts.length === 1) {
      const singleProduct = this.filteredListProducts[0];
      const rootDescription = singleProduct.description?.toLowerCase() || '';
      const presentationsList = singleProduct.presentations || [];

      // Detectar presentaciones que coinciden específicamente con el criterio
      const matchingPresentations = presentationsList.filter(pres => {
        const barcode = pres.barcode?.toLowerCase() || '';
        const label = pres.label?.toLowerCase() || '';
        const combinedDescription = `${rootDescription} ${label}`.trim();
        return barcode.includes(query) || combinedDescription.includes(query);
      });

      if (matchingPresentations.length === 1) {
        // Selección precisa: una sola presentación coincide
        this.ProductToSellFromPresentation(singleProduct, matchingPresentations[0]);
        return;
      }
      if (presentationsList.length === 1) {
        // Selección por unicidad: solo existe una presentación
        this.ProductToSellFromPresentation(singleProduct, presentationsList[0]);
        return;
      }
      // Si hay múltiples presentaciones, expandir el acordeón del único producto para que el usuario elija
      setTimeout(() => {
        const collapseId = 'collapse-0';
        const collapseEl = document.getElementById(collapseId);
        if (collapseEl) {
          const bs = (window as any).bootstrap;
          if (bs?.Collapse) {
            new bs.Collapse(collapseEl, { toggle: true });
          } else {
            // Fallback: simular click en el header
            const headerBtn = document.querySelector(`#heading-0 .accordion-button`) as HTMLButtonElement | null;
            headerBtn?.click();
          }
          collapseEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 50);
    }
  }

  clearProductSearchField() {
    this.formProduct.reset();
    if (this.isClientSource()) {
      // restaurar página actual desde cliente
      this.refreshClientPage();
    } else {
      this.filteredListProducts = [...this.originalListProducts];
    }
    this.productMatch = false;
  }

  closeProductModal() {
    const modal = document.querySelector('#productsModal') as HTMLElement;
    if (modal) {
      modal.classList.remove('show'); 
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
      modal.removeAttribute('aria-modal');
      document.body.classList.remove('modal-open'); 
    }
  }

  // Helpers privados
  private isClientSource(): boolean {
    return Array.isArray(this.completeProductsList) && this.completeProductsList.length > 0;
  }

  private refreshClientPage(): void {
    try {
      const list = this.completeProductsList || [];
      this.totalElementos = list.length;
      this.totalPaginas = Math.max(1, Math.ceil(list.length / this.elementosPorPagina));
      // Ajustar página si quedó fuera de rango tras cambios
      if (this.paginaActual > this.totalPaginas) {
        this.paginaActual = this.totalPaginas;
      }
      const start = (this.paginaActual - 1) * this.elementosPorPagina;
      const end = start + this.elementosPorPagina;
      this.originalListProducts = list.slice(start, end);
      this.filteredListProducts = [...this.originalListProducts];
    } catch {
      // Fallback seguro
      this.getAllProductsPage();
    }
  }

  private applyHighlightScroll(): void {
    if (!this.highlightProductId) return;
    // Esperar al render
    setTimeout(() => {
      const el = document.getElementById(`product-${this.highlightProductId}`);
      if (el) {
        el.classList.add('highlight-pulse');
        try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
        // Expandir su acordeón si está colapsado
        try {
          const idx = this.filteredListProducts.findIndex(p => p?.id === this.highlightProductId);
          if (idx >= 0) {
            const collapseId = `collapse-${idx}`;
            const collapseEl = document.getElementById(collapseId);
            const bs = (window as any)?.bootstrap;
            if (collapseEl && bs?.Collapse) {
              new bs.Collapse(collapseEl, { toggle: true });
            } else {
              const headerBtn = document.querySelector(`#heading-${idx} .accordion-button`) as HTMLButtonElement | null;
              headerBtn?.click();
            }
          }
        } catch { /* noop */ }
        // Enfocar el campo de búsqueda para flujo ágil
        try { this.searchProductInput?.nativeElement?.focus(); } catch {}
        clearTimeout(this.highlightTimeout);
        this.highlightTimeout = setTimeout(() => {
          el.classList.remove('highlight-pulse');
          this.highlightProductId = undefined;
        }, 2500);
      } else {
        this.highlightProductId = undefined;
      }
    }, 50);
  }
}
