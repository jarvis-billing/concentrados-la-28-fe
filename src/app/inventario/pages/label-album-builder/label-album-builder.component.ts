import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ProductoService } from '../../../producto/producto.service';
import { Product, Presentation, UnitMeasure } from '../../../producto/producto';
import JsBarcode from 'jsbarcode';
import jsPDF from 'jspdf';
import { toast } from 'ngx-sonner';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

const UNIT_ABBREVIATIONS: Record<string, string> = {
  [UnitMeasure.KILOGRAMOS]: 'Kg',
  [UnitMeasure.METROS]: 'm',
  [UnitMeasure.CENTIMETROS]: 'cm',
  [UnitMeasure.LITROS]: 'Lt',
  [UnitMeasure.MILILITROS]: 'CC',
  [UnitMeasure.UNIDAD]: 'Und'
};

export interface LabelItem {
  id: string;
  productId: string;
  productDescription: string;
  brand: string;
  category: string;
  barcode: string;
  label: string;
  salePrice: number;
  unitMeasure: UnitMeasure;
  isBulk: boolean;
  quantity: number;
}

export interface LabelConfig {
  showProductDescription: boolean;
  showBarcode: boolean;
  showPresentationLabel: boolean;
  showPrice: boolean;
}

@Component({
  selector: 'app-label-album-builder',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './label-album-builder.component.html',
  styleUrls: ['./label-album-builder.component.css']
})
export class LabelAlbumBuilderComponent implements OnInit {
  private productService = inject(ProductoService);

  readonly COMPANY_NAME = 'CONCENTRADOS LA 28';

  // Productos disponibles
  allProducts: Product[] = [];
  filteredProducts: Product[] = [];
  
  // Búsqueda
  searchTerm = '';
  searchSubject = new Subject<string>();
  
  // Filtros
  brands: string[] = [];
  categories: string[] = [];
  selectedBrand = '';
  selectedCategory = '';
  
  // Lienzo de etiquetas seleccionadas
  selectedLabels: LabelItem[] = [];
  
  // Estados
  isLoading = true;
  isGeneratingPdf = false;
  
  // Drag & Drop
  draggedItem: LabelItem | null = null;
  draggedFromCanvas = false;
  dragOverIndex: number | null = null;
  
  // Configuración del PDF
  columnsPerPage = 3;
  
  // Configuración de campos visibles en la etiqueta
  labelConfig: LabelConfig = {
    showProductDescription: true,
    showBarcode: true,
    showPresentationLabel: true,
    showPrice: true
  };
  
  showConfigPanel = false;
  
  // Panel expandido
  expandedProducts: Set<string> = new Set();

  ngOnInit(): void {
    this.loadProducts();
    this.setupSearch();
  }

