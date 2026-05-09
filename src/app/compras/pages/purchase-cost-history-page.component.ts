import { Component, ElementRef, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ProductoService } from '../../producto/producto.service';
import { PurchasesService } from '../services/purchases.service';
import { CostHistoryEntry } from '../models/purchase-cost-history';
import { Product, Presentation } from '../../producto/producto';
import { toast } from 'ngx-sonner';

interface PresentationOption {
  barcode: string;
  label: string;
  productDescription: string;
  productId: string;
}

@Component({
  selector: 'app-purchase-cost-history-page',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './purchase-cost-history-page.component.html'
})
export class PurchaseCostHistoryPageComponent implements OnInit {
  private productService = inject(ProductoService);
  private purchasesService = inject(PurchasesService);
  private fb = inject(FormBuilder);

  filterForm: FormGroup = this.fb.group({
    presentationId: [''],
    fromDate: [''],
    toDate: ['']
  });

  presentationOptions: PresentationOption[] = [];
  historyEntries: CostHistoryEntry[] = [];
  isLoading = false;
  selectedLabel = '';

  presentationSearchText = '';
  presentationSuggestions: PresentationOption[] = [];
  showPresentationDropdown = false;
  selectedPresentation: PresentationOption | null = null;
  presentationActiveIndex = -1;
  @ViewChild('presentationDropdownEl') presentationDropdownEl?: ElementRef;

  ngOnInit(): void {
    this.loadPresentationOptions();
  }

  private loadPresentationOptions(): void {
    this.productService.getAll().subscribe({
      next: (products) => {
        const opts: PresentationOption[] = [];
        products.forEach(p => {
          (p.presentations || []).forEach(pres => {
            if (pres.barcode) {
              opts.push({
                barcode: pres.barcode,
                label: pres.label || pres.barcode,
                productDescription: p.description || '',
                productId: p.id
              });
            }
          });
        });
        this.presentationOptions = opts.sort((a, b) =>
          a.productDescription.localeCompare(b.productDescription)
        );
      },
      error: () => toast.error('Error al cargar productos')
    });
  }

  searchHistory(): void {
    const barcode = this.filterForm.value.presentationId;
    if (!barcode) {
      toast.warning('Seleccione una presentación');
      return;
    }
    this.selectedLabel = this.presentationOptions.find(o => o.barcode === barcode)?.productDescription || '';
    this.isLoading = true;
    this.purchasesService.getCostHistory(barcode, {
      fromDate: this.filterForm.value.fromDate || undefined,
      toDate: this.filterForm.value.toDate || undefined
    }).subscribe({
      next: (entries) => {
        this.historyEntries = entries.sort((a, b) =>
          new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime()
        );
        this.isLoading = false;
      },
      error: () => {
        toast.error('Error al consultar historial de costos');
        this.isLoading = false;
      }
    });
  }

  onPresentationSearchInput(): void {
    const q = this.presentationSearchText.trim().toLowerCase();
    this.presentationActiveIndex = -1;
    if (!q) { this.presentationSuggestions = []; this.showPresentationDropdown = false; return; }
    this.presentationSuggestions = this.presentationOptions.filter(o =>
      (o.productDescription || '').toLowerCase().includes(q) ||
      (o.label || '').toLowerCase().includes(q) ||
      (o.barcode || '').toLowerCase().includes(q)
    ).slice(0, 10);
    this.showPresentationDropdown = true;
  }

  selectPresentationFromAutocomplete(opt: PresentationOption): void {
    this.selectedPresentation = opt;
    this.presentationSearchText = `${opt.productDescription} — ${opt.label}`;
    this.filterForm.patchValue({ presentationId: opt.barcode });
    this.showPresentationDropdown = false;
  }

  clearPresentationSelection(): void {
    this.selectedPresentation = null;
    this.presentationSearchText = '';
    this.filterForm.patchValue({ presentationId: '' });
    this.presentationSuggestions = [];
  }

  onPresentationKeydown(event: KeyboardEvent): void {
    if (!this.showPresentationDropdown) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.presentationActiveIndex = Math.min(this.presentationActiveIndex + 1, this.presentationSuggestions.length - 1);
      this.scrollDropdownItem(this.presentationDropdownEl, this.presentationActiveIndex);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.presentationActiveIndex = Math.max(this.presentationActiveIndex - 1, -1);
      this.scrollDropdownItem(this.presentationDropdownEl, this.presentationActiveIndex);
    } else if (event.key === 'Enter' && this.presentationActiveIndex >= 0) {
      event.preventDefault();
      this.selectPresentationFromAutocomplete(this.presentationSuggestions[this.presentationActiveIndex]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.showPresentationDropdown = false;
      this.presentationActiveIndex = -1;
    }
  }

  private scrollDropdownItem(ref: ElementRef | undefined, index: number): void {
    if (!ref || index < 0) return;
    const item = ref.nativeElement.children[index] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }

  hidePresentationDropdownDelayed(): void {
    setTimeout(() => { this.showPresentationDropdown = false; this.presentationActiveIndex = -1; }, 200);
  }

  clearFilters(): void {
    this.filterForm.reset({ presentationId: '', fromDate: '', toDate: '' });
    this.clearPresentationSelection();
    this.historyEntries = [];
    this.selectedLabel = '';
  }

  /**
   * Costo unitario total = unitCost + IVA/u + flete/u
   */
  getUnitTotalCost(entry: CostHistoryEntry): number {
    const qty = entry.quantity || 1;
    const vatPerUnit = qty > 0 ? (entry.vatAmount || 0) / qty : 0;
    const freightPerUnit = qty > 0 ? (entry.freightAmount || 0) / qty : 0;
    return (entry.unitCost || 0) + vatPerUnit + freightPerUnit;
  }

  /**
   * Devuelve la tendencia de un entry respecto al anterior (más reciente antes que este).
   * El array está ordenado de más reciente a más antiguo, así que el "anterior" es index+1.
   */
  getTrend(entry: CostHistoryEntry, index: number): 'up' | 'down' | 'same' | 'none' {
    if (index >= this.historyEntries.length - 1) return 'none';
    const prev = this.historyEntries[index + 1];
    const curr = this.getUnitTotalCost(entry);
    const prevCost = this.getUnitTotalCost(prev);
    if (Math.abs(curr - prevCost) < 0.01) return 'same';
    return curr > prevCost ? 'up' : 'down';
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency', currency: 'COP',
      minimumFractionDigits: 0, maximumFractionDigits: 0
    }).format(value);
  }

  formatNumber(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    }).format(value);
  }

  /** Sparkline: valor relativo al costo máximo del historial (0-100%) */
  getRelativeWidth(entry: CostHistoryEntry): string {
    const maxCost = Math.max(...this.historyEntries.map(e => this.getUnitTotalCost(e)));
    if (maxCost <= 0) return '0%';
    const cost = this.getUnitTotalCost(entry);
    return `${(cost / maxCost) * 100}%`;
  }
}
