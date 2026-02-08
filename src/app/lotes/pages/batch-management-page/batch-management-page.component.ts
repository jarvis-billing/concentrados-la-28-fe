import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BatchService } from '../../services/batch.service';
import { Batch, BatchFilter, BatchStatus, BATCH_REQUIRED_CATEGORY, UpdateBatchPriceRequest } from '../../models/batch';
import { ProductoService } from '../../../producto/producto.service';
import { Product } from '../../../producto/producto';
import { toast } from 'ngx-sonner';

@Component({
    selector: 'app-batch-management-page',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './batch-management-page.component.html',
    styleUrl: './batch-management-page.component.css'
})
export class BatchManagementPageComponent implements OnInit {

    private batchService = inject(BatchService);
    private productService = inject(ProductoService);

    batches: Batch[] = [];
    products: Product[] = [];
    isLoading = false;

    // Filtros
    selectedProductId = '';
    selectedStatus: BatchStatus | '' = '';
    onlyActive = true;

    // Modal de actualización de precio
    showUpdatePriceModal = false;
    selectedBatch: Batch | null = null;
    newPrice: number = 0;
    newPriceValidityDays: number = 8;
    updateNotes: string = '';
    isUpdating = false;

    // Modal de crear lote manual
    showCreateBatchModal = false;
    newBatch = {
        productId: '',
        productDescription: '',
        salePrice: 0,
        initialStock: 0,
        priceValidityDays: 8,
        notes: ''
    };
    isCreating = false;

    ngOnInit(): void {
        this.loadProducts();
        this.loadBatches();
    }

    loadProducts(): void {
        this.productService.getAll().subscribe({
            next: (products) => {
                // Filtrar solo productos de ANIMALES VIVOS
                this.products = products.filter(p => 
                    p.category?.toUpperCase() === BATCH_REQUIRED_CATEGORY
                );
            },
            error: () => {
                toast.error('Error al cargar productos');
            }
        });
    }

    loadBatches(): void {
        this.isLoading = true;
        const filter: BatchFilter = {
            productId: this.selectedProductId || undefined,
            status: this.selectedStatus as BatchStatus || undefined,
            onlyActive: this.onlyActive
        };

        this.batchService.getAll(filter).subscribe({
            next: (batches) => {
                this.batches = batches;
                this.isLoading = false;
            },
            error: () => {
                toast.error('Error al cargar lotes');
                this.batches = [];
                this.isLoading = false;
            }
        });
    }

    onFilterChange(): void {
        this.loadBatches();
    }

    getStatusBadgeClass(status: BatchStatus): string {
        switch (status) {
            case BatchStatus.ACTIVE: return 'bg-success';
            case BatchStatus.DEPLETED: return 'bg-secondary';
            case BatchStatus.EXPIRED: return 'bg-warning text-dark';
            case BatchStatus.CLOSED: return 'bg-dark';
            default: return 'bg-secondary';
        }
    }

    getStatusLabel(status: BatchStatus): string {
        switch (status) {
            case BatchStatus.ACTIVE: return 'Activo';
            case BatchStatus.DEPLETED: return 'Agotado';
            case BatchStatus.EXPIRED: return 'Precio Expirado';
            case BatchStatus.CLOSED: return 'Cerrado';
            default: return status;
        }
    }

