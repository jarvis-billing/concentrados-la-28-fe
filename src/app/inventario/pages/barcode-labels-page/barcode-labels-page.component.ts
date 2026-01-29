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

    // Expandir etiquetas según copias
    const expandedLabels: LabelData[] = [];
    this.selectedLabels.forEach(label => {
      for (let i = 0; i < this.copiesPerLabel; i++) {
        expandedLabels.push(label);
      }
    });

    // Calcular altura total del rollo: etiquetas + separaciones
    // Cada etiqueta tiene 25mm de alto + 5mm de separación (excepto la última)
    const totalHeight = expandedLabels.length * this.LABEL_HEIGHT_MM + 
                        (expandedLabels.length - 1) * this.LABEL_GAP_MM;

    // Crear PDF con ancho de etiqueta (50mm) y altura total del rollo
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [this.LABEL_WIDTH_MM, totalHeight]
    });

    // Dibujar cada etiqueta verticalmente una debajo de otra
    let yPos = 0;
    expandedLabels.forEach((label, index) => {
      this.drawLabel(doc, label, 0, yPos);
      yPos += this.LABEL_HEIGHT_MM;
      
      // Agregar separación entre etiquetas (excepto después de la última)
      if (index < expandedLabels.length - 1) {
        yPos += this.LABEL_GAP_MM;
      }
    });

    // Guardar PDF
    const fileName = `etiquetas_barcode_${this.formatDateForFile()}.pdf`;
    doc.save(fileName);
    this.isGeneratingPdf = false;
  }

  private drawLabel(doc: jsPDF, label: LabelData, x: number, y: number): void {
    const w = this.LABEL_WIDTH_MM;
    const h = this.LABEL_HEIGHT_MM;
    const centerX = x + w / 2;

    // Nombre de la empresa (parte superior)
    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(label.companyName, centerX, y + 3, { align: 'center' });

    // Generar barcode como imagen
    const canvas = document.createElement('canvas');
    try {
      JsBarcode(canvas, label.barcode, {
        format: 'CODE128',
        width: 1.5,
        height: 30,
        displayValue: true,
        fontSize: 10,
        margin: 0,
        background: '#ffffff',
        textMargin: 1
      });

      const barcodeImg = canvas.toDataURL('image/png');
      // Barcode centrado - ocupa casi todo el ancho
      const barcodeWidth = w - 4;
      const barcodeHeight = 12;
      const barcodeX = x + (w - barcodeWidth) / 2;
      const barcodeY = y + 4;
      doc.addImage(barcodeImg, 'PNG', barcodeX, barcodeY, barcodeWidth, barcodeHeight);
    } catch (e) {
      console.warn(`Error generating barcode: ${label.barcode}`, e);
      // Mostrar código como texto si falla el barcode
      doc.setFontSize(8);
      doc.text(label.barcode, centerX, y + 12, { align: 'center' });
    }

    // Descripción del producto (debajo del barcode)
    doc.setFontSize(5);
    doc.setFont('helvetica', 'normal');
    const description = this.truncateText(label.productDescription, 40);
    doc.text(description, centerX, y + 18, { align: 'center' });

    // Precio de venta (parte inferior, destacado)
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    const priceText = this.formatPrice(label.salePrice);
    doc.text(priceText, centerX, y + 23, { align: 'center' });
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
