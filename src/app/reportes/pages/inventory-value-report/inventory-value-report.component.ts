import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  OnDestroy,
} from '@angular/core';
import { CommonModule, DecimalPipe, LowerCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import {
  CostUpdateItem,
  InventoryCountService,
  InventoryUncountedRow,
  InventoryValueReportData,
  InventoryValueRow,
} from '../../../inventario/services/inventory-count.service';
import { toast } from 'ngx-sonner';

type ActiveTab = 'counted' | 'no-cost' | 'no-cost-zero' | 'uncounted' | 'null-barcode';

interface RowVM extends InventoryValueRow {
  grossProfitPct: number;
  grossProfitMoney: number;
}

@Component({
  selector: 'app-inventory-value-report',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterModule, DecimalPipe, LowerCasePipe],
  templateUrl: './inventory-value-report.component.html',
  styleUrls: ['./inventory-value-report.component.css'],
})
export class InventoryValueReportComponent implements OnDestroy {
  private countService = inject(InventoryCountService);
  private cdr = inject(ChangeDetectorRef);

  fromDate = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  })();
  toDate = new Date().toISOString().slice(0, 10);

  isLoading = false;
  isGeneratingPdf = false;
  isSavingCosts = false;

  data: InventoryValueReportData | null = null;
  activeTab: ActiveTab = 'counted';

  countedSearch = '';
  noCostSearch = '';
  uncountedSearch = '';

  editedCosts: Record<string, number> = {};

  isDeletingNullBarcode = false;

  // Pre-calculated view models
  private _allCounted: RowVM[] = [];
  private _allNoCost: RowVM[] = [];
  private _allNoCostZero: RowVM[] = [];
  private _allUncounted: InventoryUncountedRow[] = [];
  private _allNullBarcode: RowVM[] = [];

  // Filtered results (only rebuilt on search change)
  _filteredCounted: RowVM[] = [];
  _filteredNoCost: RowVM[] = [];
  _filteredNoCostZero: RowVM[] = [];
  _filteredUncounted: InventoryUncountedRow[] = [];
  _filteredNullBarcode: RowVM[] = [];

  // Pagination
  pageSize = 50;
  readonly pageSizeOptions = [10, 20, 50, 100];
  countedPage = 0;
  noCostPage = 0;
  noCostZeroPage = 0;
  uncountedPage = 0;
  nullBarcodePage = 0;

  get pagedCounted(): RowVM[] {
    const s = this.countedPage * this.pageSize;
    return this._filteredCounted.slice(s, s + this.pageSize);
  }
  get countedTotalPages(): number {
    return Math.max(1, Math.ceil(this._filteredCounted.length / this.pageSize));
  }
  get countedPages(): number[] {
    return this.buildPageRange(this.countedPage, this.countedTotalPages);
  }

  get pagedNoCost(): RowVM[] {
    const s = this.noCostPage * this.pageSize;
    return this._filteredNoCost.slice(s, s + this.pageSize);
  }
  get noCostTotalPages(): number {
    return Math.max(1, Math.ceil(this._filteredNoCost.length / this.pageSize));
  }
  get noCostPages(): number[] {
    return this.buildPageRange(this.noCostPage, this.noCostTotalPages);
  }

  get pagedNoCostZero(): RowVM[] {
    const s = this.noCostZeroPage * this.pageSize;
    return this._filteredNoCostZero.slice(s, s + this.pageSize);
  }
  get noCostZeroTotalPages(): number {
    return Math.max(1, Math.ceil(this._filteredNoCostZero.length / this.pageSize));
  }
  get noCostZeroPages(): number[] {
    return this.buildPageRange(this.noCostZeroPage, this.noCostZeroTotalPages);
  }

  get pagedUncounted(): InventoryUncountedRow[] {
    const s = this.uncountedPage * this.pageSize;
    return this._filteredUncounted.slice(s, s + this.pageSize);
  }
  get uncountedTotalPages(): number {
    return Math.max(1, Math.ceil(this._filteredUncounted.length / this.pageSize));
  }
  get uncountedPages(): number[] {
    return this.buildPageRange(this.uncountedPage, this.uncountedTotalPages);
  }

  get pagedNullBarcode(): RowVM[] {
    const s = this.nullBarcodePage * this.pageSize;
    return this._filteredNullBarcode.slice(s, s + this.pageSize);
  }
  get nullBarcodeTotalPages(): number {
    return Math.max(1, Math.ceil(this._filteredNullBarcode.length / this.pageSize));
  }
  get nullBarcodePages(): number[] {
    return this.buildPageRange(this.nullBarcodePage, this.nullBarcodeTotalPages);
  }

  get pendingCostUpdates(): number {
    return this._allNoCost.filter(r => (this.editedCosts[r.barcode] ?? 0) > 0).length;
  }

  // Debounce timers
  private _countedTimer: ReturnType<typeof setTimeout> | null = null;
  private _noCostTimer: ReturnType<typeof setTimeout> | null = null;
  private _uncountedTimer: ReturnType<typeof setTimeout> | null = null;
  private _nullBarcodeTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnDestroy(): void {
    if (this._countedTimer) clearTimeout(this._countedTimer);
    if (this._noCostTimer) clearTimeout(this._noCostTimer);
    if (this._uncountedTimer) clearTimeout(this._uncountedTimer);
    if (this._nullBarcodeTimer) clearTimeout(this._nullBarcodeTimer);
  }

  onCountedSearch(value: string): void {
    this.countedSearch = value;
    if (this._countedTimer) clearTimeout(this._countedTimer);
    this._countedTimer = setTimeout(() => {
      this.countedPage = 0;
      this._filteredCounted = this.filterRows(this._allCounted, value);
      this.cdr.markForCheck();
    }, 300);
  }

  onNoCostSearch(value: string): void {
    this.noCostSearch = value;
    if (this._noCostTimer) clearTimeout(this._noCostTimer);
    this._noCostTimer = setTimeout(() => {
      this.noCostPage = 0;
      this._filteredNoCost = this.filterRows(this._allNoCost, value);
      this.cdr.markForCheck();
    }, 300);
  }

  onUncountedSearch(value: string): void {
    this.uncountedSearch = value;
    if (this._uncountedTimer) clearTimeout(this._uncountedTimer);
    this._uncountedTimer = setTimeout(() => {
      this.uncountedPage = 0;
      this._filteredUncounted = this.filterUncounted(this._allUncounted, value);
      this.cdr.markForCheck();
    }, 300);
  }

  nullBarcodeSearch = '';

  onNullBarcodeSearch(value: string): void {
    this.nullBarcodeSearch = value;
    if (this._nullBarcodeTimer) clearTimeout(this._nullBarcodeTimer);
    this._nullBarcodeTimer = setTimeout(() => {
      this.nullBarcodePage = 0;
      this._filteredNullBarcode = this.filterRows(this._allNullBarcode, value);
      this.cdr.markForCheck();
    }, 300);
  }

  noCostZeroSearch = '';

  onNoCostZeroSearch(value: string): void {
    this.noCostZeroSearch = value;
    setTimeout(() => {
      this.noCostZeroPage = 0;
      this._filteredNoCostZero = this.filterRows(this._allNoCostZero, value);
      this.cdr.markForCheck();
    }, 300);
  }

  onPageSizeChange(): void {
    this.countedPage = 0;
    this.noCostPage = 0;
    this.noCostZeroPage = 0;
    this.uncountedPage = 0;
    this.nullBarcodePage = 0;
    this.cdr.markForCheck();
  }

  goToPage(tab: ActiveTab, page: number): void {
    const total =
      tab === 'counted'        ? this.countedTotalPages
      : tab === 'no-cost'      ? this.noCostTotalPages
      : tab === 'no-cost-zero' ? this.noCostZeroTotalPages
      : tab === 'null-barcode' ? this.nullBarcodeTotalPages
      : this.uncountedTotalPages;
    if (page < 0 || page >= total) return;
    if (tab === 'counted') this.countedPage = page;
    else if (tab === 'no-cost') this.noCostPage = page;
    else if (tab === 'no-cost-zero') this.noCostZeroPage = page;
    else if (tab === 'null-barcode') this.nullBarcodePage = page;
    else this.uncountedPage = page;
    this.cdr.markForCheck();
  }

  deleteNullBarcodeRow(row: RowVM): void {
    if (!confirm(`¿Eliminar la presentación sin código de "${row.description}" y su conteo físico de la base de datos?`)) return;
    this.isDeletingNullBarcode = true;
    this.cdr.markForCheck();
    this.countService.deleteNullBarcodeRow(row.productId, row.physicalInventoryId).subscribe({
      next: () => {
        this._allNullBarcode = this._allNullBarcode.filter(r => r.physicalInventoryId !== row.physicalInventoryId);
        this._filteredNullBarcode = this._filteredNullBarcode.filter(r => r.physicalInventoryId !== row.physicalInventoryId);
        this.isDeletingNullBarcode = false;
        toast.success(`Presentación de "${row.description}" eliminada.`);
        this.cdr.markForCheck();
      },
      error: () => {
        toast.error('Error al eliminar. Intente de nuevo.');
        this.isDeletingNullBarcode = false;
        this.cdr.markForCheck();
      },
    });
  }

  setTab(tab: ActiveTab): void {
    this.activeTab = tab;
    this.cdr.markForCheck();
  }

  hasCostWarning(r: RowVM): boolean {
    const cost = this.editedCosts[r.barcode] ?? 0;
    const sp = r.salePrice ?? 0;
    return cost > 0 && sp > 0 && cost > sp;
  }

  /** Gross profit % for the "sin costo" tab while the user is editing */
  grossProfitPctDynamic(salePrice: number, cost: number): number {
    const sp = salePrice ?? 0;
    const c = cost ?? 0;
    if (sp <= 0) return 0;
    return ((sp - c) / sp) * 100;
  }

  grossProfitMoneyDynamic(salePrice: number, cost: number): number {
    const sp = salePrice ?? 0;
    const c = cost ?? 0;
    return sp - c;
  }

  formatCost(value: number | undefined): string {
    if (!value) return '';
    return Math.round(value).toLocaleString('es-CO');
  }

  onCostInput(barcode: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '');
    const num = digits ? parseInt(digits, 10) : 0;
    this.editedCosts[barcode] = num;
    const cursor = input.selectionStart ?? 0;
    const prevLen = input.value.length;
    input.value = num > 0 ? num.toLocaleString('es-CO') : '';
    const diff = input.value.length - prevLen;
    input.setSelectionRange(Math.max(0, cursor + diff), Math.max(0, cursor + diff));
  }

  search(): void {
    if (!this.fromDate || !this.toDate) {
      toast.error('Seleccione el rango de fechas.');
      return;
    }
    if (this.fromDate > this.toDate) {
      toast.error('La fecha "Desde" debe ser anterior a "Hasta".');
      return;
    }
    this.isLoading = true;
    this.data = null;
    this.editedCosts = {};
    this.activeTab = 'counted';
    this.countedPage = 0;
    this.noCostPage = 0;
    this.noCostZeroPage = 0;
    this.uncountedPage = 0;
    this.nullBarcodePage = 0;
    this.countedSearch = '';
    this.noCostSearch = '';
    this.noCostZeroSearch = '';
    this.uncountedSearch = '';
    this.nullBarcodeSearch = '';
    this.cdr.markForCheck();

    this.countService
      .getValueReportData(this.fromDate + 'T00:00:00', this.toDate + 'T23:59:59')
      .subscribe({
        next: (d) => {
          this.data = d;
          this._allCounted = d.rows.map(r => this.toViewModel(r));
          this._allNoCost = d.noCostRows.map(r => this.toViewModel(r));
          this._allNoCostZero = (d.noCostZeroRows ?? []).map(r => this.toViewModel(r));
          this._allUncounted = d.uncountedProducts;
          this._allNullBarcode = (d.nullBarcodeRows ?? []).map(r => this.toViewModel(r));
          this._filteredCounted = [...this._allCounted];
          this._filteredNoCost = [...this._allNoCost];
          this._filteredNoCostZero = [...this._allNoCostZero];
          this._filteredUncounted = [...this._allUncounted];
          this._filteredNullBarcode = [...this._allNullBarcode];
          this.isLoading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          toast.error('Error al cargar los datos.');
          this.isLoading = false;
          this.cdr.markForCheck();
        },
      });
  }

  saveCosts(): void {
    if (!this.data) return;
    const updates: CostUpdateItem[] = this._allNoCost
      .filter(r => (this.editedCosts[r.barcode] ?? 0) > 0)
      .map(r => ({
        productId: r.productId,
        barcode: r.barcode,
        costPrice: this.editedCosts[r.barcode],
      }));

    if (updates.length === 0) {
      toast.error('Ingrese el costo de al menos una presentación.');
      return;
    }

    this.isSavingCosts = true;
    this.cdr.markForCheck();
    this.countService.bulkUpdatePresentationCosts(updates).subscribe({
      next: () => {
        toast.success(`${updates.length} presentación(es) actualizadas con éxito.`);
        this.isSavingCosts = false;
        this.search();
      },
      error: () => {
        toast.error('Error al guardar los costos.');
        this.isSavingCosts = false;
        this.cdr.markForCheck();
      },
    });
  }

  downloadPdf(): void {
    if (!this.fromDate || !this.toDate) return;
    this.isGeneratingPdf = true;
    this.cdr.markForCheck();
    this.countService
      .generateValuePdf(this.fromDate + 'T00:00:00', this.toDate + 'T23:59:59')
      .subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `inventario-valor-${this.fromDate}-${this.toDate}.pdf`;
          a.click();
          URL.revokeObjectURL(url);
          this.isGeneratingPdf = false;
          this.cdr.markForCheck();
        },
        error: () => {
          toast.error('Error al generar el PDF.');
          this.isGeneratingPdf = false;
          this.cdr.markForCheck();
        },
      });
  }

  private toViewModel(row: InventoryValueRow): RowVM {
    // null-guard: backend puede enviar null en BigDecimal si no tiene valor
    const sp = (row.salePrice as any) ?? 0;
    const uc = (row.unitCost as any) ?? 0;
    const pct = sp > 0 ? ((sp - uc) / sp) * 100 : 0;
    return {
      ...row,
      salePrice: sp,
      unitCost: uc,
      totalValue: (row.totalValue as any) ?? 0,
      physicalStock: (row.physicalStock as any) ?? 0,
      grossProfitPct: pct,
      grossProfitMoney: sp - uc,
    };
  }

  private filterRows(rows: RowVM[], q: string): RowVM[] {
    if (!q) return rows;
    const lower = q.toLowerCase();
    return rows.filter(
      r =>
        (r.description ?? '').toLowerCase().includes(lower) ||
        (r.presentationLabel ?? '').toLowerCase().includes(lower) ||
        (r.barcode ?? '').toLowerCase().includes(lower)
    );
  }

  private filterUncounted(rows: InventoryUncountedRow[], q: string): InventoryUncountedRow[] {
    if (!q) return rows;
    const lower = q.toLowerCase();
    return rows.filter(
      r =>
        (r.description ?? '').toLowerCase().includes(lower) ||
        (r.barcode ?? '').toLowerCase().includes(lower) ||
        (r.label ?? '').toLowerCase().includes(lower)
    );
  }

  private buildPageRange(current: number, total: number): number[] {
    const delta = 2;
    const range: number[] = [];
    for (let i = Math.max(0, current - delta); i <= Math.min(total - 1, current + delta); i++) {
      range.push(i);
    }
    return range;
  }
}
