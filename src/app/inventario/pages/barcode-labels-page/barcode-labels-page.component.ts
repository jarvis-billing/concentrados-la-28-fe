import { Component, OnInit, inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ProductoService } from '../../../producto/producto.service';
import { Product, Presentation, UnitMeasure } from '../../../producto/producto';
import JsBarcode from 'jsbarcode';
import jsPDF from 'jspdf';
import { toast } from 'ngx-sonner';
import { LabelConfig } from '../../models/label-config';
import { LabelConfigService } from '../../services/label-config.service';
import { LabelConfigModalComponent } from '../../components/label-config-modal/label-config-modal.component';
import { PurchaseInvoiceSearchModalComponent } from '../../components/purchase-invoice-search-modal/purchase-invoice-search-modal.component';
import { PurchaseInvoice } from '../../../compras/models/purchase-invoice';

// Mapa de abreviaturas para unidades de medida
const UNIT_ABBREVIATIONS: Record<string, string> = {
  [UnitMeasure.KILOGRAMOS]: 'Kg',
  [UnitMeasure.METROS]: 'Metro',
  [UnitMeasure.CENTIMETROS]: 'Cm',
  [UnitMeasure.LITROS]: 'Lt',
  [UnitMeasure.MILILITROS]: 'CC',
  [UnitMeasure.UNIDAD]: 'Und'
};

interface LabelData {
  barcode: string;
  productDescription: string;
  presentationLabel: string;
  salePrice: number | string;
  companyName: string;
  selected: boolean;
  quantity: number; // Cantidad de copias a imprimir (en modo factura = cantidad comprada)
}

const LABEL_CART_KEY = 'labelCart';

@Component({
  selector: 'app-barcode-labels-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LabelConfigModalComponent, PurchaseInvoiceSearchModalComponent],
  templateUrl: './barcode-labels-page.component.html',
  styleUrls: ['./barcode-labels-page.component.css']
})
export class BarcodeLabelsPageComponent implements OnInit {
  private productService = inject(ProductoService);
  private labelConfigService = inject(LabelConfigService);

  @ViewChild('labelConfigModal') labelConfigModal!: LabelConfigModalComponent;
  @ViewChild('purchaseInvoiceModal') purchaseInvoiceModal!: PurchaseInvoiceSearchModalComponent;

  // Configuración dinámica de etiquetas
  labelConfig: LabelConfig = {} as LabelConfig;

  allProducts: Product[] = [];
  products: Product[] = [];
  categories: string[] = [];
  selectedCategory = '';
  searchTerm = '';
  labels: LabelData[] = [];
  isLoading = true;
  isGeneratingPdf = false;
  copiesPerLabel = 1;

  // Carrito persistente de etiquetas seleccionadas (clave = barcode)
  labelCart: Map<string, LabelData> = new Map();
  showCart = false;

  // Factura de compra seleccionada
  selectedInvoice: PurchaseInvoice | null = null;
  invoiceMode = false; // true cuando se filtran productos por factura

  ngOnInit(): void {
    this.labelConfig = this.labelConfigService.getConfig();
    this.loadCartFromStorage();
    this.loadProducts();
  }

  openConfigModal(): void {
    this.labelConfigModal.openModal();
  }

  openPurchaseInvoiceModal(): void {
    this.purchaseInvoiceModal.openModal();
  }

  onInvoiceSelected(invoice: PurchaseInvoice): void {
    this.selectedInvoice = invoice;
    this.invoiceMode = true;
    this.buildLabelsFromInvoice(invoice);
  }

  clearInvoiceFilter(): void {
    this.selectedInvoice = null;
    this.invoiceMode = false;
    this.products = [...this.allProducts];
    this.buildLabels();
  }

  private buildLabelsFromInvoice(invoice: PurchaseInvoice): void {
    this.labels = [];
    const items = invoice.items || [];
    items.forEach(item => {
      if (item.presentationBarcode) {
        // Buscar el producto y presentación en allProducts para obtener salePrice
        let salePrice: number | string = 0;
        let presentationLabel = item.description || '';
        for (const prod of this.allProducts) {
          const pres = (prod.presentations || []).find(p => p.barcode === item.presentationBarcode);
          if (pres) {
            const unitAbbr = UNIT_ABBREVIATIONS[pres.unitMeasure] || pres.unitMeasure;
            salePrice = pres.isBulk ? pres.salePrice + ' ' + unitAbbr : pres.salePrice;
            presentationLabel = pres.label || item.description || '';
            break;
          }
        }
        this.labels.push({
          barcode: item.presentationBarcode,
          productDescription: presentationLabel,
          presentationLabel: presentationLabel,
          salePrice: salePrice || 0,
          companyName: this.labelConfig.companyName || 'CONCENTRADOS LA 28',
          selected: false,
          quantity: Math.ceil(item.quantity) || 1
        });
      }
    });
    this.syncLabelsWithCart();
    // Aplicar filtros existentes (búsqueda y categoría) sobre las etiquetas de la factura
    this.applyInvoiceFilters();
  }

