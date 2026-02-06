import { Component, EventEmitter, Input, Output, inject, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BatchService } from '../../services/batch.service';
import { Batch, UpdateBatchPriceRequest, BATCH_DEFAULT_PRICE_VALIDITY_DAYS } from '../../models/batch';
import { Product } from '../../../producto/producto';
import { toast } from 'ngx-sonner';

@Component({
    selector: 'app-batch-selector-modal',
    standalone: true,
    imports: [CommonModule, FormsModule],
    template: `
        <div class="modal fade" id="batchSelectorModal" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-lg modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header bg-warning">
                        <h5 class="modal-title">
                            <i class="bi bi-box-seam me-2"></i>
                            Seleccionar Lote - {{ product?.description }}
                        </h5>
                        <button type="button" class="btn-close" (click)="close()"></button>
                    </div>
                    <div class="modal-body">
                        @if (isLoading) {
                            <div class="text-center py-4">
                                <div class="spinner-border text-warning" role="status">
                                    <span class="visually-hidden">Cargando...</span>
                                </div>
                                <p class="mt-2 text-muted">Cargando lotes disponibles...</p>
                            </div>
                        } @else if (batches.length === 0) {
                            <div class="alert alert-info text-center">
                                <i class="bi bi-info-circle me-2"></i>
                                No hay lotes disponibles para este producto.
                            </div>
                        } @else {
                            <!-- Alerta si hay lotes expirados -->
                            @if (hasExpiredBatches) {
                                <div class="alert alert-danger mb-3">
                                    <i class="bi bi-exclamation-octagon-fill me-2"></i>
                                    <strong>¡Atención!</strong> Hay lotes con precio expirado. 
                                    Debe actualizar el precio antes de poder vender de esos lotes.
                                </div>
                            }
                            
                            <div class="table-responsive">
                                <table class="table table-hover">
                                    <thead class="table-light">
                                        <tr>
                                            <th>Lote</th>
                                            <th>Fecha Ingreso</th>
                                            <th>Precio Venta</th>
                                            <th>Stock Disponible</th>
                                            <th>Estado</th>
                                            <th class="text-center">Acción</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        @for (batch of batches; track batch.id) {
                                            <tr [class.table-danger]="isExpired(batch)"
                                                [class.table-warning]="isExpiringSoon(batch) && !isExpired(batch)"
                                                [class.table-success]="selectedBatch?.id === batch.id && !isExpired(batch)">
                                                <td>
                                                    <span class="badge bg-dark fs-6">Lote {{ batch.batchNumber }}</span>
                                                </td>
                                                <td>{{ batch.entryDate | date:'dd/MM/yyyy' }}</td>
                                                <td class="fw-bold" [class.text-success]="!isExpired(batch)" [class.text-danger]="isExpired(batch)">
                                                    {{ batch.salePrice | currency:'$':'symbol':'1.0-0' }}
                                                    @if (isExpired(batch)) {
                                                        <small class="d-block text-danger">(Expirado)</small>
                                                    }
                                                </td>
                                                <td>
                                                    <span class="badge" 
                                                          [ngClass]="batch.currentStock > 5 ? 'bg-success' : 'bg-warning text-dark'">
                                                        {{ batch.currentStock }} {{ batch.unitMeasure }}
                                                    </span>
                                                </td>
                                                <td>
                                                    @if (isExpired(batch)) {
                                                        <span class="badge bg-danger">
                                                            <i class="bi bi-exclamation-octagon me-1"></i>
                                                            ¡PRECIO EXPIRADO!
                                                        </span>
                                                    } @else if (isExpiringSoon(batch)) {
                                                        <span class="badge bg-warning text-dark">
                                                            <i class="bi bi-exclamation-triangle me-1"></i>
                                                            Próximo a vencer
                                                        </span>
                                                    } @else {
                                                        <span class="badge bg-success">Vigente</span>
                                                    }
                                                </td>
                                                <td class="text-center">
                                                    @if (isExpired(batch)) {
                                                        <button class="btn btn-sm btn-danger"
                                                                (click)="openUpdatePriceModal(batch)">
                                                            <i class="bi bi-currency-dollar me-1"></i> Actualizar Precio
                                                        </button>
                                                    } @else {
                                                        <button class="btn btn-sm"
                                                                [ngClass]="selectedBatch?.id === batch.id ? 'btn-success' : 'btn-outline-primary'"
                                                                (click)="selectBatch(batch)"
                                                                [disabled]="batch.currentStock <= 0">
                                                            @if (selectedBatch?.id === batch.id) {
                                                                <i class="bi bi-check-circle-fill me-1"></i> Seleccionado
                                                            } @else {
                                                                <i class="bi bi-hand-index me-1"></i> Seleccionar
                                                            }
                                                        </button>
                                                    }
                                                </td>
                                            </tr>
                                        }
                                    </tbody>
                                </table>
                            </div>
                            
                            @if (selectedBatch && !isExpired(selectedBatch)) {
                                <div class="mt-3 p-3 bg-light rounded">
                                    <h6 class="mb-2">
                                        <i class="bi bi-calculator me-2"></i>
                                        Cantidad a vender del Lote {{ selectedBatch.batchNumber }}
                                    </h6>
                                    <div class="row align-items-center">
                                        <div class="col-md-6">
                                            <div class="input-group">
                                                <span class="input-group-text">Cantidad</span>
                                                <input type="number" class="form-control" 
                                                       [(ngModel)]="quantity"
                                                       [max]="selectedBatch.currentStock"
                                                       min="1"
                                                       (ngModelChange)="validateQuantity()">
                                                <span class="input-group-text">{{ selectedBatch.unitMeasure }}</span>
                                            </div>
                                            <small class="text-muted">
                                                Máximo disponible: {{ selectedBatch.currentStock }}
                                            </small>
                                        </div>
                                        <div class="col-md-6 text-end">
                                            <div class="fs-5">
                                                <span class="text-muted">Total:</span>
                                                <span class="fw-bold text-success ms-2">
                                                    {{ (selectedBatch.salePrice * quantity) | currency:'$':'symbol':'1.0-0' }}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            }
                        }
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" (click)="close()">
                            <i class="bi bi-x-circle me-1"></i> Cancelar
                        </button>
                        <button type="button" class="btn btn-success" 
                                (click)="confirm()"
                                [disabled]="!selectedBatch || quantity <= 0 || isExpired(selectedBatch)">
                            <i class="bi bi-check-circle me-1"></i> Confirmar Selección
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Modal de actualización de precio -->
        @if (showPriceModal && batchToUpdate) {
            <div class="modal-backdrop fade show" style="z-index: 1060;"></div>
            <div class="modal fade show d-block" tabindex="-1" style="z-index: 1065;">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header bg-danger text-white">
                            <h5 class="modal-title">
                                <i class="bi bi-exclamation-octagon me-2"></i>
                                Actualizar Precio Expirado
                            </h5>
                            <button type="button" class="btn-close btn-close-white" (click)="closePriceModal()"></button>
                        </div>
                        <div class="modal-body">
                            <div class="alert alert-warning mb-3">
                                <i class="bi bi-info-circle me-2"></i>
                                El precio de este lote ha expirado. Debe definir un nuevo precio para poder vender.
                            </div>
                            
                            <div class="mb-3 p-3 bg-light rounded">
                                <div class="row">
                                    <div class="col-6">
                                        <small class="text-muted">Lote:</small>
                                        <p class="mb-1"><span class="badge bg-dark">Lote {{ batchToUpdate.batchNumber }}</span></p>
                                    </div>
                                    <div class="col-6">
                                        <small class="text-muted">Stock Disponible:</small>
                                        <p class="mb-0">{{ batchToUpdate.currentStock }} {{ batchToUpdate.unitMeasure }}</p>
                                    </div>
                                    <div class="col-12 mt-2">
                                        <small class="text-muted">Precio Anterior (Expirado):</small>
                                        <p class="mb-0 text-danger text-decoration-line-through">
                                            {{ batchToUpdate.salePrice | currency:'$':'symbol':'1.0-0' }}
                                        </p>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="mb-3">
                                <label class="form-label fw-bold">
                                    <i class="bi bi-tag me-1"></i>Nuevo Precio de Venta *
                                </label>
                                <div class="input-group">
                                    <span class="input-group-text">$</span>
                                    <input type="number" class="form-control form-control-lg" 
                                           [(ngModel)]="newSalePrice"
                                           min="1"
                                           placeholder="Ingrese el nuevo precio">
                                </div>
                            </div>
                            
                            <div class="mb-3">
                                <label class="form-label fw-bold">
                                    <i class="bi bi-calendar-check me-1"></i>Días de Vigencia del Precio
                                </label>
                                <div class="input-group">
                                    <input type="number" class="form-control" 
                                           [(ngModel)]="newPriceValidityDays"
                                           min="1"
                                           max="30">
                                    <span class="input-group-text">días</span>
                                </div>
                                <small class="text-muted">El precio será válido por este número de días</small>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" (click)="closePriceModal()">
                                <i class="bi bi-x-circle me-1"></i>Cancelar
                            </button>
                            <button type="button" class="btn btn-success" 
                                    (click)="confirmPriceUpdate()"
                                    [disabled]="!newSalePrice || newSalePrice <= 0 || isUpdatingPrice">
                                @if (isUpdatingPrice) {
                                    <span class="spinner-border spinner-border-sm me-1"></span>
                                    Actualizando...
                                } @else {
                                    <i class="bi bi-check-circle me-1"></i>Confirmar Nuevo Precio
                                }
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        }
    `,
    styles: [`
        .table-warning {
            --bs-table-bg: #fff3cd;
        }
        .table-success {
            --bs-table-bg: #d1e7dd;
        }
        .table-danger {
            --bs-table-bg: #f8d7da;
        }
    `]
})
export class BatchSelectorModalComponent implements OnChanges {
    
