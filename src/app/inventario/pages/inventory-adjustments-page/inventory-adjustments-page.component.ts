import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { InventoryService } from '../../services/inventory.service';
import { InventoryAdjustment, AdjustmentType, AdjustmentTypeLabels } from '../../models/inventory-adjustment';
import { AdjustmentReason, AdjustmentReasonLabels } from '../../models/physical-inventory';
import { ProductsSearchModalComponent } from '../../../producto/components/products-search-modal/products-search-modal.component';
import { Product } from '../../../producto/producto';
import { toast } from 'ngx-sonner';
import { LoginUserService } from '../../../auth/login/loginUser.service';

@Component({
  selector: 'app-inventory-adjustments-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, ProductsSearchModalComponent],
  templateUrl: './inventory-adjustments-page.component.html',
  styleUrl: './inventory-adjustments-page.component.css'
})
export class InventoryAdjustmentsPageComponent implements OnInit {
  private fb = inject(FormBuilder);
  private inventoryService = inject(InventoryService);
  private loginUserService = inject(LoginUserService);

  @ViewChild(ProductsSearchModalComponent) productsModal!: ProductsSearchModalComponent;

  form: FormGroup;
  selectedProduct: Product | null = null;
  adjustmentTypes = Object.values(AdjustmentType);
  adjustmentTypeLabels = AdjustmentTypeLabels;
  adjustmentReasons = Object.values(AdjustmentReason);
  adjustmentReasonLabels = AdjustmentReasonLabels;
  isLoading = false;
  recentAdjustments: InventoryAdjustment[] = [];
  userLogin = this.loginUserService.getUserFromToken();

  constructor() {
    this.form = this.fb.group({
      productId: ['', Validators.required],
      presentationBarcode: ['', Validators.required],
      adjustmentType: [AdjustmentType.INCREMENT, Validators.required],
      quantity: [0, [Validators.required, Validators.min(0.01)]],
      reason: [AdjustmentReason.CONTEO_FISICO, Validators.required],
      notes: [''],
      requiresAuthorization: [false]
    });
  }

  ngOnInit(): void {
    this.loadRecentAdjustments();
  }

  loadRecentAdjustments(): void {
    this.inventoryService.getAdjustments().subscribe({
      next: (adjustments) => {
        this.recentAdjustments = adjustments.slice(0, 5);
      },
      error: (error) => {
        console.error('Error al cargar ajustes recientes:', error);
      }
    });
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

  getNewStock(): number {
    const currentStock = this.getCurrentStock();
    const quantity = this.form.get('quantity')?.value || 0;
    const adjustmentType = this.form.get('adjustmentType')?.value;
    
    if (adjustmentType === AdjustmentType.INCREMENT) {
      return currentStock + quantity;
    } else {
      return currentStock - quantity;
    }
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

    const newStock = this.getNewStock();
    if (newStock < 0) {
      toast.error('El ajuste resultaría en stock negativo');
      return;
    }

    this.isLoading = true;

    const adjustment: Partial<InventoryAdjustment> = {
      date: new Date().toISOString(),
      productId: this.form.value.productId,
      presentationBarcode: this.form.value.presentationBarcode,
      adjustmentType: this.form.value.adjustmentType,
      quantity: this.form.value.quantity,
      previousStock: this.getCurrentStock(),
      newStock: newStock,
      reason: this.form.value.reason,
      notes: this.form.value.notes,
      userId: this.userLogin?.id || '',
      requiresAuthorization: this.form.value.requiresAuthorization
    };

    this.inventoryService.createAdjustment(adjustment).subscribe({
      next: () => {
        toast.success('Ajuste de inventario registrado correctamente');
        this.resetForm();
        this.loadRecentAdjustments();
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error al registrar ajuste:', error);
        toast.error('Error al registrar ajuste de inventario');
        this.isLoading = false;
      }
    });
  }

  resetForm(): void {
    this.form.reset({
      adjustmentType: AdjustmentType.INCREMENT,
      reason: AdjustmentReason.CONTEO_FISICO,
      quantity: 0,
      requiresAuthorization: false
    });
    this.selectedProduct = null;
  }
}