  private applyInvoiceFilters(): void {
    if (!this.invoiceMode) return;
    let filtered = [...this.labels];
    if (this.searchTerm.trim()) {
      const term = this.searchTerm.toLowerCase().trim();
      filtered = filtered.filter(l =>
        (l.productDescription || '').toLowerCase().includes(term) ||
        (l.barcode || '').toLowerCase().includes(term) ||
        (l.presentationLabel || '').toLowerCase().includes(term)
      );
    }
    // No re-build, just filter existing labels list
    this.labels = filtered;
    this.syncLabelsWithCart();
  }

  onConfigSaved(config: LabelConfig): void {
    this.labelConfig = config;
    this.buildLabels();
  }

  private loadProducts(): void {
    this.isLoading = true;
    this.productService.getAll().subscribe({
      next: (products) => {
        this.allProducts = products
          .filter(p => p.presentations && p.presentations.length > 0)
          .sort((a, b) => (a.description || '').localeCompare(b.description || ''));

        this.categories = [...new Set(
          this.allProducts
            .map(p => p.category)
            .filter(c => c && c.trim() !== '')
        )].sort();

        this.products = [...this.allProducts];
        this.buildLabels();
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading products:', error);
        this.isLoading = false;
      }
    });
  }

  private buildLabels(): void {
    this.labels = [];
    this.products.forEach(product => {
      const presentations = product.presentations || [];
      presentations.forEach(pres => {
        if (pres.barcode) {
          const unitAbbr = UNIT_ABBREVIATIONS[pres.unitMeasure] || pres.unitMeasure;
          const salePrice = pres.isBulk ? pres.salePrice + ' ' + unitAbbr : pres.salePrice;
          this.labels.push({
            barcode: pres.barcode,
            productDescription: pres.label || '',
            presentationLabel: pres.label || '',
            salePrice: salePrice || 0,
            companyName: this.labelConfig.companyName || 'CONCENTRADOS LA 28',
            selected: false,
            quantity: 1
          });
        }
      });
    });
    this.syncLabelsWithCart();
  }

  onCategoryChange(category: string): void {
    this.selectedCategory = category;
    if (this.invoiceMode) {
      this.buildLabelsFromInvoice(this.selectedInvoice!);
    } else {
      this.applyFilters();
    }
  }

  onSearchChange(): void {
    if (this.invoiceMode) {
      this.buildLabelsFromInvoice(this.selectedInvoice!);
    } else {
      this.applyFilters();
    }
  }

  private applyFilters(): void {
    let filtered = [...this.allProducts];

    if (this.selectedCategory) {
      filtered = filtered.filter(p => p.category === this.selectedCategory);
    }

    if (this.searchTerm.trim()) {
      const term = this.searchTerm.toLowerCase().trim();
      filtered = filtered.filter(p =>
        (p.description || '').toLowerCase().includes(term) ||
        (p.brand || '').toLowerCase().includes(term) ||
        p.presentations?.some(pres =>
          (pres.barcode || '').toLowerCase().includes(term) ||
          (pres.label || '').toLowerCase().includes(term)
        )
      );
    }

    this.products = filtered;
    this.buildLabels();
  }

  toggleLabelSelection(label: LabelData): void {
    label.selected = !label.selected;
    if (label.selected) {
      this.labelCart.set(label.barcode, { ...label });
    } else {
      this.labelCart.delete(label.barcode);
    }
    this.saveCartToStorage();
  }

  selectAll(): void {
    this.labels.forEach(l => {
      l.selected = true;
      this.labelCart.set(l.barcode, { ...l });
    });
    this.saveCartToStorage();
  }

  deselectAll(): void {
    this.labels.forEach(l => {
      l.selected = false;
      this.labelCart.delete(l.barcode);
    });
    this.saveCartToStorage();
  }

  get selectedLabels(): LabelData[] {
    return Array.from(this.labelCart.values());
  }