    @Input() product: Product | null = null;
    @Output() batchSelected = new EventEmitter<{ batch: Batch; quantity: number }>();
    @Output() cancelled = new EventEmitter<void>();
    
    private batchService = inject(BatchService);
    
    batches: Batch[] = [];
    selectedBatch: Batch | null = null;
    quantity: number = 1;
    isLoading = false;
    
    // Modal de actualización de precio
    showPriceModal = false;
    batchToUpdate: Batch | null = null;
    newSalePrice: number = 0;
    newPriceValidityDays: number = BATCH_DEFAULT_PRICE_VALIDITY_DAYS;
    isUpdatingPrice = false;
    
    get hasExpiredBatches(): boolean {
        return this.batches.some(b => this.isExpired(b));
    }
    
    ngOnChanges(changes: SimpleChanges): void {
        if (changes['product'] && this.product) {
            this.loadBatches();
        }
    }
    
    loadBatches(): void {
        if (!this.product?.id) return;
        
        this.isLoading = true;
        this.selectedBatch = null;
        this.quantity = 1;
        
        this.batchService.getActiveByProductId(this.product.id).subscribe({
            next: (batches) => {
                this.batches = batches.filter(b => b.currentStock > 0);
                this.isLoading = false;
                
                // Auto-seleccionar si solo hay un lote y NO está expirado
                if (this.batches.length === 1 && !this.isExpired(this.batches[0])) {
                    this.selectBatch(this.batches[0]);
                }
            },
            error: () => {
                toast.error('Error al cargar los lotes disponibles');
                this.batches = [];
                this.isLoading = false;
            }
        });
    }
    
