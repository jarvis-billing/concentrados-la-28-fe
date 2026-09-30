import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ProductoService } from '../../../producto/producto.service';
import { Product, Presentation, UnitMeasure } from '../../../producto/producto';
import JsBarcode from 'jsbarcode';
import { toast } from 'ngx-sonner';
import { LabelConfig, LABEL_PRESETS } from '../../models/label-config';
import { LabelConfigService } from '../../services/label-config.service';

const UNIT_ABBREVIATIONS: Record<string, string> = {
  [UnitMeasure.KILOGRAMOS]: 'Kg',
  [UnitMeasure.METROS]: 'Metro',
  [UnitMeasure.CENTIMETROS]: 'Cm',
  [UnitMeasure.LITROS]: 'Lt',
  [UnitMeasure.MILILITROS]: 'CC',
  [UnitMeasure.UNIDAD]: 'Und',
};

/** Un item del carrito listo para imprimir */
interface CartItem {
  barcode: string;
  productDescription: string;
  presentationLabel: string;
  salePrice: number | string;
  companyName: string;
  brand: string;
  quantity: number;
  previewDataUrl?: string; // PNG data-URL para el preview inline
}

/** Item plano de una presentación (para la lista de búsqueda) */
interface PresentationRow {
  barcode: string;
  productDescription: string;
  presentationLabel: string;
  salePrice: number | string;
  brand: string;
  category: string;
}

/** Escala de renderizado: píxeles por milímetro (≈ 200 DPI) */
const PX_PER_MM = 8;

@Component({
  selector: 'app-mobile-labels-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './mobile-labels-page.component.html',
  styleUrls: ['./mobile-labels-page.component.css'],
})
export class MobileLabelsPageComponent implements OnInit {
  private productService = inject(ProductoService);
  private labelConfigService = inject(LabelConfigService);
  private cdr = inject(ChangeDetectorRef);

  isLoading = true;
  isSharing = false;
  showCart = false;
  searchTerm = '';

  labelConfig: LabelConfig = {} as LabelConfig;
  presets = LABEL_PRESETS;
  selectedPresetIndex = 0;

  allRows: PresentationRow[] = [];
  filteredRows: PresentationRow[] = [];

  /** Carrito: barcode → CartItem */
  cart: Map<string, CartItem> = new Map();

  get cartList(): CartItem[] {
    return Array.from(this.cart.values());
  }

  get totalLabels(): number {
    return this.cartList.reduce((s, i) => s + i.quantity, 0);
  }

  get canWebShare(): boolean {
    return typeof (navigator as any).share === 'function';
  }

  ngOnInit(): void {
    this.labelConfig = this.labelConfigService.getConfig();
    this.selectedPresetIndex = this.presets.findIndex(
      (p) => p.presetName === this.labelConfig.presetName
    );
    if (this.selectedPresetIndex < 0) this.selectedPresetIndex = 0;
    this.loadProducts();
  }

  selectPreset(index: number): void {
    this.selectedPresetIndex = index;
    this.labelConfig = { ...this.presets[index] };
    this.labelConfigService.saveConfig(this.labelConfig);
    // Regenerar previews del carrito con la nueva config
    this.regenerateCartPreviews();
    this.cdr.markForCheck();
  }

  onSearchInput(value: string): void {
    this.searchTerm = value;
    this.applyFilter();
    this.cdr.markForCheck();
  }

  inCart(barcode: string): boolean {
    return this.cart.has(barcode);
  }

  getQuantity(barcode: string): number {
    return this.cart.get(barcode)?.quantity ?? 0;
  }

  addOne(row: PresentationRow): void {
    if (this.cart.has(row.barcode)) {
      const item = this.cart.get(row.barcode)!;
      item.quantity++;
    } else {
      const newItem: CartItem = {
        barcode: row.barcode,
        productDescription: row.productDescription,
        presentationLabel: row.presentationLabel,
        salePrice: row.salePrice,
        companyName: this.labelConfig.companyName,
        brand: row.brand,
        quantity: 1,
      };
      newItem.previewDataUrl = this.renderLabelToDataUrl(newItem);
      this.cart.set(row.barcode, newItem);
    }
    this.cdr.markForCheck();
  }

  removeOne(barcode: string): void {
    const item = this.cart.get(barcode);
    if (!item) return;
    if (item.quantity > 1) {
      item.quantity--;
    } else {
      this.cart.delete(barcode);
    }
    this.cdr.markForCheck();
  }

