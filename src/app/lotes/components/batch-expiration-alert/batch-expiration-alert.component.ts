import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { BatchService } from '../../services/batch.service';
import { Batch, BatchExpirationAlert, UpdateBatchPriceRequest, BATCH_DEFAULT_PRICE_VALIDITY_DAYS } from '../../models/batch';
import { toast } from 'ngx-sonner';

@Component({
    selector: 'app-batch-expiration-alert',
    standalone: true,
    imports: [CommonModule, RouterModule, FormsModule],
    template: `
        @if (alerts.length > 0) {
            <div class="batch-alert-container">
                <div class="alert mb-0 py-2 px-3" 
                     [ngClass]="hasExpiredBatches ? 'alert-danger' : 'alert-warning'">
                    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
                        <div class="d-flex align-items-center">
                            <i class="bi me-2 fs-5" 
                               [ngClass]="hasExpiredBatches ? 'bi-exclamation-octagon-fill text-danger' : 'bi-exclamation-triangle-fill text-warning'"></i>
                            <span class="fw-bold">
                                @if (expiredCount > 0) {
                                    <span class="text-danger">{{ expiredCount }} lote(s) EXPIRADO(S)</span>
                                    @if (expiringCount > 0) {
                                        <span class="text-dark"> y {{ expiringCount }} próximo(s) a expirar</span>
                                    }
                                } @else {
                                    {{ alerts.length }} lote(s) de animales vivos próximos a expirar
                                }
                            </span>
                        </div>
                        <div class="d-flex align-items-center gap-2">
                            <button class="btn btn-sm btn-outline-dark" (click)="toggleDetails()">
                                <i class="bi" [ngClass]="showDetails ? 'bi-chevron-up' : 'bi-chevron-down'"></i>
                                {{ showDetails ? 'Ocultar' : 'Ver detalles' }}
                            </button>
                            <button class="btn btn-sm btn-warning" routerLink="/main/inventario/lotes">
                                <i class="bi bi-pencil-square me-1"></i>
                                Gestionar Lotes
                            </button>
                        </div>
                    </div>
                </div>
                
                @if (showDetails) {
                    <div class="alert-details bg-light border border-top-0 p-3"
                         [ngClass]="hasExpiredBatches ? 'border-danger' : 'border-warning'">
                        <div class="table-responsive">
                            <table class="table table-sm table-hover mb-0">
                                <thead>
                                    <tr>
                                        <th>Producto</th>
                                        <th>Lote #</th>
                                        <th>Precio Actual</th>
                                        <th>Stock</th>
                                        <th>Estado</th>
                                        <th>Acción</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    @for (alert of alerts; track alert.batch.id) {
                                        <tr [class.table-danger]="alert.daysUntilExpiration <= 0">
                                            <td>{{ alert.batch.product?.description || 'N/A' }}</td>
                                            <td><span class="badge bg-secondary">Lote {{ alert.batch.batchNumber }}</span></td>
                                            <td>{{ alert.batch.salePrice | currency:'$':'symbol':'1.0-0' }}</td>
                                            <td>{{ alert.batch.currentStock }} {{ alert.batch.unitMeasure }}</td>
                                            <td>
                                                @if (alert.daysUntilExpiration <= 0) {
                                                    <span class="badge bg-danger">
                                                        <i class="bi bi-exclamation-octagon me-1"></i>¡EXPIRADO!
                                                    </span>
                                                } @else if (alert.daysUntilExpiration === 1) {
                                                    <span class="badge bg-warning text-dark">Expira mañana</span>
                                                } @else {
                                                    <span class="badge bg-warning text-dark">{{ alert.daysUntilExpiration }} días</span>
                                                }
                                            </td>
                                            <td>
                                                <button class="btn btn-sm" 
                                                        [ngClass]="alert.daysUntilExpiration <= 0 ? 'btn-danger' : 'btn-outline-primary'"
                                                        (click)="openUpdatePriceModal(alert.batch)">
                                                    <i class="bi bi-currency-dollar me-1"></i>
                                                    {{ alert.daysUntilExpiration <= 0 ? 'Actualizar Ahora' : 'Actualizar' }}
                                                </button>
                                            </td>
                                        </tr>
                                    }
                                </tbody>
                            </table>
                        </div>
                    </div>
                }
            </div>
        }

        <!-- Modal de actualización de precio -->
        @if (showPriceModal && selectedBatch) {
            <div class="modal-backdrop fade show"></div>
            <div class="modal fade show d-block" tabindex="-1">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header bg-warning">
                            <h5 class="modal-title">
                                <i class="bi bi-currency-dollar me-2"></i>
                                Actualizar Precio de Lote
                            </h5>
                            <button type="button" class="btn-close" (click)="closePriceModal()"></button>
                        </div>
                        <div class="modal-body">
                            <div class="mb-3 p-3 bg-light rounded">
                                <div class="row">
                                    <div class="col-6">
                                        <small class="text-muted">Producto:</small>
                                        <p class="mb-1 fw-bold">{{ selectedBatch.product?.description || 'N/A' }}</p>
                                    </div>
                                    <div class="col-6">
                                        <small class="text-muted">Lote:</small>
                                        <p class="mb-1"><span class="badge bg-dark">Lote {{ selectedBatch.batchNumber }}</span></p>
                                    </div>
                                    <div class="col-6">
                                        <small class="text-muted">Precio Actual:</small>
                                        <p class="mb-1 text-danger fw-bold">{{ selectedBatch.salePrice | currency:'$':'symbol':'1.0-0' }}</p>
                                    </div>
                                    <div class="col-6">
                                        <small class="text-muted">Stock Disponible:</small>
                                        <p class="mb-0">{{ selectedBatch.currentStock }} {{ selectedBatch.unitMeasure }}</p>
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
                                    [disabled]="!newSalePrice || newSalePrice <= 0 || isUpdating">
                                @if (isUpdating) {
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
        .batch-alert-container {
            position: sticky;
            top: 0;
            z-index: 1020;
        }
        .alert-details {
            max-height: 300px;
            overflow-y: auto;
        }
        .modal {
            background-color: rgba(0, 0, 0, 0.5);
        }
    `]
})
export class BatchExpirationAlertComponent implements OnInit {
    
