import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { InventoryService } from '../../services/inventory.service';
import { PhysicalInventory, AdjustmentReason, AdjustmentReasonLabels } from '../../models/physical-inventory';
import { ProductsSearchModalComponent } from '../../../producto/components/products-search-modal/products-search-modal.component';
import { Product } from '../../../producto/producto';
import { toast } from 'ngx-sonner';
import { LoginUserService } from '../../../auth/login/loginUser.service';

@Component({
  selector: 'app-physical-inventory-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, ProductsSearchModalComponent],
  templateUrl: './physical-inventory-page.component.html',
  styleUrl: './physical-inventory-page.component.css'
})
export class PhysicalInventoryPageComponent implements OnInit {
  private fb = inject(FormBuilder);
  private inventoryService = inject(InventoryService);
  private loginUserService = inject(LoginUserService);

  @ViewChild(ProductsSearchModalComponent) productsModal!: ProductsSearchModalComponent;

  form: FormGroup;
  selectedProduct: Product | null = null;
  adjustmentReasons = Object.values(AdjustmentReason);
  adjustmentReasonLabels = AdjustmentReasonLabels;
  isLoading = false;
  userLogin = this.loginUserService.getUserFromToken();

  constructor() {
    this.form = this.fb.group({
      productId: ['', Validators.required],
      presentationBarcode: ['', Validators.required],
      physicalStock: [0, [Validators.required, Validators.min(0)]],
      adjustmentReason: [AdjustmentReason.CONTEO_FISICO, Validators.required],
      notes: ['']
    });
  }

  ngOnInit(): void {
    const today = new Date().toISOString();
    this.form.patchValue({ date: today });
  }

  openProductModal(): void {
    this.productsModal?.openModal();
  }

  onProductSelected(product: Product): void {
    this.selectedProduct = product;
    
    const presentation = product.presentations && product.presentations.length > 0 
      ? product.presentations[0] 
      : null;

    this.form.patchValue({
      productId: product.id,
      presentationBarcode: presentation?.barcode || product.barcode
    });
  }

  clearProduct(): void {
    this.selectedProduct = null;
    this.form.patchValue({
      productId: '',
      presentationBarcode: ''
    });
  }

  getProductDisplayName(): string {
    if (!this.selectedProduct) return '';
    return `${this.selectedProduct.description} - ${this.selectedProduct.barcode}`;
  }

  getCurrentStock(): number {
    return this.selectedProduct?.stock?.quantity || 0;
  }

  getDifference(): number {
    const physicalStock = this.form.get('physicalStock')?.value || 0;
    const systemStock = this.getCurrentStock();
    return physicalStock - systemStock;
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      toast.warning('Complete todos los campos obligatorios');
      return;
    }

    if (!this.selectedProduct) {
      toast.warning('Debe seleccionar un producto');
      return;
    }

    this.isLoading = true;

    const physicalInventory: Partial<PhysicalInventory> = {
      date: new Date().toISOString(),
      productId: this.form.value.productId,
      presentationBarcode: this.form.value.presentationBarcode,
      systemStock: this.getCurrentStock(),
      physicalStock: this.form.value.physicalStock,
      difference: this.getDifference(),
      adjustmentReason: this.form.value.adjustmentReason,
      notes: this.form.value.notes,
      userId: this.userLogin?.id || ''
    };

    this.inventoryService.createPhysicalInventory(physicalInventory).subscribe({
      next: () => {
        toast.success('Inventario físico registrado correctamente');
        this.resetForm();
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error al registrar inventario físico:', error);
        toast.error('Error al registrar inventario físico');
        this.isLoading = false;
      }
    });
  }

  resetForm(): void {
    this.form.reset({
      adjustmentReason: AdjustmentReason.CONTEO_FISICO,
      physicalStock: 0
    });
    this.selectedProduct = null;
  }
}