    isExpiringSoon(batch: Batch): boolean {
        const expirationDate = new Date(batch.expirationDate);
        const today = new Date();
        const diffDays = Math.ceil((expirationDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return diffDays <= 2 && diffDays > 0;
    }

    isExpired(batch: Batch): boolean {
        const expirationDate = new Date(batch.expirationDate);
        const today = new Date();
        return expirationDate < today;
    }

    getDaysUntilExpiration(batch: Batch): number {
        const expirationDate = new Date(batch.expirationDate);
        const today = new Date();
        return Math.ceil((expirationDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    }

    // === Modal Actualizar Precio ===
    openUpdatePriceModal(batch: Batch): void {
        this.selectedBatch = batch;
        this.newPrice = batch.salePrice;
        this.newPriceValidityDays = batch.priceValidityDays || 8;
        this.updateNotes = '';
        this.showUpdatePriceModal = true;
    }

    closeUpdatePriceModal(): void {
        this.showUpdatePriceModal = false;
        this.selectedBatch = null;
        this.newPrice = 0;
        this.newPriceValidityDays = 8;
        this.updateNotes = '';
    }

    confirmUpdatePrice(): void {
        if (!this.selectedBatch || this.newPrice <= 0) {
            toast.warning('Ingrese un precio válido');
            return;
        }

        this.isUpdating = true;
        const request: UpdateBatchPriceRequest = {
            productId: this.selectedBatch.productId,
            newSalePrice: this.newPrice,
            priceValidityDays: this.newPriceValidityDays,
            notes: this.updateNotes || undefined
        };

        this.batchService.updatePrice(request).subscribe({
            next: (newBatch) => {
                toast.success(`Nuevo lote #${newBatch.batchNumber} creado con precio $${this.newPrice.toLocaleString('es-CO')}`);
                this.closeUpdatePriceModal();
                this.loadBatches();
                this.isUpdating = false;
            },
            error: () => {
                toast.error('Error al actualizar el precio');
                this.isUpdating = false;
            }
        });
    }

    // === Modal Crear Lote Manual ===
    openCreateBatchModal(): void {
        this.newBatch = {
            productId: '',
            productDescription: '',
            salePrice: 0,
            initialStock: 0,
            priceValidityDays: 8,
            notes: ''
        };
        this.showCreateBatchModal = true;
    }

    closeCreateBatchModal(): void {
        this.showCreateBatchModal = false;
    }

    onProductSelectedForBatch(event: Event): void {
        const select = event.target as HTMLSelectElement;
        const productId = select.value;
        const product = this.products.find(p => p.id === productId);
        this.newBatch.productDescription = product?.description || '';
    }

    confirmCreateBatch(): void {
        if (!this.newBatch.productId || this.newBatch.salePrice <= 0 || this.newBatch.initialStock <= 0) {
            toast.warning('Complete todos los campos requeridos');
            return;
        }

        this.isCreating = true;
        this.batchService.create({
            productId: this.newBatch.productId,
            productDescription: this.newBatch.productDescription,
            salePrice: this.newBatch.salePrice,
            initialStock: this.newBatch.initialStock,
            priceValidityDays: this.newBatch.priceValidityDays,
            unitMeasure: 'UNIDAD',
            notes: this.newBatch.notes || undefined
        }).subscribe({
            next: (batch) => {
                toast.success(`Lote #${batch.batchNumber} creado exitosamente`);
                this.closeCreateBatchModal();
                this.loadBatches();
                this.isCreating = false;
            },
            error: () => {
                toast.error('Error al crear el lote');
                this.isCreating = false;
            }
        });
    }

    // === Cerrar Lote ===
    closeBatch(batch: Batch): void {
        toast.warning(`¿Está seguro de cerrar el Lote #${batch.batchNumber}?`, {
            description: 'Esta acción no se puede deshacer.',
            duration: 10000,
            action: {
                label: 'Sí, cerrar',
                onClick: () => this.confirmCloseBatch(batch)
            },
            cancel: {
                label: 'Cancelar',
                onClick: () => {}
            }
        });
    }

    private confirmCloseBatch(batch: Batch): void {
        this.batchService.closeBatch(batch.id!, 'Cerrado manualmente').subscribe({
            next: () => {
                toast.success(`Lote #${batch.batchNumber} cerrado`);
                this.loadBatches();
            },
            error: () => {
                toast.error('Error al cerrar el lote');
            }
        });
    }

    getProductName(productId: string): string {
        const product = this.products.find(p => p.id === productId);
        return product?.description || 'N/A';
    }
}
