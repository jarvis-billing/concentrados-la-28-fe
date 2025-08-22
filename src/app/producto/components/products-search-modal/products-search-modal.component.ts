import { Component, inject } from '@angular/core';
import { Product } from '../../producto';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ProductoService } from '../../producto.service';
import { CommonModule } from '@angular/common';
import { toast } from 'ngx-sonner';

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
export class ProductsSearchModalComponent {

  productService = inject(ProductoService);

  originalListProducts: Product[] = [];
  filteredListProducts: Product[] = [];
  completeProductsList: Product[] = [];
  selectedProducts: Product[] = [];
  productMatch: Boolean = false;
  productToSell: Product = new Product();

  paginaActual: number = 1;
  elementosPorPagina: number = 10;
  totalElementos: number = 0;
  totalPaginas: number = 0;

  formProduct = new FormGroup({
    searchProduct: new FormControl('')
  });

  
  ProductToSell(product: Product) {
    this.productToSell = product;
  }

  getAllProductsPage() {
    this.productService.getAllPage(this.paginaActual - 1, this.elementosPorPagina).subscribe(product => {
      this.originalListProducts = product.content;
      this.totalElementos = product.totalElements;
      this.totalPaginas = product.quantityPage;
      this.filteredListProducts = [...this.originalListProducts];
    });
  }


  searchProduct() {
    const searchProduct = this.formProduct.controls.searchProduct.value?.toLowerCase() ?? '';
    if (searchProduct) {
      this.filteredListProducts = this.completeProductsList.filter(product =>
        product.barcode.toLowerCase().includes(searchProduct) ||
        product.description.toLowerCase().includes(searchProduct)
      );
      this.productMatch = true;

    } else {
      this.filteredListProducts = [...this.originalListProducts];
      this.productMatch = false;
    }

    if (this.filteredListProducts.length === 0) {
      toast.info('No se encontró ningún producto con ese criterio');
      this.productMatch = true;
    }
  }

  clearProductSearchField() {
    this.formProduct.reset();
    this.filteredListProducts = [...this.originalListProducts];
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
}
