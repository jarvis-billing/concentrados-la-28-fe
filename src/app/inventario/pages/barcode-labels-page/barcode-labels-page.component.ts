import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ProductoService } from '../../../producto/producto.service';
import { Product, Presentation } from '../../../producto/producto';
import JsBarcode from 'jsbarcode';
import jsPDF from 'jspdf';

interface LabelData {
  barcode: string;
  productDescription: string;
  presentationLabel: string;
  salePrice: number;
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

  // Configuración de etiqueta (50x25 mm)
  readonly LABEL_WIDTH_MM = 50;
  readonly LABEL_HEIGHT_MM = 25;
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

  // Configuración de página para impresión
  labelsPerRow = 4;
  labelsPerColumn = 10;

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
          this.labels.push({
            barcode: pres.barcode,
            productDescription: product.description || '',
            presentationLabel: pres.label || '',
            salePrice: pres.salePrice || 0,
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

  formatPrice(price: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(price);
  }

  generateLabelsPdf(): void {
    if (this.selectedLabels.length === 0) {
      alert('Seleccione al menos una etiqueta para generar el PDF');
      return;
    }

    this.isGeneratingPdf = true;

    // Crear PDF con tamaño carta
    const doc = new jsPDF('portrait', 'mm', 'letter');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // Márgenes de página
    const marginLeft = 5;
    const marginTop = 5;

    // Espaciado entre etiquetas
    const spacingX = 1;
    const spacingY = 1;

    // Calcular posiciones
    const labelsPerRow = Math.floor((pageWidth - marginLeft * 2 + spacingX) / (this.LABEL_WIDTH_MM + spacingX));
    const labelsPerCol = Math.floor((pageHeight - marginTop * 2 + spacingY) / (this.LABEL_HEIGHT_MM + spacingY));

    // Expandir etiquetas según copias
    const expandedLabels: LabelData[] = [];
    this.selectedLabels.forEach(label => {
      for (let i = 0; i < this.copiesPerLabel; i++) {
        expandedLabels.push(label);
      }
    });

    let labelIndex = 0;
    let pageNum = 0;

    while (labelIndex < expandedLabels.length) {
      if (pageNum > 0) {
        doc.addPage();
      }

      for (let row = 0; row < labelsPerCol && labelIndex < expandedLabels.length; row++) {
        for (let col = 0; col < labelsPerRow && labelIndex < expandedLabels.length; col++) {
          const label = expandedLabels[labelIndex];
          const x = marginLeft + col * (this.LABEL_WIDTH_MM + spacingX);
          const y = marginTop + row * (this.LABEL_HEIGHT_MM + spacingY);

          this.drawLabel(doc, label, x, y);
          labelIndex++;
        }
      }
      pageNum++;
    }

    // Guardar PDF
    const fileName = `etiquetas_barcode_${this.formatDateForFile()}.pdf`;
    doc.save(fileName);
    this.isGeneratingPdf = false;
  }

  private drawLabel(doc: jsPDF, label: LabelData, x: number, y: number): void {
    const w = this.LABEL_WIDTH_MM;
    const h = this.LABEL_HEIGHT_MM;

    // Borde de la etiqueta (línea punteada para corte)
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.1);
    doc.rect(x, y, w, h);

    // Nombre de la empresa (parte superior)
    doc.setFontSize(5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    const companyText = label.companyName;
    doc.text(companyText, x + w / 2, y + 2.5, { align: 'center' });

    // Generar barcode como imagen
    const canvas = document.createElement('canvas');
    try {
      JsBarcode(canvas, label.barcode, {
        format: 'CODE128',
        width: 1.2,
        height: 25,
        displayValue: true,
        fontSize: 8,
        margin: 0,
        background: '#ffffff',
        textMargin: 0
      });

      const barcodeImg = canvas.toDataURL('image/png');
      // Barcode centrado
      const barcodeWidth = w - 4;
      const barcodeHeight = 10;
      const barcodeX = x + (w - barcodeWidth) / 2;
      const barcodeY = y + 3.5;
      doc.addImage(barcodeImg, 'PNG', barcodeX, barcodeY, barcodeWidth, barcodeHeight);
    } catch (e) {
      console.warn(`Error generating barcode: ${label.barcode}`, e);
      // Mostrar código como texto si falla el barcode
      doc.setFontSize(6);
      doc.text(label.barcode, x + w / 2, y + 10, { align: 'center' });
    }

    // Label de presentación (debajo del barcode)
    doc.setFontSize(5);
    doc.setFont('helvetica', 'normal');
    const presLabel = this.truncateText(label.presentationLabel, 35);
    doc.text(presLabel, x + w / 2, y + 16, { align: 'center' });

    // Precio de venta (parte inferior, destacado)
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    const priceText = this.formatPrice(label.salePrice);
    doc.text(priceText, x + w / 2, y + 22, { align: 'center' });
  }

  private truncateText(text: string, maxLength: number): string {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;
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