    private batchService = inject(BatchService);
    
    alerts: BatchExpirationAlert[] = [];
    showDetails = false;
    
    // Modal de actualización de precio
    showPriceModal = false;
    selectedBatch: Batch | null = null;
    newSalePrice: number = 0;
    newPriceValidityDays: number = BATCH_DEFAULT_PRICE_VALIDITY_DAYS;
    isUpdating = false;
    
    get hasExpiredBatches(): boolean {
        return this.alerts.some(a => a.daysUntilExpiration <= 0);
    }
    
    get expiredCount(): number {
        return this.alerts.filter(a => a.daysUntilExpiration <= 0).length;
    }
    
    get expiringCount(): number {
        return this.alerts.filter(a => a.daysUntilExpiration > 0).length;
    }
    
    ngOnInit(): void {
        this.checkExpiringBatches();
    }
    
    checkExpiringBatches(): void {
        this.batchService.getExpiringSoon().subscribe({
            next: (alerts) => {
                const previousCount = this.alerts.length;
                this.alerts = alerts.filter(a => a.requiresAction);
                
                // Ordenar: expirados primero, luego por días restantes
                this.alerts.sort((a, b) => a.daysUntilExpiration - b.daysUntilExpiration);
                
                // Notificar si hay nuevas alertas
                if (this.alerts.length > previousCount && this.alerts.length > 0) {
                    const expiredCount = this.alerts.filter(a => a.daysUntilExpiration <= 0).length;
                    if (expiredCount > 0) {
                        toast.error(
                            `¡${expiredCount} lote(s) de animales vivos tienen precio EXPIRADO! Actualice el precio para poder vender.`,
                            { duration: 15000 }
                        );
                    } else {
                        toast.warning(
                            `${this.alerts.length} lote(s) de animales vivos próximos a expirar`,
                            { duration: 10000 }
                        );
                    }
                }
            },
            error: () => {
                this.alerts = [];
            }
        });
    }
    
    toggleDetails(): void {
        this.showDetails = !this.showDetails;
    }
    
    openUpdatePriceModal(batch: Batch): void {
        this.selectedBatch = batch;
        this.newSalePrice = batch.salePrice; // Sugerir el precio actual
        this.newPriceValidityDays = batch.priceValidityDays || BATCH_DEFAULT_PRICE_VALIDITY_DAYS;
        this.showPriceModal = true;
    }
    
    closePriceModal(): void {
        this.showPriceModal = false;
        this.selectedBatch = null;
        this.newSalePrice = 0;
        this.newPriceValidityDays = BATCH_DEFAULT_PRICE_VALIDITY_DAYS;
    }
    
    confirmPriceUpdate(): void {
        if (!this.selectedBatch || !this.newSalePrice || this.newSalePrice <= 0) {
            toast.warning('Ingrese un precio de venta válido');
            return;
        }
        
        this.isUpdating = true;
        
        const request: UpdateBatchPriceRequest = {
            productId: this.selectedBatch.productId,
            newSalePrice: this.newSalePrice,
            priceValidityDays: this.newPriceValidityDays,
            notes: `Precio actualizado desde alerta de expiración`
        };
        
        this.batchService.updatePrice(request).subscribe({
            next: (updatedBatch) => {
                toast.success(`Precio actualizado correctamente. Nuevo lote #${updatedBatch.batchNumber} creado.`);
                this.closePriceModal();
                this.isUpdating = false;
                // Recargar alertas
                this.checkExpiringBatches();
            },
            error: (error) => {
                console.error('Error al actualizar precio:', error);
                toast.error('Error al actualizar el precio del lote');
                this.isUpdating = false;
            }
        });
    }
}