  removeFromCart(barcode: string): void {
    this.cart.delete(barcode);
    this.cdr.markForCheck();
  }

  toggleField(field: keyof Pick<LabelConfig,
    'showCompanyName' | 'showBarcode' | 'showBarcodeNumber' |
    'showDescription' | 'showBrand' | 'showPrice'>): void {
    (this.labelConfig as any)[field] = !(this.labelConfig as any)[field];
    this.labelConfigService.saveConfig(this.labelConfig);
    this.regenerateCartPreviews();
    this.cdr.markForCheck();
  }

  toggleCart(): void {
    this.showCart = !this.showCart;
    this.cdr.markForCheck();
  }

  clearCart(): void {
    this.cart.clear();
    this.showCart = false;
    this.cdr.markForCheck();
  }

  async shareLabels(): Promise<void> {
    if (this.cart.size === 0) {
      toast.error('Agrega al menos una etiqueta al carrito.');
      return;
    }

    this.isSharing = true;
    this.cdr.markForCheck();

    try {
      // Generar un PNG por cada copia de cada etiqueta
      const files: File[] = [];
      let fileIndex = 0;
      for (const item of this.cartList) {
        const canvas = this.renderLabelToCanvas(item);
        const blob = await this.canvasToBlob(canvas);
        for (let c = 0; c < item.quantity; c++) {
          files.push(
            new File([blob], `etiqueta-${fileIndex++}.png`, { type: 'image/png' })
          );
        }
      }

      if (
        this.canWebShare &&
        (navigator as any).canShare({ files })
      ) {
        await (navigator as any).share({
          files,
          title: 'Etiquetas Concentrados La 28',
        });
        toast.success('Etiquetas compartidas con la app de impresión.');
      } else {
        // Fallback: generar imagen combinada y descargar
        this.downloadCombined(files, this.cartList);
        toast.success('Imagen descargada. Ábrela en la app de impresión.');
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        toast.error('Error al compartir las etiquetas.');
        console.error(err);
      }
    } finally {
      this.isSharing = false;
      this.cdr.markForCheck();
    }
  }

  // ── Internos ─────────────────────────────────────────────────────────────────

