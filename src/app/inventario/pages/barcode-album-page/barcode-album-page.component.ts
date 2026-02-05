import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ProductoService } from '../../../producto/producto.service';
import { Product, Presentation, UnitMeasure, ESaleType } from '../../../producto/producto';
import JsBarcode from 'jsbarcode';
import jsPDF from 'jspdf';
import { toast } from 'ngx-sonner';

// Mapa de abreviaturas para unidades de medida
const UNIT_ABBREVIATIONS: Record<string, string> = {
  [UnitMeasure.KILOGRAMOS]: 'Kg',
  [UnitMeasure.METROS]: 'm',
  [UnitMeasure.CENTIMETROS]: 'cm',
  [UnitMeasure.LITROS]: 'Lt',
  [UnitMeasure.MILILITROS]: 'CC',
  [UnitMeasure.UNIDAD]: 'Und'
};

// Estructura para agrupar productos por marca y categoría
interface BrandGroup {
  brand: string;
  categories: CategoryGroup[];
}

interface CategoryGroup {
  category: string;
  products: ProductWithPresentations[];
}

interface ProductWithPresentations {
  description: string;
  saleType: ESaleType;
  presentations: PresentationData[];
}

interface PresentationData {
  barcode: string;
  label: string;
  salePrice: number;
  unitMeasure: UnitMeasure;
  isBulk: boolean;
  isFixedAmount: boolean;
  fixedAmount: number;
}

@Component({
  selector: 'app-barcode-album-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './barcode-album-page.component.html',
  styleUrls: ['./barcode-album-page.component.css']
})
export class BarcodeAlbumPageComponent implements OnInit {
  private productService = inject(ProductoService);

  readonly COMPANY_NAME = 'CONCENTRADOS LA 28';

  allProducts: Product[] = [];
  brandGroups: BrandGroup[] = [];
  brands: string[] = [];
  categories: string[] = [];
  
  selectedBrand = '';
  selectedCategory = '';
  searchTerm = '';
  
  isLoading = true;
  isGeneratingPdf = false;

  // Configuración del PDF
  columnsPerPage = 3; // Presentaciones por fila

  ngOnInit(): void {
    this.loadProducts();
  }

  private loadProducts(): void {
    this.isLoading = true;
    this.productService.getAll().subscribe({
      next: (products) => {
        this.allProducts = products
          .filter(p => p.presentations && p.presentations.length > 0)
          .sort((a, b) => (a.brand || '').localeCompare(b.brand || ''));

        // Extraer marcas únicas
        this.brands = [...new Set(
          this.allProducts
            .map(p => p.brand)
            .filter(b => b && b.trim() !== '')
        )].sort();

        // Extraer categorías únicas
        this.categories = [...new Set(
          this.allProducts
            .map(p => p.category)
            .filter(c => c && c.trim() !== '')
        )].sort();

        this.buildBrandGroups();
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading products:', error);
        toast.error('Error al cargar productos');
        this.isLoading = false;
      }
    });
  }

  private buildBrandGroups(): void {
    let filtered = [...this.allProducts];

    // Aplicar filtros
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

    // Actualizar listas de marcas y categorías basadas en productos filtrados
    this.updateAvailableFilters(filtered);

    // Agrupar por marca
    const brandMap = new Map<string, Map<string, ProductWithPresentations[]>>();

    filtered.forEach(product => {
      const brand = product.brand || 'Sin Marca';
      const category = product.category || 'Sin Categoría';

      if (!brandMap.has(brand)) {
        brandMap.set(brand, new Map());
      }
      const categoryMap = brandMap.get(brand)!;

      if (!categoryMap.has(category)) {
        categoryMap.set(category, []);
      }

      const presentations: PresentationData[] = (product.presentations || []).map(pres => ({
        barcode: pres.barcode,
        label: pres.label || '',
        salePrice: pres.salePrice,
        unitMeasure: pres.unitMeasure,
        isBulk: pres.isBulk || false,
        isFixedAmount: pres.isFixedAmount || false,
        fixedAmount: pres.fixedAmount || 0
      }));

      // Ordenar presentaciones: bulto completo, medio bulto, granel
      presentations.sort((a, b) => this.getPresentationOrder(a) - this.getPresentationOrder(b));

      categoryMap.get(category)!.push({
        description: product.description,
        saleType: product.saleType,
        presentations
      });
    });

    // Convertir a array
    this.brandGroups = [];
    brandMap.forEach((categoryMap, brand) => {
      const categories: CategoryGroup[] = [];
      categoryMap.forEach((products, category) => {
        categories.push({
          category,
          products: products.sort((a, b) => a.description.localeCompare(b.description))
        });
      });
      categories.sort((a, b) => a.category.localeCompare(b.category));
      this.brandGroups.push({ brand, categories });
    });
    this.brandGroups.sort((a, b) => a.brand.localeCompare(b.brand));
  }