  getTotalLabelCopies(): number {
    return this.selectedLabels.reduce((sum, l) => sum + ((l.quantity || 1) * this.copiesPerLabel), 0);
  }

  // --- Cart persistence ---

  private loadCartFromStorage(): void {
    try {
      const stored = localStorage.getItem(LABEL_CART_KEY);
      if (stored) {
        const arr: LabelData[] = JSON.parse(stored);
        this.labelCart = new Map(arr.map(l => [l.barcode, l]));
      }
    } catch (e) {
      console.warn('Error loading label cart from localStorage:', e);
    }
  }

  private saveCartToStorage(): void {
    try {
      const arr = Array.from(this.labelCart.values());
      localStorage.setItem(LABEL_CART_KEY, JSON.stringify(arr));
    } catch (e) {
      console.warn('Error saving label cart to localStorage:', e);
    }
  }

  private syncLabelsWithCart(): void {
    this.labels.forEach(l => {
      const inCart = this.labelCart.get(l.barcode);
      if (inCart) {
        l.selected = true;
        l.quantity = inCart.quantity;
      } else {
        l.selected = false;
      }
    });
  }

  removeFromCart(barcode: string): void {
    this.labelCart.delete(barcode);
    // Sincronizar el estado visual si la etiqueta está visible
    const visible = this.labels.find(l => l.barcode === barcode);
    if (visible) visible.selected = false;
    this.saveCartToStorage();
  }

  clearCart(): void {
    this.labelCart.clear();
    this.labels.forEach(l => l.selected = false);
    this.saveCartToStorage();
    toast.info('Carrito de etiquetas limpiado');
  }

  toggleCart(): void {
    this.showCart = !this.showCart;
  }

  updateCartQuantity(barcode: string, quantity: number): void {
    const item = this.labelCart.get(barcode);
    if (item) {
      item.quantity = Math.max(1, quantity);
      this.labelCart.set(barcode, item);
      // Sincronizar con label visible
      const visible = this.labels.find(l => l.barcode === barcode);
      if (visible) visible.quantity = item.quantity;
      this.saveCartToStorage();
    }
  }

  onLabelQuantityChange(label: LabelData): void {
    if (label.selected && this.labelCart.has(label.barcode)) {
      const item = this.labelCart.get(label.barcode)!;
      item.quantity = label.quantity;
      this.labelCart.set(label.barcode, item);
      this.saveCartToStorage();
    }
  }

  formatPrice(price: number | string): string {
    if (typeof price === 'string') {
      // Si ya es string (ej: "5000 KG"), formatear solo la parte numérica
      const parts = price.split(' ');
      const numericPart = parseFloat(parts[0]);
      const unit = parts.slice(1).join(' ');
      const formatted = new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(numericPart);
      return unit ? `${formatted}/${unit}` : formatted;
    }
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(price);
  }