    selectBatch(batch: Batch): void {
        if (this.isExpired(batch)) {
            toast.warning('Este lote tiene el precio expirado. Debe actualizar el precio primero.');
            return;
        }
        this.selectedBatch = batch;
        this.quantity = 1;
    }
    
    validateQuantity(): void {
        if (this.selectedBatch) {
            if (this.quantity > this.selectedBatch.currentStock) {
                this.quantity = this.selectedBatch.currentStock;
            }
            if (this.quantity < 1) {
                this.quantity = 1;
            }
        }
    }
    
    isExpired(batch: Batch | null): boolean {
        if (!batch) return false;
        const expirationDate = new Date(batch.expirationDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        expirationDate.setHours(0, 0, 0, 0);
        return expirationDate < today;
    }
    
    isExpiringSoon(batch: Batch): boolean {
        if (this.isExpired(batch)) return false;
        const expirationDate = new Date(batch.expirationDate);
        const today = new Date();
        const diffDays = Math.ceil((expirationDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return diffDays <= 2 && diffDays >= 0;
    }
    
    openUpdatePriceModal(batch: Batch): void {
        this.batchToUpdate = batch;
        this.newSalePrice = batch.salePrice;
        this.newPriceValidityDays = batch.priceValidityDays || BATCH_DEFAULT_PRICE_VALIDITY_DAYS;
        this.showPriceModal = true;
    }
    
    closePriceModal(): void {
        this.showPriceModal = false;
        this.batchToUpdate = null;
        this.newSalePrice = 0;
        this.newPriceValidityDays = BATCH_DEFAULT_PRICE_VALIDITY_DAYS;
    }
    
    confirmPriceUpdate(): void {
        if (!this.batchToUpdate || !this.newSalePrice || this.newSalePrice <= 0) {
            toast.warning('Ingrese un precio de venta válido');
            return;
        }
        
        this.isUpdatingPrice = true;
        
        const request: UpdateBatchPriceRequest = {
            productId: this.batchToUpdate.productId,
            newSalePrice: this.newSalePrice,
            priceValidityDays: this.newPriceValidityDays,
            notes: `Precio actualizado desde selector de lotes`
        };
        
        this.batchService.updatePrice(request).subscribe({
            next: (updatedBatch) => {
                toast.success(`Precio actualizado. Nuevo lote #${updatedBatch.batchNumber} creado.`);
                this.closePriceModal();
                this.isUpdatingPrice = false;
                // Recargar lotes para ver el nuevo
                this.loadBatches();
            },
            error: (error) => {
                console.error('Error al actualizar precio:', error);
                toast.error('Error al actualizar el precio del lote');
                this.isUpdatingPrice = false;
            }
        });
    }
    
    confirm(): void {
        if (this.selectedBatch && this.quantity > 0 && !this.isExpired(this.selectedBatch)) {
            this.batchSelected.emit({
                batch: this.selectedBatch,
                quantity: this.quantity
            });
            this.close();
        }
    }
    
    close(): void {
        this.cancelled.emit();
        const modal = document.getElementById('batchSelectorModal');
        if (modal) {
            modal.classList.remove('show');
            modal.style.display = 'none';
            document.body.classList.remove('modal-open');
            const backdrop = document.querySelector('.modal-backdrop');
            backdrop?.remove();
        }
    }
}
