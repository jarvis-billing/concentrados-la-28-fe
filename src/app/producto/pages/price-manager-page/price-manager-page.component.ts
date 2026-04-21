import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProductoService } from '../../producto.service';
import { CatalogService } from '../../catalog.service';
import { Product } from '../../producto';
import { PresentationPriceUpdate } from '../../models/bulk-price-update.model';
import { toast } from 'ngx-sonner';

interface PresentationRow {
    productId: string;
    productCode: string;
    productDescription: string;
    category: string;
    brand: string;
    barcode: string;
    presentationLabel: string;
    salePrice: number;
    costPrice: number;
    newSalePrice: number;
    newCostPrice: number;
    selected: boolean;
}

type BulkField = 'salePrice' | 'costPrice' | 'both';
type BulkMode = 'fixed' | 'percent';

@Component({
    selector: 'app-price-manager-page',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './price-manager-page.component.html'
})
export class PriceManagerPageComponent implements OnInit {

    private productService = inject(ProductoService);
    private catalogService = inject(CatalogService);

    // Data
    allRows: PresentationRow[] = [];
    filteredRows: PresentationRow[] = [];
    originalProducts: Product[] = [];

    // Filters
    searchText: string = '';
    selectedCategory: string = '';
    selectedBrand: string = '';
    categories: string[] = [];
    brands: string[] = [];

    // Pagination (client-side)
    pageSize: number = 20;
    currentPage: number = 1;

    // Bulk action
    bulkField: BulkField = 'salePrice';
    bulkMode: BulkMode = 'fixed';
    bulkValue: number = 0;

    // State
    isLoading: boolean = false;
    isSaving: boolean = false;
    selectAllOnPage: boolean = false;

    ngOnInit(): void {
        this.loadCatalogs();
        this.loadProducts();
    }

    private loadCatalogs(): void {
        this.catalogService.categories$.subscribe(cats => this.categories = [...(cats || [])]);
        this.catalogService.brands$.subscribe(br => this.brands = [...(br || [])]);
    }

    loadProducts(): void {
        this.isLoading = true;
        this.productService.getAll().subscribe({
            next: (products) => {
                this.originalProducts = products || [];
                this.buildRows();
                this.applyFilters();
                this.isLoading = false;
            },
            error: () => {
                toast.error('Error al cargar productos');
                this.isLoading = false;
            }
        });
    }

    private buildRows(): void {
        const rows: PresentationRow[] = [];
        for (const p of this.originalProducts) {
            for (const pres of (p.presentations || [])) {
                rows.push({
                    productId: p.id,
                    productCode: p.productCode || '',
                    productDescription: p.description || '',
                    category: p.category || '',
                    brand: p.brand || '',
                    barcode: pres.barcode || '',
                    presentationLabel: pres.label || '',
                    salePrice: pres.salePrice || 0,
                    costPrice: pres.costPrice || 0,
                    newSalePrice: pres.salePrice || 0,
                    newCostPrice: pres.costPrice || 0,
                    selected: false
                });
            }
        }
        this.allRows = rows;
    }

    applyFilters(): void {
        const q = this.searchText.trim().toLowerCase();
        this.filteredRows = this.allRows.filter(r => {
            if (this.selectedCategory && r.category !== this.selectedCategory) return false;
            if (this.selectedBrand && r.brand !== this.selectedBrand) return false;
            if (q) {
                const haystack = `${r.productDescription} ${r.productCode} ${r.barcode} ${r.presentationLabel} ${r.brand} ${r.category}`.toLowerCase();
                if (!haystack.includes(q)) return false;
            }
            return true;
        });
        this.currentPage = 1;
        this.syncSelectAllCheckbox();
    }

    clearFilters(): void {
        this.searchText = '';
        this.selectedCategory = '';
        this.selectedBrand = '';
        this.applyFilters();
    }

    // ---------------- Pagination ----------------
    get totalPages(): number {
        return Math.max(1, Math.ceil(this.filteredRows.length / this.pageSize));
    }

    get pagedRows(): PresentationRow[] {
        const start = (this.currentPage - 1) * this.pageSize;
        return this.filteredRows.slice(start, start + this.pageSize);
    }

    changePage(page: number): void {
        if (page >= 1 && page <= this.totalPages) {
            this.currentPage = page;
            this.syncSelectAllCheckbox();
        }
    }

    changePageSize(size: number): void {
        this.pageSize = size;
        this.currentPage = 1;
        this.syncSelectAllCheckbox();
    }

    // ---------------- Selection ----------------
    toggleSelectAllOnPage(): void {
        const target = this.selectAllOnPage;
        this.pagedRows.forEach(r => r.selected = target);
    }

    toggleRow(row: PresentationRow): void {
        row.selected = !row.selected;
        this.syncSelectAllCheckbox();
    }

    private syncSelectAllCheckbox(): void {
        const page = this.pagedRows;
        this.selectAllOnPage = page.length > 0 && page.every(r => r.selected);
    }

    selectAllFiltered(): void {
        this.filteredRows.forEach(r => r.selected = true);
        this.syncSelectAllCheckbox();
    }

    clearSelection(): void {
        this.allRows.forEach(r => r.selected = false);
        this.selectAllOnPage = false;
    }

    get selectedCount(): number {
        return this.allRows.filter(r => r.selected).length;
    }

    get modifiedCount(): number {
        return this.allRows.filter(r => this.isRowModified(r)).length;
    }

