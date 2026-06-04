import { Component, OnInit, inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, takeUntil, forkJoin } from 'rxjs';
import { toast } from 'ngx-sonner';

import { ProductoService } from '../../producto.service';
import {
    Product, Presentation, ESaleType, UnitMeasure,
    UnitMeasureLabels, SaleTypeLabels
} from '../../producto';
import {
    PackageTypeConfig, SaleMode,
    getPackageTypes, findPackageType, buildPackageLabel
} from '../../package-type.config';

export interface EditablePresentation extends Omit<Presentation, 'fixedAmount'> {
    fixedAmount?: number | null;  // extendemos para permitir null en UI
    _id: string;             // key UI para trackBy (= presentation.id si existe, o temporal)
    _dirty: boolean;         // tiene cambios sin guardar
    _isNew: boolean;         // fue añadida en esta sesión (sin id de MongoDB todavía)
    _saleMode: SaleMode;     // modo de venta derivado del embalaje
    _packSize: number | null;// tamaño/cantidad del embalaje
    _packageKey: string | null; // key del embalaje seleccionado
}

@Component({
    selector: 'app-presentation-editor-page',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './presentation-editor-page.component.html',
    styleUrl: './presentation-editor-page.component.css'
})
export class PresentationEditorPageComponent implements OnInit, OnDestroy {

    private productoService = inject(ProductoService);
    private destroy$ = new Subject<void>();
    private searchSubject = new Subject<string>();

    // ─── Estado de búsqueda ───────────────────────────────────────
    searchQuery = '';
    searchResults: Product[] = [];
    isSearching = false;
    showDropdown = false;

    // ─── Producto seleccionado ────────────────────────────────────
    selectedProduct: Product | null = null;
    presentations: EditablePresentation[] = [];
    isSaving = false;
    originalJson = '';        // snapshot para detectar cambios
    originalLookupBarcode = ''; // barcode original para el PUT — no cambia aunque el usuario edite barcodes

    // ─── Labels ──────────────────────────────────────────────────
    unitMeasureLabels = UnitMeasureLabels;
    saleTypeLabels    = SaleTypeLabels;
    unitMeasures      = Object.values(UnitMeasure);

    // ─── Embalajes ───────────────────────────────────────────────
    /** Devuelve los tipos de embalaje disponibles para el producto seleccionado */
    get availablePackageTypes(): PackageTypeConfig[] {
        if (!this.selectedProduct) return [];
        return getPackageTypes(this.selectedProduct.saleType);
    }

    /** Obtiene la config del embalaje actual de una presentación */
    getPackageConfig(pres: EditablePresentation): PackageTypeConfig | undefined {
        if (!this.selectedProduct || !pres._packageKey) return undefined;
        return findPackageType(this.selectedProduct.saleType, pres._packageKey);
    }

    /** Verifica si el embalaje BULK (granel) ya está en uso por otra presentación */
    isBulkPackageUsed(pres: EditablePresentation): boolean {
        return this.presentations.some(p =>
            p._id !== pres._id && p._saleMode === 'BULK'
        );
    }

    /** Maneja la selección de un tipo de embalaje */
    onPackageTypeChange(pres: EditablePresentation, pkg: PackageTypeConfig): void {
        // Bloquear si es BULK y ya hay otra presentación con granel
        if (pkg.saleMode === 'BULK' && this.isBulkPackageUsed(pres)) {
            toast.warning('Ya existe una presentación de tipo Granel para este producto.');
            return;
        }
        const clearSize = pkg.saleMode === 'NORMAL' || pkg.saleMode === 'BULK';
        this.updatePres(pres, {
            _packageKey:   pkg.key,
            _saleMode:     pkg.saleMode,
            packageType:   pkg.key,
            isBulk:        pkg.saleMode === 'BULK',
            isFixedAmount: pkg.saleMode === 'FIXED_FULL' || pkg.saleMode === 'FIXED_HALF',
            fixedAmount:   clearSize ? null : pres.fixedAmount,
            _packSize:     clearSize ? null : pres._packSize,
        });
    }

    // ─── Lifecycle ───────────────────────────────────────────────

