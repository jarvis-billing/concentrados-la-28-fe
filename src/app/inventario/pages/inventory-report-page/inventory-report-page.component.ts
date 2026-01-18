import { Component, OnInit, AfterViewInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ProductoService } from '../../../producto/producto.service';
import { Product } from '../../../producto/producto';
import JsBarcode from 'jsbarcode';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

@Component({
  selector: 'app-inventory-report-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './inventory-report-page.component.html',
  styleUrls: ['./inventory-report-page.component.css']
})
export class InventoryReportPageComponent implements OnInit, AfterViewInit {
  private productService = inject(ProductoService);

  allProducts: Product[] = [];
  products: Product[] = [];
  categories: string[] = [];
  selectedCategory = '';
  sortOrder: 'asc' | 'desc' = 'asc';
  sortBy: 'description' | 'category' = 'description';
  isLoading = true;
  isGeneratingPdf = false;
  reportDate = new Date();
  barcodesGenerated = false;

  ngOnInit(): void {
    this.loadProducts();
  }

  ngAfterViewInit(): void {
    // Los barcodes se generan después de que los productos se cargan
  }

  private loadProducts(): void {
    this.isLoading = true;
    this.productService.getAll().subscribe({
      next: (products) => {
        // Filtrar productos con presentaciones y ordenar por descripción
        this.allProducts = products
          .filter(p => p.presentations && p.presentations.length > 0)
          .sort((a, b) => (a.description || '').localeCompare(b.description || ''));
        
        // Extraer categorías únicas solo de productos con presentaciones válidas
        this.categories = [...new Set(
          this.allProducts
            .filter(p => p.presentations && p.presentations.length > 0)
            .map(p => p.category)
            .filter(c => c && c.trim() !== '')
        )].sort();
        
        // Mostrar todos los productos inicialmente
        this.products = [...this.allProducts];
        this.isLoading = false;
        
        // Generar barcodes después de que el DOM se actualice
        setTimeout(() => this.generateBarcodes(), 100);
      },
      error: (error) => {
        console.error('Error loading products:', error);
        this.isLoading = false;
      }
    });
  }

  onCategoryChange(category: string): void {
    this.selectedCategory = category;
    this.applyFiltersAndSort();
  }

  toggleSortOrder(): void {
    this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
    this.applyFiltersAndSort();
  }

  setSortBy(field: 'description' | 'category'): void {
    if (this.sortBy === field) {
      this.toggleSortOrder();
    } else {
      this.sortBy = field;
      this.sortOrder = 'asc';
      this.applyFiltersAndSort();
    }
  }

  private applyFiltersAndSort(): void {
    this.barcodesGenerated = false;
    
    // Filtrar por categoría
    let filtered = this.selectedCategory 
      ? this.allProducts.filter(p => p.category === this.selectedCategory)
      : [...this.allProducts];
    
    // Ordenar
    filtered.sort((a, b) => {
      let comparison: number;
      if (this.sortBy === 'category') {
        comparison = (a.category || '').localeCompare(b.category || '');
        // Si las categorías son iguales, ordenar por descripción
        if (comparison === 0) {
          comparison = (a.description || '').localeCompare(b.description || '');
        }
      } else {
        comparison = (a.description || '').localeCompare(b.description || '');
      }
      return this.sortOrder === 'asc' ? comparison : -comparison;
    });
    
    this.products = filtered;
    
    // Regenerar barcodes para los productos filtrados
    setTimeout(() => this.generateBarcodes(), 100);
  }

  private generateBarcodes(): void {
    if (this.barcodesGenerated) return;

    this.products.forEach((product, index) => {
      const presentations = product.presentations || [];
      presentations.forEach((pres, presIndex) => {
        const barcode = pres.barcode;
        if (barcode) {
          const elementId = `barcode-${index}-${presIndex}`;
          const element = document.getElementById(elementId);
          if (element) {
            try {
              JsBarcode(`#${elementId}`, barcode, {
                format: 'CODE128',
                width: 1.5,
                height: 40,
                displayValue: true,
                fontSize: 12,
                margin: 5,
                background: '#ffffff'
              });
            } catch (e) {
              console.warn(`Error generating barcode for ${barcode}:`, e);
            }
          }
        }
      });
    });

    this.barcodesGenerated = true;
  }

  printReport(): void {
    window.print();
  }