    isRowModified(row: PresentationRow): boolean {
        return row.newSalePrice !== row.salePrice || row.newCostPrice !== row.costPrice;
    }

    // ---------------- Bulk apply ----------------
    applyBulk(): void {
        const selected = this.allRows.filter(r => r.selected);
        if (selected.length === 0) {
            toast.warning('Seleccione al menos una presentación');
            return;
        }
        if (this.bulkMode === 'fixed' && this.bulkValue <= 0) {
            toast.warning('Ingrese un valor mayor a 0');
            return;
        }
        if (this.bulkMode === 'percent' && this.bulkValue === 0) {
            toast.warning('Ingrese un porcentaje distinto de 0');
            return;
        }

        for (const row of selected) {
            if (this.bulkField === 'salePrice' || this.bulkField === 'both') {
                row.newSalePrice = this.calculateNewValue(row.salePrice);
            }
            if (this.bulkField === 'costPrice' || this.bulkField === 'both') {
                row.newCostPrice = this.calculateNewValue(row.costPrice);
            }
        }

        toast.success(`${selected.length} presentacione(s) actualizada(s) en memoria. Presiona "Guardar" para persistir.`);
    }

    private calculateNewValue(current: number): number {
        if (this.bulkMode === 'fixed') {
            return Math.round(this.bulkValue);
        }
        // percent
        const factor = 1 + (this.bulkValue / 100);
        return Math.max(0, Math.round(current * factor));
    }

    // ---------------- Inline reset ----------------
    resetRow(row: PresentationRow): void {
        row.newSalePrice = row.salePrice;
        row.newCostPrice = row.costPrice;
    }

    resetAllModified(): void {
        this.allRows.forEach(r => {
            r.newSalePrice = r.salePrice;
            r.newCostPrice = r.costPrice;
        });
        toast.info('Cambios descartados');
    }

    // ---------------- Save ----------------
    save(): void {
        const modified = this.allRows.filter(r => this.isRowModified(r));
        if (modified.length === 0) {
            toast.warning('No hay cambios para guardar');
            return;
        }

        toast(`¿Guardar cambios en ${modified.length} presentación(es) de ${this.countModifiedProducts(modified)} producto(s)?`, {
            action: {
                label: 'Confirmar',
                onClick: () => this.confirmSave(modified)
            },
            cancel: {
                label: 'Cancelar',
                onClick: () => { }
            }
        });
    }

    private countModifiedProducts(modified: PresentationRow[]): number {
        return new Set(modified.map(r => r.productId)).size;
    }

    private confirmSave(modified: PresentationRow[]): void {
        this.isSaving = true;

        // Construir payload: una entrada por presentación modificada.
        // Solo se envían los campos que realmente cambiaron.
        const updates: PresentationPriceUpdate[] = modified.map(row => {
            const u: PresentationPriceUpdate = {
                productId: row.productId,
                barcode: row.barcode
            };
            if (row.newSalePrice !== row.salePrice) u.salePrice = row.newSalePrice;
            if (row.newCostPrice !== row.costPrice) u.costPrice = row.newCostPrice;
            return u;
        });

        this.productService.bulkUpdatePresentationPrices({ updates }).subscribe({
            next: (response) => {
                if (response.failed === 0) {
                    toast.success(`${response.updated} presentación(es) actualizada(s) correctamente`);
                } else {
                    toast.warning(`${response.updated} actualizada(s), ${response.failed} con errores`);
                    if (response.errors?.length) {
                        response.errors.slice(0, 3).forEach(e => toast.error(`${e.barcode}: ${e.message}`));
                    }
                }
                this.isSaving = false;
                this.loadProducts();
                this.clearSelection();
            },
            error: (err) => {
                toast.error(err?.error?.message || 'Error al guardar los cambios');
                this.isSaving = false;
            }
        });
    }

    // ---------------- Helpers ----------------
    formatCurrency(value: number): string {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(value || 0);
    }

    /** Formatea un entero con separadores de miles (es-CO) para mostrar en inputs */
    formatInt(value: number | null | undefined): string {
        if (value == null || isNaN(value as number)) return '';
        return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Number(value));
    }

    /** Extrae los dígitos de un string y los devuelve como number */
    private parseInt(raw: string): number {
        const digits = (raw || '').replace(/\D/g, '');
        return digits.length === 0 ? 0 : Number(digits);
    }

    /** Handler para inputs de precio: actualiza el modelo y re-formatea el valor mostrado */
    onPriceInput(event: Event, row: PresentationRow, field: 'salePrice' | 'costPrice'): void {
        const input = event.target as HTMLInputElement;
        const parsed = this.parseInt(input.value);
        if (field === 'salePrice') {
            row.newSalePrice = parsed;
        } else {
            row.newCostPrice = parsed;
        }
        input.value = this.formatInt(parsed);
    }

    /** Handler para el input del valor masivo (solo fixed mode) */
    onBulkValueInput(event: Event): void {
        const input = event.target as HTMLInputElement;
        if (this.bulkMode === 'fixed') {
            const parsed = this.parseInt(input.value);
            this.bulkValue = parsed;
            input.value = this.formatInt(parsed);
        }
    }

    diffPercent(current: number, proposed: number): number {
        if (!current || current === 0) return 0;
        return ((proposed - current) / current) * 100;
    }

    trackByBarcode(_: number, row: PresentationRow): string {
        return row.productId + '-' + row.barcode;
    }
}
