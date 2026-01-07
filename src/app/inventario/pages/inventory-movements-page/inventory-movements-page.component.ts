import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { InventoryService } from '../../services/inventory.service';
import { InventoryMovement, InventoryMovementFilter, MovementType, MovementTypeLabels, MovementTypeColors } from '../../models/inventory-movement';
import { ProductsSearchModalComponent } from '../../../producto/components/products-search-modal/products-search-modal.component';
import { Product } from '../../../producto/producto';
import { toast } from 'ngx-sonner';

@Component({
  selector: 'app-inventory-movements-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterLink, ProductsSearchModalComponent],
  templateUrl: './inventory-movements-page.component.html',
  styleUrl: './inventory-movements-page.component.css'
})
export class InventoryMovementsPageComponent implements OnInit {
  private fb = inject(FormBuilder);
  private inventoryService = inject(InventoryService);

  @ViewChild(ProductsSearchModalComponent) productsModal!: ProductsSearchModalComponent;

  movements: InventoryMovement[] = [];
  filteredMovements: InventoryMovement[] = [];
  selectedProduct: Product | null = null;
  isLoading = false;
  today: string = '';

  movementTypes = Object.values(MovementType);
  movementTypeLabels = MovementTypeLabels;
  movementTypeColors = MovementTypeColors;

  filterForm: FormGroup = this.fb.group({
    startDate: [''],
    endDate: [''],
    productId: [''],
    movementType: ['']
  });

  ngOnInit(): void {
    const now = new Date();
    this.today = now.toISOString().split('T')[0];
    this.loadMovements();
  }

  loadMovements(): void {
    this.isLoading = true;
    this.inventoryService.getMovements().subscribe({
      next: (data) => {
        this.movements = data.sort((a, b) => {
          const dateA = new Date(a.date).getTime();
          const dateB = new Date(b.date).getTime();
          return dateB - dateA;
        });
        this.filteredMovements = [...this.movements];
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading movements:', error);
        toast.error('Error al cargar movimientos');
        this.isLoading = false;
      }
    });
  }

  applyFilters(): void {
    const filters = this.filterForm.value;
    let filtered = [...this.movements];

    if (filters.startDate) {
      filtered = filtered.filter(m => {
        const movementDate = new Date(m.date).toISOString().split('T')[0];
        return movementDate >= filters.startDate;
      });
    }

    if (filters.endDate) {
      filtered = filtered.filter(m => {
        const movementDate = new Date(m.date).toISOString().split('T')[0];
        return movementDate <= filters.endDate;
      });
    }

    if (filters.productId) {
      filtered = filtered.filter(m => m.productId === filters.productId);
    }

    if (filters.movementType) {
      filtered = filtered.filter(m => m.movementType === filters.movementType);
    }

    this.filteredMovements = filtered;

    if (this.filteredMovements.length === 0) {
      toast.info('No se encontraron movimientos con los criterios de búsqueda');
    }
  }

  clearFilters(): void {
    this.filterForm.reset();
    this.selectedProduct = null;
    this.filteredMovements = [...this.movements];
  }

  openProductModal(): void {
    this.productsModal?.openModal();
  }

  onProductSelected(product: Product): void {
    this.selectedProduct = product;
    this.filterForm.patchValue({ productId: product.id });
  }

  clearProduct(): void {
    this.selectedProduct = null;
    this.filterForm.patchValue({ productId: '' });
  }

  getProductDisplayName(): string {
    if (!this.selectedProduct) return '';
    return `${this.selectedProduct.description} - ${this.selectedProduct.barcode}`;
  }

  formatDate(dateStr: string | Date): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleString('es-ES', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getMovementTypeLabel(type: MovementType): string {
    return this.movementTypeLabels[type];
  }

  getMovementTypeColor(type: MovementType): string {
    return this.movementTypeColors[type];
  }

  isPositiveMovement(type: MovementType): boolean {
    return type === MovementType.COMPRA || 
           type === MovementType.DEVOLUCION_VENTA ||
           (type === MovementType.AJUSTE_FISICO) ||
           (type === MovementType.AJUSTE_MANUAL);
  }
}