  generatePdf(): void {
    this.isGeneratingPdf = true;
    
    const doc = new jsPDF('portrait', 'mm', 'letter');
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Título
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('PLANILLA DE INVENTARIO FÍSICO', pageWidth / 2, 15, { align: 'center' });
    
    // Categoría si está seleccionada
    let yPos = 22;
    if (this.selectedCategory) {
      doc.setFontSize(12);
      doc.text(`Categoría: ${this.selectedCategory}`, pageWidth / 2, yPos, { align: 'center' });
      yPos += 6;
    }
    
    // Fecha
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Fecha: ${this.formatDate(this.reportDate)}`, pageWidth / 2, yPos, { align: 'center' });
    yPos += 5;
    doc.text(`Total de productos: ${this.getTotalItems()}`, pageWidth / 2, yPos, { align: 'center' });
    
    // Preparar datos para la tabla con imágenes de barcode
    const tableData: any[][] = [];
    let itemNum = 1;
    
    // Generar imágenes de barcodes
    const barcodeImages: { [key: string]: string } = {};
    this.products.forEach((product) => {
      const presentations = product.presentations || [];
      presentations.forEach((pres) => {
        if (pres.barcode) {
          const canvas = document.createElement('canvas');
          try {
            JsBarcode(canvas, pres.barcode, {
              format: 'CODE128',
              width: 1.5,
              height: 30,
              displayValue: true,
              fontSize: 10,
              margin: 2,
              background: '#ffffff'
            });
            barcodeImages[pres.barcode] = canvas.toDataURL('image/png');
          } catch (e) {
            console.warn(`Error generating barcode for PDF: ${pres.barcode}`, e);
          }
        }
      });
    });
    
    this.products.forEach((product) => {
      const presentations = product.presentations || [];
      presentations.forEach((pres) => {
        const description = product.brand 
          ? `${product.description} - ${product.brand}` 
          : product.description;
        const fullDesc = pres.label ? `${description}\n${pres.label}` : description;
        
        tableData.push([
          String(itemNum++),
          pres.barcode || '',
          fullDesc,
          product.category || '-',
          pres.unitMeasure || 'UND',
          ''
        ]);
      });
    });
    
    // Generar tabla con imágenes de barcode
    autoTable(doc, {
      startY: yPos + 8,
      head: [['#', 'Código de Barras', 'Descripción', 'Categoría', 'Unidad', 'Cantidad']],
      body: tableData,
      styles: {
        fontSize: 8,
        cellPadding: 2,
        valign: 'middle'
      },
      headStyles: {
        fillColor: [66, 66, 66],
        textColor: 255,
        fontStyle: 'bold'
      },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center', overflow: 'visible' },
        1: { cellWidth: 38, halign: 'center' },
        2: { cellWidth: 52 },
        3: { cellWidth: 26, overflow: 'visible', fontSize: 7 },
        4: { cellWidth: 18, halign: 'center', overflow: 'visible', fontSize: 7, cellPadding: { left: 1, right: 3, top: 2, bottom: 2 } },
        5: { cellWidth: 26, halign: 'center', lineWidth: 0.5, lineColor: [0, 0, 0] }
      },
      alternateRowStyles: {
        fillColor: [250, 250, 250]
      },
      rowPageBreak: 'avoid',
      didDrawCell: (data) => {
        // Dibujar imagen de barcode en la columna 1 (índice 1)
        if (data.section === 'body' && data.column.index === 1) {
          const barcodeValue = data.cell.raw as string;
          const barcodeImg = barcodeImages[barcodeValue];
          
          if (barcodeImg) {
            const cellWidth = data.cell.width;
            const cellHeight = data.cell.height;
            const imgWidth = cellWidth - 4;
            const imgHeight = cellHeight - 2;
            
            doc.addImage(
              barcodeImg,
              'PNG',
              data.cell.x + 2,
              data.cell.y + 1,
              imgWidth,
              imgHeight
            );
          }
        }
        
        // Remarcar la casilla de cantidad con borde más grueso
        if (data.section === 'body' && data.column.index === 5) {
          doc.setDrawColor(0, 0, 0);
          doc.setLineWidth(0.5);
          doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, 'S');
        }
      },
      didParseCell: (data) => {
        // Aumentar altura de las filas para las imágenes de barcode
        if (data.section === 'body') {
          data.cell.styles.minCellHeight = 12;
        }
        // Limpiar el texto del barcode ya que mostraremos la imagen
        if (data.section === 'body' && data.column.index === 1) {
          data.cell.text = [];
        }
        // Evitar saltos de línea en columnas #, categoría y unidad
        if (data.section === 'body' && (data.column.index === 0 || data.column.index === 3 || data.column.index === 4)) {
          data.cell.styles.overflow = 'visible';
        }
      },
      didDrawPage: (data) => {
        // Los números de página se agregan después de generar toda la tabla
      }
    });
    
    // Agregar números de página después de generar toda la tabla
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text(
        `Página ${i} de ${totalPages}`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 10,
        { align: 'center' }
      );
    }
    
    // Agregar sección de firmas en la última página
    doc.setPage(totalPages);
    const finalY = (doc as any).lastAutoTable.finalY || 200;
    if (finalY < doc.internal.pageSize.getHeight() - 50) {
      doc.setTextColor(0);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Realizado por: _______________________________', 14, finalY + 15);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text('Nombre y firma', 14, finalY + 20);
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Supervisado por: _______________________________', pageWidth / 2 + 10, finalY + 15);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text('Nombre y firma', pageWidth / 2 + 10, finalY + 20);
    }
    
    // Guardar PDF
    const fileName = this.selectedCategory 
      ? `inventario_${this.selectedCategory.toLowerCase().replace(/\s+/g, '_')}_${this.formatDateForFile()}.pdf`
      : `inventario_fisico_${this.formatDateForFile()}.pdf`;
    
    doc.save(fileName);
    this.isGeneratingPdf = false;
  }

  private formatDateForFile(): string {
    const d = this.reportDate;
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  }

  formatDate(date: Date): string {
    return date.toLocaleDateString('es-CO', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }

  getTotalItems(): number {
    return this.products.reduce((sum, p) => sum + (p.presentations?.length || 0), 0);
  }
}