  private updateAvailableFilters(filtered: Product[]): void {
    // Si hay una marca seleccionada, mostrar solo categorías de esa marca
    // Si hay una categoría seleccionada, mostrar solo marcas con esa categoría
    
    if (!this.selectedBrand && !this.selectedCategory) {
      // Sin filtros: mostrar todas las marcas y categorías con productos
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
    } else if (this.selectedBrand && !this.selectedCategory) {
      // Marca seleccionada: mostrar solo categorías de esa marca
      const productsOfBrand = this.allProducts.filter(p => p.brand === this.selectedBrand);
      this.categories = [...new Set(
        productsOfBrand
          .map(p => p.category)
          .filter(c => c && c.trim() !== '')
      )].sort();
    } else if (!this.selectedBrand && this.selectedCategory) {
      // Categoría seleccionada: mostrar solo marcas con esa categoría
      const productsOfCategory = this.allProducts.filter(p => p.category === this.selectedCategory);
      this.brands = [...new Set(
        productsOfCategory
          .map(p => p.brand)
          .filter(b => b && b.trim() !== '')
      )].sort();
    }
    // Si ambos están seleccionados, mantener las listas actuales
  }

  onBrandChange(): void {
    this.buildBrandGroups();
  }

  onCategoryChange(): void {
    this.buildBrandGroups();
  }

  onSearchChange(): void {
    this.buildBrandGroups();
  }

  clearFilters(): void {
    this.selectedBrand = '';
    this.selectedCategory = '';
    this.searchTerm = '';
    this.buildBrandGroups();
  }

  getUnitAbbreviation(unitMeasure: UnitMeasure): string {
    return UNIT_ABBREVIATIONS[unitMeasure] || unitMeasure;
  }

  // Orden de presentaciones: bulto completo, medio bulto, granel AL FINAL
  private getPresentationOrder(pres: PresentationData): number {
    const label = (pres.label || '').toLowerCase();
    
    // Bulto completo tiene prioridad más alta (menor número = primero)
    if (pres.isFixedAmount && pres.fixedAmount > 0) {
      // Ordenar por fixedAmount descendente (bulto completo antes que medio bulto)
      // Usar 100 - (fixedAmount/10) para que mayor cantidad = menor orden
      return 100 - Math.min(pres.fixedAmount / 10, 99);
    }
    
    // Detectar por label si no tiene isFixedAmount
    if (label.includes('bulto') && !label.includes('medio')) {
      return 100; // Bulto completo
    }
    if (label.includes('medio') || label.includes('1/2')) {
      return 200; // Medio bulto
    }
    
    // Otras presentaciones
    if (!pres.isBulk) {
      return 300;
    }
    
    // Granel AL FINAL
    return 900;
  }

