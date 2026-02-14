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
}

@Component({
  selector: 'app-barcode-labels-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LabelConfigModalComponent],
  templateUrl: './barcode-labels-page.component.html',
  styleUrls: ['./barcode-labels-page.component.css']
})
export class BarcodeLabelsPageComponent implements OnInit {
  private productService = inject(ProductoService);
  private labelConfigService = inject(LabelConfigService);

  @ViewChild('labelConfigModal') labelConfigModal!: LabelConfigModalComponent;

  // Configuración dinámica de etiquetas
  labelConfig: LabelConfig = {} as LabelConfig;

  allProducts: Product[] = [];
  products: Product[] = [];
  categories: string[] = [];
  selectedCategory = '';
  searchTerm = '';
  labels: LabelData[] = [];
  selectedLabels: LabelData[] = [];
  isLoading = true;
  isGeneratingPdf = false;
  copiesPerLabel = 1;

  ngOnInit(): void {
    this.labelConfig = this.labelConfigService.getConfig();
    this.loadProducts();
  }

  openConfigModal(): void {
    this.labelConfigModal.openModal();
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
            selected: false
          });
        }
      });
    });
  }

  onCategoryChange(category: string): void {
    this.selectedCategory = category;
    this.applyFilters();
  }

  onSearchChange(): void {
    this.applyFilters();
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
    this.updateSelectedLabels();
  }

  selectAll(): void {
    this.labels.forEach(l => l.selected = true);
    this.updateSelectedLabels();
  }

  deselectAll(): void {
    this.labels.forEach(l => l.selected = false);
    this.updateSelectedLabels();
  }

  private updateSelectedLabels(): void {
    this.selectedLabels = this.labels.filter(l => l.selected);
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

    // Expandir etiquetas según copias
    const expandedLabels: LabelData[] = [];
    this.selectedLabels.forEach(label => {
      for (let i = 0; i < this.copiesPerLabel; i++) {
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
      const fontSize = Math.max(4, Math.min(5, w / 12));
      doc.setFontSize(fontSize);
      doc.setFont('helvetica', 'normal');
      const maxChars = Math.floor(w / 1.8);
      const descLines = this.wrapText(label.productDescription, maxChars);
      descLines.forEach((line, index) => {
        doc.text(line, centerX, currentY + 2 + (index * 2), { align: 'center' });
      });
      currentY += lineSpacing * 0.6 * descLines.length;
    }

    // Precio de venta
    if (config.showPrice) {
      const fontSize = Math.max(6, Math.min(9, w / 6));
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

    // Máximo 2 líneas
    if (lines.length > 2) {
      lines[1] = lines[1].substring(0, maxCharsPerLine - 3) + '...';
      return lines.slice(0, 2);
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