  generateLabelsPdf(): void {
    if (this.selectedLabels.length === 0) {
      toast.warning('Seleccione al menos una etiqueta para generar el PDF');
      return;
    }

    this.isGeneratingPdf = true;

    const config = this.labelConfig;
    const columns = config.columns || 1;
    const labelW = config.labelWidth;
    const labelH = config.labelHeight;
    const colGap = config.columnGap || 0;
    const rowGap = config.rowGap || 0;

    // Expandir etiquetas según copias (usa cantidad individual * copias globales)
    const expandedLabels: LabelData[] = [];
    this.selectedLabels.forEach(label => {
      const copies = (label.quantity || 1) * this.copiesPerLabel;
      for (let i = 0; i < copies; i++) {
        expandedLabels.push(label);
      }
    });

    // Calcular ancho total del rollo
    const rollWidth = config.marginLeft + 
                      (labelW * columns) + 
                      (colGap * (columns - 1)) + 
                      config.marginRight;

    // Crear PDF con ancho del rollo y alto de una fila de etiquetas
    const pageHeight = config.marginTop + labelH + config.marginBottom;
    
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [pageHeight, rollWidth]
    });

    // Dibujar etiquetas en filas con múltiples columnas
    let labelIndex = 0;
    let isFirstPage = true;

    while (labelIndex < expandedLabels.length) {
      if (!isFirstPage) {
        doc.addPage([pageHeight, rollWidth], 'landscape');
      }
      isFirstPage = false;

      // Dibujar una fila de etiquetas (tantas como columnas)
      for (let col = 0; col < columns && labelIndex < expandedLabels.length; col++) {
        const x = config.marginLeft + (col * (labelW + colGap));
        const y = config.marginTop;
        this.drawLabel(doc, expandedLabels[labelIndex], x, y);
        labelIndex++;
      }
    }

    // Guardar PDF
    const fileName = `etiquetas_barcode_${this.formatDateForFile()}.pdf`;
    doc.save(fileName);
    this.isGeneratingPdf = false;
  }

  private drawLabel(doc: jsPDF, label: LabelData, x: number, y: number): void {
    const config = this.labelConfig;
    const w = config.labelWidth;
    const h = config.labelHeight;
    const centerX = x + w / 2;

    // Calcular posiciones dinámicamente según campos habilitados
    let currentY = y + 1;
    const lineSpacing = h / 6; // Dividir el espacio disponible

    // Nombre de la empresa
    if (config.showCompanyName) {
      const fontSize = Math.max(4, Math.min(6, w / 10));
      doc.setFontSize(fontSize);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text(label.companyName, centerX, currentY + 2.5, { align: 'center' });
      currentY += lineSpacing * 0.8;
    }

    // Código de barras
    if (config.showBarcode) {
      const canvas = document.createElement('canvas');
      try {
        JsBarcode(canvas, label.barcode, {
          format: 'CODE128',
          width: 2,
          height: 40,
          displayValue: false,
          margin: 0,
          background: '#ffffff'
        });

        const barcodeImg = canvas.toDataURL('image/png');
        const barcodeWidth = Math.min(w - 4, w * 0.85);
        const barcodeHeight = Math.min(h * 0.25, 6);
        const barcodeX = x + (w - barcodeWidth) / 2;
        doc.addImage(barcodeImg, 'PNG', barcodeX, currentY, barcodeWidth, barcodeHeight);
        currentY += barcodeHeight + 1;
      } catch (e) {
        console.warn(`Error generating barcode: ${label.barcode}`, e);
      }
    }

    // Número del código de barras
    if (config.showBarcodeNumber) {
      const fontSize = Math.max(5, Math.min(8, w / 7));
      doc.setFontSize(fontSize);
      doc.setFont('helvetica', 'bold');
      doc.text(label.barcode, centerX, currentY + 2, { align: 'center' });
      currentY += lineSpacing * 0.7;
    }

    // Descripción del producto
    if (config.showDescription) {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      const maxWidth = w - 2; // margen interno de 1mm por lado
      let descLines: string[] = doc.splitTextToSize(label.productDescription || '', maxWidth);
      if (descLines.length > 4) {
        descLines = descLines.slice(0, 4);
        descLines[3] = descLines[3].substring(0, descLines[3].length - 3) + '...';
      }
      descLines.forEach((line: string, index: number) => {
        doc.text(line, centerX, currentY + 2.5 + (index * 2.5), { align: 'center' });
      });
      currentY += 2.5 * descLines.length;
    }

    // Precio de venta
    if (config.showPrice) {
      const fontSize = Math.max(8, Math.min(9, w / 6));
      doc.setFontSize(fontSize);
      doc.setFont('helvetica', 'bold');
      const priceText = this.formatPrice(label.salePrice);
      // Posicionar el precio cerca del fondo de la etiqueta
      const priceY = Math.min(currentY + 3, y + h - 2);
      doc.text(priceText, centerX, priceY, { align: 'center' });
    }
      
  }

  private wrapText(text: string, maxCharsPerLine: number): string[] {
    if (!text) return [''];
    if (text.length <= maxCharsPerLine) return [text];
    
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    words.forEach(word => {
      if ((currentLine + ' ' + word).trim().length <= maxCharsPerLine) {
        currentLine = (currentLine + ' ' + word).trim();
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    });
    if (currentLine) lines.push(currentLine);

    // Máximo 4 líneas para mostrar descripción completa
    if (lines.length > 4) {
      lines[3] = lines[3].substring(0, maxCharsPerLine - 3) + '...';
      return lines.slice(0, 4);
    }
    return lines;
  }

  private formatDateForFile(): string {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  }

  // Preview de una etiqueta individual
  generatePreviewBarcode(elementId: string, barcode: string): void {
    setTimeout(() => {
      const element = document.getElementById(elementId);
      if (element && barcode) {
        try {
          JsBarcode(`#${elementId}`, barcode, {
            format: 'CODE128',
            width: 1,
            height: 25,
            displayValue: true,
            fontSize: 8,
            margin: 2,
            background: '#ffffff'
          });
        } catch (e) {
          console.warn(`Error generating preview barcode: ${barcode}`, e);
        }
      }
    }, 50);
  }
}
