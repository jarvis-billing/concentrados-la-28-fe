import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormArray, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { InventoryService } from '../../services/inventory.service';
import { PhysicalInventory, AdjustmentReason, AdjustmentReasonLabels, PresentationCount } from '../../models/physical-inventory';
import { ProductsSearchModalComponent } from '../../../producto/components/products-search-modal/products-search-modal.component';
import { Product, Presentation, ESaleType } from '../../../producto/producto';
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
  
  // Para productos con múltiples presentaciones
  presentationCounts: { presentation: Presentation; quantity: number }[] = [];

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

    // Inicializar conteos por presentación si el producto tiene múltiples presentaciones
    if (this.usesPresentationCounts()) {
      this.initPresentationCounts();
    }
  }

  clearProduct(): void {
    this.selectedProduct = null;
    this.presentationCounts = [];
    this.form.patchValue({
      productId: '',
      presentationBarcode: ''
    });
  }

  // Determina si el producto usa conteo por presentaciones (WEIGHT, VOLUME, LONGITUDE)
  usesPresentationCounts(): boolean {
    if (!this.selectedProduct) return false;
    const saleType = this.selectedProduct.saleType;
    return saleType === ESaleType.WEIGHT || saleType === ESaleType.VOLUME || saleType === ESaleType.LONGITUDE;
  }

  // Inicializa los conteos por presentación
  initPresentationCounts(): void {
    if (!this.selectedProduct?.presentations) {
      this.presentationCounts = [];
      return;
    }
    this.presentationCounts = this.selectedProduct.presentations.map(p => ({
      presentation: p,
      quantity: 0
    }));
  }

  // Actualiza la cantidad de una presentación
  updatePresentationCount(index: number, quantity: number): void {
    if (this.presentationCounts[index]) {
      this.presentationCounts[index].quantity = quantity;
    }
  }

  // Calcula el stock total basado en los conteos por presentación
  getCalculatedTotalStock(): number {
    if (!this.usesPresentationCounts()) {
      return this.form.get('physicalStock')?.value || 0;
    }
    
    return this.presentationCounts.reduce((total, item) => {
      const qty = item.quantity || 0;
      // Si es cantidad fija (bulto/medio bulto), multiplicar por fixedAmount
      if (item.presentation.isFixedAmount && item.presentation.fixedAmount) {
        return total + (qty * item.presentation.fixedAmount);
      }
      // Si es granel, la cantidad es directa
      return total + qty;
    }, 0);
  }

  // Obtiene la etiqueta descriptiva de una presentación
  getPresentationLabel(pres: Presentation): string {
    if (pres.isBulk) return `${pres.label || 'Granel'} (cantidad directa)`;
    if (pres.isFixedAmount && pres.fixedAmount) {
      return `${pres.label || 'Bulto'} (${pres.fixedAmount} ${pres.unitMeasure} c/u)`;
    }
    return pres.label || pres.barcode;
  }

  // Obtiene el aporte de una presentación al total
  getPresentationContribution(item: { presentation: Presentation; quantity: number }): number {
    const qty = item.quantity || 0;
    if (item.presentation.isFixedAmount && item.presentation.fixedAmount) {
      return qty * item.presentation.fixedAmount;
    }
    return qty;
  }

  getProductDisplayName(): string {
    if (!this.selectedProduct) return '';
    return `${this.selectedProduct.description} - ${this.selectedProduct.barcode}`;
  }

  getCurrentStock(): number {
    return this.selectedProduct?.stock?.quantity || 0;
  }

  getDifference(): number {
    const physicalStock = this.usesPresentationCounts() 
      ? this.getCalculatedTotalStock() 
      : (this.form.get('physicalStock')?.value || 0);
    const systemStock = this.getCurrentStock();
    return physicalStock - systemStock;
  }

  onSubmit(): void {
    if (!this.selectedProduct) {
      toast.warning('Debe seleccionar un producto');
      return;
    }

    // Validar según el tipo de conteo
    if (this.usesPresentationCounts()) {
      // Validar que al menos una presentación tenga cantidad > 0
      const hasAnyCount = this.presentationCounts.some(item => item.quantity > 0);
      if (!hasAnyCount) {
        toast.warning('Debe ingresar al menos una cantidad en las presentaciones');
        return;
      }
      this.submitByPresentations();
    } else {
      if (this.form.invalid) {
        this.form.markAllAsTouched();
        toast.warning('Complete todos los campos obligatorios');
        return;
      }
      this.submitDirect();
    }
  }

  // Envío directo para productos UNIT
  private submitDirect(): void {
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

  // Envío por presentaciones para productos WEIGHT, VOLUME, LONGITUDE
  private submitByPresentations(): void {
    this.isLoading = true;

    const presentationCountsData: PresentationCount[] = this.presentationCounts.map(item => ({
      presentationBarcode: item.presentation.barcode,
      quantity: item.quantity || 0
    }));

    const request = {
      productId: this.selectedProduct!.id,
      date: new Date().toISOString(),
      presentationCounts: presentationCountsData,
      adjustmentReason: this.form.value.adjustmentReason,
      notes: this.form.value.notes,
      userId: this.userLogin?.id || ''
    };

    this.inventoryService.createPhysicalInventoryByPresentations(request).subscribe({
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
    this.presentationCounts = [];
  }
}