  // Generar ID seguro para acordeones (sin espacios ni caracteres especiales)
  getSafeId(text: string): string {
    return text
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-');
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

  getTotalProducts(): number {
    return this.brandGroups.reduce((total, bg) => 
      total + bg.categories.reduce((catTotal, cat) => catTotal + cat.products.length, 0), 0);
  }

  getTotalPresentations(): number {
    return this.brandGroups.reduce((total, bg) => 
      total + bg.categories.reduce((catTotal, cat) => 
        catTotal + cat.products.reduce((prodTotal, prod) => prodTotal + prod.presentations.length, 0), 0), 0);
  }

  generatePdf(): void {
    if (this.brandGroups.length === 0) {
      toast.warning('No hay productos para generar el álbum');
      return;
    }

    this.isGeneratingPdf = true;
    toast.info('Generando PDF del álbum de códigos de barras...');

    try {
      // Crear PDF tamaño carta
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'letter'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;
      const contentWidth = pageWidth - (margin * 2);
      
      let currentY = margin;
      let isFirstPage = true;

      this.brandGroups.forEach((brandGroup, brandIndex) => {
        // Nueva página para cada marca (excepto la primera)
        if (!isFirstPage) {
          doc.addPage();
          currentY = margin;
        }
        isFirstPage = false;

        // === ENCABEZADO DE MARCA === (Naranja del almacén)
        doc.setFillColor(255, 140, 0); // Naranja #ff8c00
        doc.rect(margin, currentY, contentWidth, 14, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text(brandGroup.brand.toUpperCase(), pageWidth / 2, currentY + 9, { align: 'center' });
        currentY += 18;

        brandGroup.categories.forEach((categoryGroup, catIndex) => {
          // Verificar espacio para categoría
          if (currentY > pageHeight - 60) {
            doc.addPage();
            currentY = margin;
          }

          // === SECCIÓN DE CATEGORÍA === (Amarillo del almacén)
          doc.setFillColor(255, 193, 7); // Amarillo #ffc107
          doc.rect(margin, currentY, contentWidth, 10, 'F');
          doc.setTextColor(33, 37, 41); // Texto oscuro para contraste
          doc.setFontSize(12);
          doc.setFont('helvetica', 'bold');
          doc.text(categoryGroup.category.toUpperCase(), margin + 5, currentY + 7);
          currentY += 14;

          categoryGroup.products.forEach((product, prodIndex) => {
            // Verificar espacio para producto
            const estimatedHeight = 15 + (Math.ceil(product.presentations.length / this.columnsPerPage) * 45);
            if (currentY + estimatedHeight > pageHeight - margin) {
              doc.addPage();
              currentY = margin;
              
              // Repetir encabezado de marca y categoría en nueva página
              doc.setFillColor(255, 140, 0); // Naranja
              doc.rect(margin, currentY, contentWidth, 10, 'F');
              doc.setTextColor(255, 255, 255);
              doc.setFontSize(14);
              doc.setFont('helvetica', 'bold');
              doc.text(`${brandGroup.brand.toUpperCase()} (cont.)`, pageWidth / 2, currentY + 7, { align: 'center' });
              currentY += 14;

              doc.setFillColor(255, 193, 7); // Amarillo
              doc.rect(margin, currentY, contentWidth, 8, 'F');
              doc.setTextColor(33, 37, 41);
              doc.setFontSize(10);
              doc.text(`${categoryGroup.category.toUpperCase()} (cont.)`, margin + 5, currentY + 5.5);
              currentY += 12;
            }

            // === DESCRIPCIÓN DEL PRODUCTO ===
            doc.setFillColor(248, 249, 250); // bg-light
            doc.rect(margin, currentY, contentWidth, 8, 'F');
            doc.setTextColor(33, 37, 41);
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text(product.description, margin + 3, currentY + 5.5);
            currentY += 10;

            // === PRESENTACIONES EN COLUMNAS ===
            const colWidth = contentWidth / this.columnsPerPage;
            const presentations = product.presentations;
            
            for (let i = 0; i < presentations.length; i += this.columnsPerPage) {
              const rowPresentations = presentations.slice(i, i + this.columnsPerPage);
              const rowStartY = currentY;
              
              rowPresentations.forEach((pres, colIndex) => {
                const colX = margin + (colIndex * colWidth);
                const cellWidth = colWidth - 4;
                const cellHeight = 52; // Aumentar altura de celda
                
                // Borde de la celda
                doc.setDrawColor(200, 200, 200);
                doc.setLineWidth(0.3);
                doc.rect(colX + 2, rowStartY, cellWidth, cellHeight);

                // Generar código de barras
                try {
                  const canvas = document.createElement('canvas');
                  JsBarcode(canvas, pres.barcode, {
                    format: 'CODE128',
                    width: 2,
                    height: 50,
                    displayValue: true,
                    fontSize: 14,
                    margin: 5
                  });
                  const barcodeDataUrl = canvas.toDataURL('image/png');
                  
                  // Centrar el código de barras
                  const barcodeWidth = cellWidth - 8;
                  const barcodeHeight = 18;
                  const barcodeX = colX + 2 + (cellWidth - barcodeWidth) / 2;
                  doc.addImage(barcodeDataUrl, 'PNG', barcodeX, rowStartY + 2, barcodeWidth, barcodeHeight);
                } catch (e) {
                  // Si falla el barcode, mostrar el código como texto
                  doc.setFontSize(8);
                  doc.setTextColor(100, 100, 100);
                  doc.text(pres.barcode, colX + 2 + cellWidth / 2, rowStartY + 12, { align: 'center' });
                }

                // Label de la presentación (usar splitTextToSize para manejar texto largo)
                doc.setFontSize(9);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(33, 37, 41);
                const labelText = pres.label || 'Sin etiqueta';
                const splitLabel = doc.splitTextToSize(labelText, cellWidth - 6);
                const labelY = rowStartY + 24;
                doc.text(splitLabel, colX + 2 + cellWidth / 2, labelY, { align: 'center' });

                // Precio - posición fija en la parte inferior de la celda
                doc.setFontSize(12);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(25, 135, 84); // text-success
                const priceText = this.formatPrice(pres.salePrice, pres.isBulk, pres.unitMeasure);
                doc.text(priceText, colX + 2 + cellWidth / 2, rowStartY + cellHeight - 4, { align: 'center' });
              });

              currentY += 56; // Aumentar espacio para la nueva altura
            }

            currentY += 4; // Espacio entre productos
          });

          currentY += 6; // Espacio entre categorías
        });
      });

      // Guardar PDF
      const fileName = this.selectedBrand 
        ? `album-barcodes-${this.selectedBrand.toLowerCase().replace(/\s+/g, '-')}.pdf`
        : 'album-barcodes-completo.pdf';
      
      doc.save(fileName);
      toast.success('PDF generado exitosamente');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Error al generar el PDF');
    } finally {
      this.isGeneratingPdf = false;
    }
  }
}