  private loadProducts(): void {
    this.productService.getAll().subscribe({
      next: (products) => {
        this.allRows = [];
        const sorted = [...products].sort((a, b) =>
          (a.description ?? '').localeCompare(b.description ?? '')
        );
        for (const product of sorted) {
          for (const pres of product.presentations ?? []) {
            if (!pres.barcode) continue;
            const unitAbbr = UNIT_ABBREVIATIONS[pres.unitMeasure] || pres.unitMeasure || '';
            const salePrice = pres.isBulk
              ? `${pres.salePrice ?? 0} ${unitAbbr}`
              : pres.salePrice ?? 0;
            this.allRows.push({
              barcode: pres.barcode,
              productDescription: product.description ?? '',
              presentationLabel: pres.label ?? '',
              salePrice,
              brand: product.brand ?? '',
              category: product.category ?? '',
            });
          }
        }
        this.filteredRows = [...this.allRows];
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        toast.error('Error al cargar los productos.');
        this.isLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  private applyFilter(): void {
    if (!this.searchTerm.trim()) {
      this.filteredRows = [...this.allRows];
      return;
    }
    const q = this.searchTerm.toLowerCase();
    this.filteredRows = this.allRows.filter(
      (r) =>
        r.productDescription.toLowerCase().includes(q) ||
        r.presentationLabel.toLowerCase().includes(q) ||
        r.barcode.toLowerCase().includes(q) ||
        r.brand.toLowerCase().includes(q)
    );
  }

  /** Renderiza la etiqueta en un canvas y retorna el data-URL para preview */
  private renderLabelToDataUrl(item: CartItem): string {
    try {
      return this.renderLabelToCanvas(item).toDataURL('image/png');
    } catch {
      return '';
    }
  }

  /** Renderiza la etiqueta en un Canvas offscreen y lo retorna */
  private renderLabelToCanvas(item: CartItem): HTMLCanvasElement {
    const cfg = this.labelConfig;
    const W = Math.round(cfg.labelWidth * PX_PER_MM);
    const H = Math.round(cfg.labelHeight * PX_PER_MM);

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;

    // Fondo blanco
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    // Borde
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, W, H);

    const pad = 4; // padding interno en px
    let curY = pad;
    const centerX = W / 2;

    // ── Nombre empresa ────────────────────────────────────────────────────────
    if (cfg.showCompanyName && item.companyName) {
      const fs = Math.max(8, Math.min(14, W / 12));
      ctx.font = `bold ${fs}px Arial, sans-serif`;
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(item.companyName, centerX, curY, W - pad * 2);
      curY += fs + 3;
    }

    // ── Código de barras ──────────────────────────────────────────────────────
    if (cfg.showBarcode && item.barcode) {
      try {
        const barcodeCanvas = document.createElement('canvas');
        const barcodeH = Math.round(H * 0.3);
        const barcodeW = Math.round(W * 0.85);
        JsBarcode(barcodeCanvas, item.barcode, {
          format: 'CODE128',
          width: 2,
          height: barcodeH,
          displayValue: false,
          margin: 0,
          background: '#ffffff',
        });
        const bx = (W - barcodeW) / 2;
        ctx.drawImage(barcodeCanvas, bx, curY, barcodeW, barcodeH);
        curY += barcodeH + 3;
      } catch (e) {
        console.warn('Barcode error:', e);
      }
    }

    // ── Número de barcode ─────────────────────────────────────────────────────
    if (cfg.showBarcodeNumber && item.barcode) {
      const fs = Math.max(7, Math.min(12, W / 14));
      ctx.font = `bold ${fs}px 'Courier New', monospace`;
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(item.barcode, centerX, curY);
      curY += fs + 4;
    }

    // ── Descripción ───────────────────────────────────────────────────────────
    if (cfg.showDescription) {
      const desc = [item.productDescription, item.presentationLabel]
        .filter(Boolean)
        .join(' - ');
      const fs = Math.max(7, Math.min(11, W / 15));
      ctx.font = `${fs}px Arial, sans-serif`;
      ctx.fillStyle = '#222222';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const lines = this.wrapText(ctx, desc, W - pad * 2);
      lines.slice(0, 3).forEach((line, i) => {
        ctx.fillText(line, centerX, curY + i * (fs + 2));
      });
      curY += lines.slice(0, 3).length * (fs + 2) + 2;
    }

    // ── Marca ─────────────────────────────────────────────────────────────────
    if (cfg.showBrand && item.brand) {
      const fs = Math.max(6, Math.min(10, W / 16));
      ctx.font = `italic ${fs}px Arial, sans-serif`;
      ctx.fillStyle = '#555555';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(item.brand, centerX, curY, W - pad * 2);
      curY += fs + 3;
    }

    // ── Precio ────────────────────────────────────────────────────────────────
    if (cfg.showPrice) {
      const priceText = this.formatPrice(item.salePrice);
      const fs = Math.max(10, Math.min(18, W / 9));
      ctx.font = `bold ${fs}px Arial, sans-serif`;
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(priceText, centerX, H - pad);
    }

    return canvas;
  }

  private wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width <= maxWidth) {
        current = test;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  private formatPrice(price: number | string): string {
    if (typeof price === 'string') return `$${price}`;
    return `$${new Intl.NumberFormat('es-CO').format(price)}`;
  }

  private canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('No blob'));
      }, 'image/png');
    });
  }

  /** Fallback: genera un PNG combinado con todas las etiquetas y descarga */
  private async downloadCombined(files: File[], items: CartItem[]): Promise<void> {
    const cfg = this.labelConfig;
    const W = Math.round(cfg.labelWidth * PX_PER_MM);
    const H = Math.round(cfg.labelHeight * PX_PER_MM);
    const cols = Math.min(cfg.columns, 3);
    const gap = 4;
    const totalFiles = files.length;
    const rows = Math.ceil(totalFiles / cols);

    const combined = document.createElement('canvas');
    combined.width = cols * W + (cols - 1) * gap;
    combined.height = rows * H + (rows - 1) * gap;
    const ctx = combined.getContext('2d')!;
    ctx.fillStyle = '#f8f8f8';
    ctx.fillRect(0, 0, combined.width, combined.height);

    let idx = 0;
    for (const item of items) {
      const labelCanvas = this.renderLabelToCanvas(item);
      for (let c = 0; c < item.quantity; c++) {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        ctx.drawImage(labelCanvas, col * (W + gap), row * (H + gap));
        idx++;
      }
    }

    const blob = await this.canvasToBlob(combined);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `etiquetas-${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private regenerateCartPreviews(): void {
    for (const item of this.cart.values()) {
      item.companyName = this.labelConfig.companyName;
      item.previewDataUrl = this.renderLabelToDataUrl(item);
    }
  }
}
