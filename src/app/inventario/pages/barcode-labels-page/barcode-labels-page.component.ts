import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ProductoService } from '../../../producto/producto.service';
import { Product, Presentation, UnitMeasure } from '../../../producto/producto';
import JsBarcode from 'jsbarcode';
import jsPDF from 'jspdf';
import { toast } from 'ngx-sonner';

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
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './barcode-labels-page.component.html',
  styleUrls: ['./barcode-labels-page.component.css']
})
export class BarcodeLabelsPageComponent implements OnInit {
  private productService = inject(ProductoService);

  // Configuración de etiqueta (50x25 mm) para rollo con separación de 5mm
  readonly LABEL_WIDTH_MM = 50;
  readonly LABEL_HEIGHT_MM = 25;
  readonly LABEL_GAP_MM = 5; // Separación entre etiquetas en el rollo
  readonly COMPANY_NAME = 'CONCENTRADOS LA 28';

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
    this.loadProducts();
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
            companyName: this.COMPANY_NAME,
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

    // Expandir etiquetas según copias
    const expandedLabels: LabelData[] = [];
    this.selectedLabels.forEach(label => {
      for (let i = 0; i < this.copiesPerLabel; i++) {
        expandedLabels.push(label);
      }
    });

    // Crear PDF con tamaño exacto de etiqueta: 50mm ancho x 25mm alto
    // jsPDF format: [alto, ancho] cuando orientation es 'landscape'
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [this.LABEL_HEIGHT_MM, this.LABEL_WIDTH_MM] // [25, 50] -> resultado: 50mm ancho x 25mm alto
    });

    // Dibujar cada etiqueta en su propia página
    expandedLabels.forEach((label, index) => {
      if (index > 0) {
        doc.addPage([this.LABEL_HEIGHT_MM, this.LABEL_WIDTH_MM], 'landscape');
      }
      this.drawLabel(doc, label, 0, 0);
    });

    // Guardar PDF
    const fileName = `etiquetas_barcode_${this.formatDateForFile()}.pdf`;
    doc.save(fileName);
    this.isGeneratingPdf = false;
  }

  private drawLabel(doc: jsPDF, label: LabelData, x: number, y: number): void {
    // Dimensiones: 50mm ancho x 25mm alto
    const w = this.LABEL_WIDTH_MM; // 50mm
    const h = this.LABEL_HEIGHT_MM; // 25mm
    const centerX = x + w / 2; // 25mm

    // Nombre de la empresa - y=4mm
    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(label.companyName, centerX, y + 4, { align: 'center' });

    // Generar barcode como imagen (sin texto, lo agregamos manualmente)
    const canvas = document.createElement('canvas');
    try {
      JsBarcode(canvas, label.barcode, {
        format: 'CODE128',
        width: 2,
        height: 40,
        displayValue: false, // Sin texto en el barcode
        margin: 0,
        background: '#ffffff'
      });

      const barcodeImg = canvas.toDataURL('image/png');
      // Barcode: ancho 42mm, alto 5mm, centrado
      const barcodeWidth = 42;
      const barcodeHeight = 5;
      const barcodeX = x + (w - barcodeWidth) / 2;
      const barcodeY = y + 5; // empieza en y=5mm
      doc.addImage(barcodeImg, 'PNG', barcodeX, barcodeY, barcodeWidth, barcodeHeight);

      // Número del código de barras - separado del barcode (y + 12.5mm)
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(label.barcode, centerX, y + 12.5, { align: 'center' });
    } catch (e) {
      console.warn(`Error generating barcode: ${label.barcode}`, e);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(label.barcode, centerX, y + 11, { align: 'center' });
    }

    // Descripción del producto - con salto de línea si es muy largo
    doc.setFontSize(5);
    doc.setFont('helvetica', 'normal');
    const descLines = this.wrapText(label.productDescription, 30); // máx 30 chars por línea
    const descY = y + 16;
    descLines.forEach((line, index) => {
      doc.text(line, centerX, descY + (index * 2.5), { align: 'center' });
    });

    // Precio de venta (parte inferior)
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    const priceText = this.formatPrice(label.salePrice);
    const priceY = descLines.length > 1 ? y + 22 : y + 21;
    doc.text(priceText, centerX, priceY, { align: 'center' });
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