  private setupSearch(): void {
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged()
    ).subscribe(() => {
      this.filterProducts();
    });
  }

  private loadProducts(): void {
    this.isLoading = true;
    this.productService.getAll().subscribe({
      next: (products) => {
        this.allProducts = products
          .filter(p => p.presentations && p.presentations.length > 0)
          .sort((a, b) => (a.description || '').localeCompare(b.description || ''));

        this.brands = [...new Set(
          this.allProducts
            .map(p => p.brand)
            .filter(b => b && b.trim() !== '')
        )].sort();

        this.categories = [...new Set(
          this.allProducts
            .map(p => p.category)
            .filter(c => c && c.trim() !== '')
        )].sort();

        this.filterProducts();
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading products:', error);
        toast.error('Error al cargar productos');
        this.isLoading = false;
      }
    });
  }

  private filterProducts(): void {
    let filtered = [...this.allProducts];

    if (this.selectedBrand) {
      filtered = filtered.filter(p => p.brand === this.selectedBrand);
    }
    if (this.selectedCategory) {
      filtered = filtered.filter(p => p.category === this.selectedCategory);
    }
    if (this.searchTerm.trim()) {
      const term = this.searchTerm.toLowerCase().trim();
      filtered = filtered.filter(p =>
        (p.description || '').toLowerCase().includes(term) ||
        (p.brand || '').toLowerCase().includes(term) ||
        (p.category || '').toLowerCase().includes(term) ||
        p.presentations?.some(pres =>
          (pres.barcode || '').toLowerCase().includes(term) ||
          (pres.label || '').toLowerCase().includes(term)
        )
      );
    }

    this.filteredProducts = filtered;
  }

  onSearchChange(): void {
    this.searchSubject.next(this.searchTerm);
  }

  onFilterChange(): void {
    this.filterProducts();
  }

  clearFilters(): void {
    this.selectedBrand = '';
    this.selectedCategory = '';
    this.searchTerm = '';
    this.filterProducts();
  }

  toggleProduct(productId: string): void {
    if (this.expandedProducts.has(productId)) {
      this.expandedProducts.delete(productId);
    } else {
      this.expandedProducts.add(productId);
    }
  }

  isProductExpanded(productId: string): boolean {
    return this.expandedProducts.has(productId);
  }

  // === DRAG & DROP ===
  
  onDragStartPresentation(event: DragEvent, product: Product, presentation: Presentation): void {
    const labelItem: LabelItem = {
      id: `${product.id}-${presentation.barcode}-${Date.now()}`,
      productId: product.id,
      productDescription: product.description,
      brand: product.brand || '',
      category: product.category || '',
      barcode: presentation.barcode,
      label: presentation.label || '',
      salePrice: presentation.salePrice,
      unitMeasure: presentation.unitMeasure,
      isBulk: presentation.isBulk || false,
      quantity: 1
    };
    
    this.draggedItem = labelItem;
    this.draggedFromCanvas = false;
    
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer.setData('text/plain', JSON.stringify(labelItem));
    }
  }

  onDragStartFromCanvas(event: DragEvent, item: LabelItem, index: number): void {
    this.draggedItem = item;
    this.draggedFromCanvas = true;
    
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', JSON.stringify({ index }));
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = this.draggedFromCanvas ? 'move' : 'copy';
    }
  }

  onDragOverItem(event: DragEvent, index: number): void {
    event.preventDefault();
    this.dragOverIndex = index;
  }

  onDragLeaveItem(): void {
    this.dragOverIndex = null;
  }

  onDropOnCanvas(event: DragEvent): void {
    event.preventDefault();
    
    if (this.draggedItem && !this.draggedFromCanvas) {
      // Agregar nuevo item al canvas
      this.selectedLabels.push({ ...this.draggedItem });
      toast.success(`Etiqueta agregada: ${this.draggedItem.label || this.draggedItem.barcode}`);
    }
    
    this.resetDragState();
  }

  onDropOnItem(event: DragEvent, targetIndex: number): void {
    event.preventDefault();
    event.stopPropagation();
    
    if (this.draggedItem && this.draggedFromCanvas) {
      // Reordenar dentro del canvas
      const currentIndex = this.selectedLabels.findIndex(l => l.id === this.draggedItem!.id);
      if (currentIndex !== -1 && currentIndex !== targetIndex) {
        const [removed] = this.selectedLabels.splice(currentIndex, 1);
        this.selectedLabels.splice(targetIndex, 0, removed);
      }
    } else if (this.draggedItem) {
      // Insertar nuevo item en posición específica
      this.selectedLabels.splice(targetIndex, 0, { ...this.draggedItem });
      toast.success(`Etiqueta insertada: ${this.draggedItem.label || this.draggedItem.barcode}`);
    }
    
    this.resetDragState();
  }

  onDragEnd(): void {
    this.resetDragState();
  }

  private resetDragState(): void {
    this.draggedItem = null;
    this.draggedFromCanvas = false;
    this.dragOverIndex = null;
  }

  // === ACCIONES DEL CANVAS ===

  addPresentationToCanvas(product: Product, presentation: Presentation): void {
    const labelItem: LabelItem = {
      id: `${product.id}-${presentation.barcode}-${Date.now()}`,
      productId: product.id,
      productDescription: product.description,
      brand: product.brand || '',
      category: product.category || '',
      barcode: presentation.barcode,
      label: presentation.label || '',
      salePrice: presentation.salePrice,
      unitMeasure: presentation.unitMeasure,
      isBulk: presentation.isBulk || false,
      quantity: 1
    };
    
    this.selectedLabels.push(labelItem);
    toast.success(`Etiqueta agregada: ${labelItem.label || labelItem.barcode}`);
  }

  removeFromCanvas(index: number): void {
    const removed = this.selectedLabels.splice(index, 1)[0];
    toast.info(`Etiqueta eliminada: ${removed.label || removed.barcode}`);
  }

  updateQuantity(index: number, delta: number): void {
    const item = this.selectedLabels[index];
    const newQty = item.quantity + delta;
    if (newQty >= 1 && newQty <= 100) {
      item.quantity = newQty;
    }
  }

  duplicateItem(index: number): void {
    const item = this.selectedLabels[index];
    const newItem: LabelItem = {
      ...item,
      id: `${item.productId}-${item.barcode}-${Date.now()}`
    };
    this.selectedLabels.splice(index + 1, 0, newItem);
  }

  moveItem(index: number, direction: 'up' | 'down'): void {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex >= 0 && newIndex < this.selectedLabels.length) {
      const [item] = this.selectedLabels.splice(index, 1);
      this.selectedLabels.splice(newIndex, 0, item);
    }
  }

  clearCanvas(): void {
    if (this.selectedLabels.length === 0) return;
    
    toast('¿Limpiar todas las etiquetas del lienzo?', {
      action: {
        label: 'Confirmar',
        onClick: () => {
          this.selectedLabels = [];
          toast.success('Lienzo limpiado');
        }
      }
    });
  }

  getTotalLabels(): number {
    return this.selectedLabels.reduce((sum, item) => sum + item.quantity, 0);
  }

  getUnitAbbreviation(unitMeasure: UnitMeasure): string {
    return UNIT_ABBREVIATIONS[unitMeasure] || unitMeasure;
  }

  formatPrice(price: number, isBulk: boolean, unitMeasure: UnitMeasure): string {
    const formatted = new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(price);
    
    if (isBulk) {
      return `${formatted}/${this.getUnitAbbreviation(unitMeasure)}`;
    }
    return formatted;
  }

  // === GENERACIÓN DE PDF ===

  generatePdf(): void {
    if (this.selectedLabels.length === 0) {
      toast.warning('Agregue etiquetas al lienzo antes de generar el PDF');
      return;
    }

    this.isGeneratingPdf = true;
    toast.info('Generando PDF de etiquetas...');

    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'letter'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 10;
      const contentWidth = pageWidth - (margin * 2);
      
      // Configuración de etiquetas
      const labelWidth = (contentWidth - 10) / this.columnsPerPage;
      const labelHeight = 45;
      const gapX = 5;
      const gapY = 5;
      
      // Agrupar etiquetas por marca y categoría
      const groupedLabels = this.groupLabelsByBrandAndCategory();
      
      let currentY = margin;
      let isFirstPage = true;
      let totalLabels = 0;

      // Iterar por cada marca
      for (const [brand, categories] of groupedLabels) {
        // Nueva página para cada marca (excepto la primera)
        if (!isFirstPage) {
          doc.addPage();
          currentY = margin;
        }
        isFirstPage = false;

        // Título de la marca (naranja)
        doc.setFillColor(255, 140, 0);
        doc.rect(margin, currentY, contentWidth, 12, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(brand.toUpperCase(), pageWidth / 2, currentY + 8, { align: 'center' });
        currentY += 16;

        // Iterar por cada categoría dentro de la marca
        for (const [category, labels] of categories) {
          // Verificar espacio para el subtítulo de categoría
          if (currentY + 20 > pageHeight - margin) {
            doc.addPage();
            currentY = margin;
            
            // Repetir título de marca en nueva página
            doc.setFillColor(255, 140, 0);
            doc.rect(margin, currentY, contentWidth, 10, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text(brand.toUpperCase(), pageWidth / 2, currentY + 7, { align: 'center' });
            currentY += 14;
          }

          // Subtítulo de categoría (amarillo)
          doc.setFillColor(255, 193, 7);
          doc.rect(margin, currentY, contentWidth, 8, 'F');
          doc.setTextColor(33, 37, 41);
          doc.setFontSize(10);
          doc.setFont('helvetica', 'bold');
          doc.text(category.toUpperCase(), margin + 5, currentY + 5.5);
          currentY += 12;

          // Dibujar etiquetas de esta categoría
          let currentX = margin;
          let colIndex = 0;

          labels.forEach((item) => {
            // Nueva página si es necesario
            if (currentY + labelHeight > pageHeight - margin) {
              doc.addPage();
              currentY = margin;
              currentX = margin;
              colIndex = 0;
              
              // Repetir encabezados en nueva página
              doc.setFillColor(255, 140, 0);
              doc.rect(margin, currentY, contentWidth, 10, 'F');
              doc.setTextColor(255, 255, 255);
              doc.setFontSize(12);
              doc.setFont('helvetica', 'bold');
              doc.text(brand.toUpperCase(), pageWidth / 2, currentY + 7, { align: 'center' });
              currentY += 14;

              doc.setFillColor(255, 193, 7);
              doc.rect(margin, currentY, contentWidth, 8, 'F');
              doc.setTextColor(33, 37, 41);
              doc.setFontSize(10);
              doc.text(category.toUpperCase(), margin + 5, currentY + 5.5);
              currentY += 12;
            }

            // Dibujar etiqueta
            this.drawLabel(doc, item, currentX, currentY, labelWidth, labelHeight);
            totalLabels++;

            // Siguiente posición
            colIndex++;
            if (colIndex >= this.columnsPerPage) {
              colIndex = 0;
              currentX = margin;
              currentY += labelHeight + gapY;
            } else {
              currentX += labelWidth + gapX;
            }
          });

          // Asegurar que la siguiente categoría empiece en nueva fila
          if (colIndex > 0) {
            currentY += labelHeight + gapY;
          }
          currentY += 4; // Espacio extra entre categorías
        }
      }

      // Guardar PDF
      const timestamp = new Date().toISOString().slice(0, 10);
      doc.save(`etiquetas-${timestamp}.pdf`);
      toast.success(`PDF generado con ${totalLabels} etiquetas`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Error al generar el PDF');
    } finally {
      this.isGeneratingPdf = false;
    }
  }

  private groupLabelsByBrandAndCategory(): Map<string, Map<string, LabelItem[]>> {
    const grouped = new Map<string, Map<string, LabelItem[]>>();
    
    // Expandir etiquetas según cantidad y agrupar
    this.selectedLabels.forEach(item => {
      const brand = item.brand || 'Sin Marca';
      const category = item.category || 'Sin Categoría';
      
      if (!grouped.has(brand)) {
        grouped.set(brand, new Map());
      }
      const brandMap = grouped.get(brand)!;
      
      if (!brandMap.has(category)) {
        brandMap.set(category, []);
      }
      
      // Agregar según cantidad
      for (let i = 0; i < item.quantity; i++) {
        brandMap.get(category)!.push(item);
      }
    });
    
    return grouped;
  }

  private drawLabel(doc: jsPDF, item: LabelItem, x: number, y: number, width: number, height: number): void {
    // Borde de la etiqueta
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.3);
    doc.rect(x, y, width, height);

    // Calcular posiciones dinámicas según campos visibles
    let currentY = y + 3;
    const centerX = x + width / 2;
    const maxTextWidth = width - 6;

    // Nombre del producto (arriba)
    if (this.labelConfig.showProductDescription) {
      doc.setFontSize(6);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(33, 37, 41);
      const productText = doc.splitTextToSize(item.productDescription, maxTextWidth);
      doc.text(productText.slice(0, 2), centerX, currentY + 3, { align: 'center' });
      currentY += productText.slice(0, 2).length * 3 + 2;
    }

    // Código de barras
    if (this.labelConfig.showBarcode) {
      try {
        const canvas = document.createElement('canvas');
        JsBarcode(canvas, item.barcode, {
          format: 'CODE128',
          width: 1.5,
          height: 40,
          displayValue: true,
          fontSize: 12,
          margin: 2
        });
        const barcodeDataUrl = canvas.toDataURL('image/png');
        
        const barcodeWidth = width - 10;
        const barcodeHeight = 16;
        const barcodeX = x + (width - barcodeWidth) / 2;
        doc.addImage(barcodeDataUrl, 'PNG', barcodeX, currentY, barcodeWidth, barcodeHeight);
        currentY += barcodeHeight + 2;
      } catch (e) {
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        doc.text(item.barcode, centerX, currentY + 8, { align: 'center' });
        currentY += 10;
      }
    }

    // Label de presentación (truncado para evitar desbordamiento)
    if (this.labelConfig.showPresentationLabel) {
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(33, 37, 41);
      let labelText = item.label || 'Sin etiqueta';
      // Truncar si es muy largo
      const labelLines = doc.splitTextToSize(labelText, maxTextWidth);
      doc.text(labelLines.slice(0, 2), centerX, currentY + 3, { align: 'center' });
      currentY += labelLines.slice(0, 2).length * 3 + 2;
    }

    // Precio
    if (this.labelConfig.showPrice) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(25, 135, 84); // Verde
      const priceText = this.formatPrice(item.salePrice, item.isBulk, item.unitMeasure);
      doc.text(priceText, centerX, currentY + 4, { align: 'center' });
    }
  }

  toggleConfigPanel(): void {
    this.showConfigPanel = !this.showConfigPanel;
  }

  getActiveFieldsCount(): number {
    return Object.values(this.labelConfig).filter(v => v).length;
  }
}