    ngOnInit(): void {
        this.searchSubject.pipe(
            debounceTime(300),
            distinctUntilChanged(),
            takeUntil(this.destroy$)
        ).subscribe(q => this.doSearch(q));
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    // ─── Búsqueda ────────────────────────────────────────────────

    onSearchInput(value: string): void {
        this.searchQuery = value;
        if (value.trim().length < 2) {
            this.searchResults = [];
            this.showDropdown = false;
            return;
        }
        this.isSearching = true;
        this.searchSubject.next(value.trim());
    }

    private doSearch(q: string): void {
        this.productoService.getAllPageSearch(0, 8, q).subscribe({
            next: page => {
                this.searchResults = page.content ?? [];
                this.showDropdown = this.searchResults.length > 0;
                this.isSearching = false;
            },
            error: () => { this.isSearching = false; }
        });
    }

    selectProduct(product: Product): void {
        if (this.isDirty) {
            toast.warning('Tienes cambios sin guardar', {
                description: 'Si continúas perderás los cambios del producto actual.',
                duration: 10000,
                action:  { label: 'Cambiar igual', onClick: () => this.doSelectProduct(product) },
                cancel:  { label: 'Cancelar',      onClick: () => {} },
            });
            return;
        }
        this.doSelectProduct(product);
    }

    private doSelectProduct(product: Product): void {
        this.selectedProduct = product;
        this.searchQuery = product.description;
        this.showDropdown = false;
        this.originalLookupBarcode = product.barcode
            || product.presentations?.[0]?.barcode
            || '';
        this.buildPresentations(product.presentations ?? []);
    }

    clearProduct(): void {
        if (this.isDirty) {
            toast.warning('Tienes cambios sin guardar', {
                description: 'Se perderán los cambios si cambias de producto.',
                duration: 10000,
                action:  { label: 'Descartar y salir', onClick: () => this.doClearProduct() },
                cancel:  { label: 'Cancelar',          onClick: () => {} },
            });
            return;
        }
        this.doClearProduct();
    }

    private doClearProduct(): void {
        this.selectedProduct = null;
        this.presentations = [];
        this.searchQuery = '';
        this.originalLookupBarcode = '';
    }

    // ─── Construcción de presentaciones editables ─────────────────

    private buildPresentations(raw: Presentation[]): void {
        this.presentations = raw.map((p, i) => this.toEditable(p, i));
        this.snapshotOriginal();
    }

    private toEditable(p: Partial<Presentation>, index: number): EditablePresentation {
        const saleMode: SaleMode = p.isBulk ? 'BULK'
            : p.isFixedAmount ? 'FIXED_FULL'
            : 'NORMAL';

        // Intentar recuperar el _packageKey desde packageType guardado o inferir por saleMode
        const packageKey = p.packageType ?? this.inferPackageKey(saleMode);

        return {
            ...p,
            id:           p.id,
            barcode:      p.barcode      ?? '',
            productCode:  p.productCode  ?? this.selectedProduct?.productCode ?? '',
            label:        p.label        ?? '',
            salePrice:    p.salePrice    ?? 0,
            costPrice:    p.costPrice    ?? 0,
            unitMeasure:  p.unitMeasure  ?? this.defaultUnit(),
            isBulk:       p.isBulk       ?? false,
            isFixedAmount: p.isFixedAmount ?? false,
            fixedAmount:  p.fixedAmount  ?? null,
            packageType:  packageKey ?? undefined,
            // _id usa el UUID de MongoDB si existe, o un key temporal para nuevas
            _id:          p.id ?? `new_${index}_${Date.now()}`,
            _dirty:       false,
            _isNew:       !p.id,
            _saleMode:    saleMode,
            _packSize:    p.fixedAmount ?? null,
            _packageKey:  packageKey,
        };
    }

    private snapshotOriginal(): void {
        this.originalJson = JSON.stringify(this.presentations.map(p => this.toPayload(p)));
    }

    // ─── CRUD de presentaciones ───────────────────────────────────

    addPresentation(): void {
        // Pre-seleccionar el primer embalaje disponible para el tipo de venta
        const firstPkg = this.availablePackageTypes[0];
        const newP: EditablePresentation = {
            barcode: '',
            productCode: this.selectedProduct?.productCode ?? '',
            label: '',
            salePrice: 0,
            costPrice: 0,
            unitMeasure: this.defaultUnit(),
            isBulk: firstPkg?.saleMode === 'BULK',
            isFixedAmount: firstPkg?.saleMode === 'FIXED_FULL' || firstPkg?.saleMode === 'FIXED_HALF',
            fixedAmount: null,
            packageType: firstPkg?.key,
            _id: `new_${Date.now()}`,
            _dirty: true,
            _isNew: true,
            _saleMode: firstPkg?.saleMode ?? 'NORMAL',
            _packSize: null,
            _packageKey: firstPkg?.key ?? null,
        };
        this.presentations = [...this.presentations, newP];
    }

    removePresentation(id: string): void {
        toast.warning('¿Eliminar esta presentación?', {
            description: 'Esta acción no se puede deshacer.',
            duration: 8000,
            action: { label: 'Sí, eliminar', onClick: () => {
                this.presentations = this.presentations.filter(p => p._id !== id);
            }},
            cancel: { label: 'Cancelar', onClick: () => {} },
        });
    }

    duplicatePresentation(pres: EditablePresentation): void {
        const copy: EditablePresentation = {
            ...pres,
            barcode: '',
            label: pres.label + ' (copia)',
            _id: `dup_${Date.now()}`,
            _dirty: true,
            _isNew: true,
        };
        const idx = this.presentations.findIndex(p => p._id === pres._id);
        const updated = [...this.presentations];
        updated.splice(idx + 1, 0, copy);
        this.presentations = updated;
    }

    // ─── Cambios en campos ────────────────────────────────────────

    // ─── Helpers de actualización inmutable ──────────────────────
    // Siempre reemplaza el objeto en el array para garantizar que
    // Angular detecte el cambio con el nuevo @for de Angular 17+

    private updatePres(pres: EditablePresentation, patch: Partial<EditablePresentation>): void {
        const idx = this.presentations.findIndex(p => p._id === pres._id);
        if (idx === -1) return;
        const updated: EditablePresentation = { ...pres, ...patch, _dirty: true };
        this.autoLabelOn(updated);
        this.presentations = [
            ...this.presentations.slice(0, idx),
            updated,
            ...this.presentations.slice(idx + 1),
        ];
    }

    onFieldChange(pres: EditablePresentation): void {
        // ngModel ya actualizó pres inline — refrescamos el array para que @for lo detecte
        this.updatePres(pres, {});
    }

    onSaleModeChange(pres: EditablePresentation, mode: SaleMode): void {
        const clearFixed = mode === 'NORMAL' || mode === 'BULK';
        this.updatePres(pres, {
            _saleMode:    mode,
            isBulk:       mode === 'BULK',
            isFixedAmount: mode === 'FIXED_FULL' || mode === 'FIXED_HALF',
            fixedAmount:  clearFixed ? null : pres.fixedAmount,
            _packSize:    clearFixed ? null : pres._packSize,
        });
    }

    onPackSizeChange(pres: EditablePresentation, value: number): void {
        this.updatePres(pres, {
            _packSize:   value,
            fixedAmount: pres._saleMode === 'FIXED_HALF' ? value / 2 : value,
        });
    }

    onPriceInput(pres: EditablePresentation, field: 'salePrice' | 'costPrice', event: Event): void {
        const raw = (event.target as HTMLInputElement).value.replace(/\D/g, '');
        this.updatePres(pres, { [field]: raw ? parseInt(raw, 10) : 0 });
    }

    /**
     * Genera etiqueta automática sobre el objeto ya patcheado.
     * Si hay packageType configurado usa su plantilla; si no, fallback al comportamiento anterior.
     */
    private autoLabelOn(pres: EditablePresentation): void {
        const desc = this.selectedProduct?.description ?? '';
        const unit = UnitMeasureLabels[pres.unitMeasure] ?? pres.unitMeasure;

        // Usar plantilla del embalaje si está seleccionado
        if (pres._packageKey && this.selectedProduct) {
            const cfg = findPackageType(this.selectedProduct.saleType, pres._packageKey);
            if (cfg) {
                // Para FIXED_HALF el tamaño mostrado es la mitad
                const displaySize = cfg.saleMode === 'FIXED_HALF' && pres._packSize
                    ? pres._packSize / 2 : pres._packSize;
                const label = buildPackageLabel(cfg.labelTemplate, desc, displaySize, unit);
                if (label) { pres.label = label; }
                return;
            }
        }

        // Fallback para presentaciones sin packageType (productos migrados)
        switch (pres._saleMode) {
            case 'BULK':
                pres.label = `${desc} - GRANEL ${unit}`.trim(); break;
            case 'FIXED_FULL':
                if (pres._packSize) pres.label = `${desc} - BULTO ${pres._packSize} ${unit}`.trim(); break;
            case 'FIXED_HALF':
                if (pres._packSize) pres.label = `${desc} - MEDIO BULTO ${pres._packSize / 2} ${unit}`.trim(); break;
        }
    }

    /** Infiere el packageKey más probable según el saleMode para presentaciones sin packageType */
    private inferPackageKey(saleMode: SaleMode): string | null {
        if (!this.selectedProduct) return null;
        const types = getPackageTypes(this.selectedProduct.saleType);
        const match = types.find(t => t.saleMode === saleMode);
        return match?.key ?? null;
    }

    // ─── Guardar ──────────────────────────────────────────────────

    get isDirty(): boolean {
        return this.presentations.some(p => p._dirty);
    }

    get dirtyCount(): number {
        return this.presentations.filter(p => p._dirty).length;
    }

    discard(): void {
        toast.warning('¿Descartar todos los cambios?', {
            description: 'Las presentaciones volverán al estado guardado.',
            duration: 8000,
            action: { label: 'Sí, descartar', onClick: () => {
                if (this.selectedProduct) this.buildPresentations(this.selectedProduct.presentations ?? []);
            }},
            cancel: { label: 'Cancelar', onClick: () => {} },
        });
    }

    save(): void {
        // Validación básica
        const invalid = this.presentations.find(p =>
            !p.barcode?.trim() || !p.label?.trim() || p.salePrice == null
        );
        if (invalid) {
            toast.warning('Hay presentaciones incompletas. Revisa barcode, etiqueta y precio de venta.');
            return;
        }

        // Verificar barcodes únicos
        const barcodes = this.presentations.map(p => p.barcode.trim());
        if (new Set(barcodes).size !== barcodes.length) {
            toast.warning('Hay barcodes duplicados. Cada presentación debe tener un barcode único.');
            return;
        }

        this.isSaving = true;

        // Separar presentaciones modificadas con ID (usar PATCH individual)
        // de las nuevas o eliminadas (usar PUT completo del producto)
        const dirtyWithId   = this.presentations.filter(p => p._dirty && p.id && !p._isNew);
        const hasStructural = this.presentations.some(p => p._isNew)
                           || this.hasDeletedPresentations();

        if (dirtyWithId.length > 0 && !hasStructural) {
            // Solo cambios en presentaciones existentes → PATCH por ID
            this.savePatchOnly(dirtyWithId);
        } else {
            // Hay nuevas o eliminadas → PUT completo (también actualiza las modificadas)
            this.saveFullUpdate();
        }
    }

    /** ¿Se eliminó alguna presentación respecto al estado original? */
    private hasDeletedPresentations(): boolean {
        const currentIds = new Set(this.presentations.map(p => p.id).filter(Boolean));
        return (this.selectedProduct?.presentations ?? [])
            .some(p => p.id && !currentIds.has(p.id));
    }

    /** PATCH individual por UUID — solo para presentaciones existentes modificadas */
    private savePatchOnly(dirty: EditablePresentation[]): void {
        const productId = this.selectedProduct!.id;
        const calls = dirty.map(p =>
            this.productoService.updatePresentation(productId, p.id!, this.toPayload(p))
        );

        forkJoin(calls).subscribe({
            next: (results) => {
                const saved = results[results.length - 1]; // último retorna el producto actualizado
                this.selectedProduct = saved;
                this.buildPresentations(saved.presentations ?? []);
                toast.success('Presentaciones guardadas correctamente');
                this.isSaving = false;
            },
            error: (err) => {
                toast.error('Error al guardar: ' + (err.error?.message || 'Intente nuevamente'));
                this.isSaving = false;
            }
        });
    }

    /** PUT completo — cuando hay nuevas presentaciones o eliminadas */
    private saveFullUpdate(): void {
        const updated: Product = {
            ...this.selectedProduct!,
            presentations: this.presentations.map(p => this.toPayload(p))
        };
        this.productoService.update(updated, this.originalLookupBarcode).subscribe({
            next: (saved) => {
                this.selectedProduct = saved;
                this.buildPresentations(saved.presentations ?? []);
                toast.success('Presentaciones guardadas correctamente');
                this.isSaving = false;
            },
            error: (err) => {
                toast.error('Error al guardar: ' + (err.error?.message || 'Intente nuevamente'));
                this.isSaving = false;
            }
        });
    }

    private toPayload(p: EditablePresentation): Presentation {
        return {
            id:            p.id,
            barcode:       p.barcode,
            productCode:   p.productCode,
            label:         p.label,
            salePrice:     p.salePrice,
            costPrice:     p.costPrice,
            unitMeasure:   p.unitMeasure,
            isBulk:        p.isBulk,
            isFixedAmount: p.isFixedAmount,
            fixedAmount:   p.fixedAmount ?? undefined,
            packageType:   p._packageKey ?? p.packageType,  // siempre guardar el embalaje
        };
    }

    // ─── Helpers de UI ───────────────────────────────────────────

    private defaultUnit(): UnitMeasure {
        if (!this.selectedProduct) return UnitMeasure.UNIDAD;
        switch (this.selectedProduct.saleType) {
            case ESaleType.WEIGHT:    return UnitMeasure.KILOGRAMOS;
            case ESaleType.UNIT:      return UnitMeasure.UNIDAD;
            case ESaleType.LONGITUDE: return UnitMeasure.CENTIMETROS;
            case ESaleType.VOLUME:    return UnitMeasure.MILILITROS;
            default:                  return UnitMeasure.UNIDAD;
        }
    }

    allowedUnits(pres: EditablePresentation): UnitMeasure[] {
        if (!this.selectedProduct) return this.unitMeasures;
        switch (this.selectedProduct.saleType) {
            case ESaleType.WEIGHT:    return [UnitMeasure.KILOGRAMOS];
            case ESaleType.UNIT:      return [UnitMeasure.UNIDAD];
            case ESaleType.LONGITUDE: return [UnitMeasure.CENTIMETROS, UnitMeasure.METROS];
            case ESaleType.VOLUME:    return [UnitMeasure.MILILITROS, UnitMeasure.LITROS];
            default:                  return this.unitMeasures;
        }
    }

    showModeSelector(): boolean {
        if (!this.selectedProduct) return false;
        return [ESaleType.WEIGHT, ESaleType.VOLUME, ESaleType.LONGITUDE].includes(
            this.selectedProduct.saleType as ESaleType
        );
    }

    usedModes(): Set<SaleMode> {
        const s = new Set<SaleMode>();
        this.presentations.forEach(p => { if (p._saleMode !== 'NORMAL') s.add(p._saleMode); });
        return s;
    }

    isModeAvailable(mode: SaleMode, pres: EditablePresentation): boolean {
        if (mode === 'NORMAL') return true;
        const used = this.usedModes();
        return !used.has(mode) || pres._saleMode === mode;
    }

    modeBadgeClass(mode: SaleMode): string {
        const map: Record<SaleMode, string> = {
            NORMAL: 'badge-normal',
            BULK: 'badge-bulk',
            FIXED_FULL: 'badge-full',
            FIXED_HALF: 'badge-half',
        };
        return map[mode] ?? '';
    }

    modeLabel(mode: SaleMode): string {
        const map: Record<SaleMode, string> = {
            NORMAL: 'Unidad',
            BULK: 'Granel',
            FIXED_FULL: 'Bulto',
            FIXED_HALF: 'Medio Bulto',
        };
        return map[mode] ?? mode;
    }

    formatCurrency(v: number | null | undefined): string {
        if (v == null) return '$0';
        return new Intl.NumberFormat('es-CO', {
            style: 'currency', currency: 'COP', minimumFractionDigits: 0
        }).format(Number(v));
    }

    formatPriceInput(v: number | null | undefined): string {
        if (!v) return '';
        return new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0 }).format(Number(v));
    }

    trackById(_: number, p: EditablePresentation): string { return p._id; }
}
