import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import { ProductoService } from '../../../producto/producto.service';
import { CatalogService }  from '../../../producto/catalog.service';
import { Product, SaleTypeLabels, UnitMeasureLabels, UnitMeasure } from '../../../producto/producto';

/** Fila aplanada para la tabla y el PDF */
export interface StockRow {
    productId:   string;
    description: string;
    brand:       string;
    category:    string;
    saleType:    string;
    productCode: string;
    barcode:     string;
    label:       string;
    unitMeasure: string;
    stockQty:    number;
    stockUnit:   string;
    stockDisplay:string;   // texto legible (ej. "12 bultos + 8 kg")
    salePrice:   number;
    costPrice:   number;
}

@Component({
    selector: 'app-stock-report-page',
    standalone: true,
    imports: [CommonModule, FormsModule, CurrencyPipe],
    templateUrl: './stock-report-page.component.html',
    styleUrl: './stock-report-page.component.css'
})
export class StockReportPageComponent implements OnInit {

    private productService = inject(ProductoService);
    private catalogService  = inject(CatalogService);

    // ─── Datos crudos ─────────────────────────────────────────────
    allProducts:  Product[]   = [];
    allRows:      StockRow[]  = [];
    filteredRows: StockRow[]  = [];

    // ─── Catálogos para filtros ───────────────────────────────────
    categories: string[] = [];
    brands:     string[] = [];

    // ─── Filtros ─────────────────────────────────────────────────
    filterCategory   = '';
    filterBrand      = '';
    filterSearch     = '';          // descripción o barcode
    searchSuggestions: string[] = [];
    showSuggestions  = false;

    // ─── Estado ──────────────────────────────────────────────────
    isLoading        = false;
    isGeneratingPdf  = false;
    sortField: keyof StockRow = 'description';
    sortDir: 'asc' | 'desc'   = 'asc';

    // ─── Totales ─────────────────────────────────────────────────
    get totalProducts(): number { return new Set(this.filteredRows.map(r => r.productId)).size; }
    get totalPresentations(): number { return this.filteredRows.length; }

    ngOnInit(): void {
        this.catalogService.categories$.subscribe(c => this.categories = c ?? []);
        this.catalogService.brands$.subscribe(b => this.brands = b ?? []);
        this.load();
    }

    // ─── Carga ────────────────────────────────────────────────────

    load(): void {
        this.isLoading = true;
        this.productService.getAll().subscribe({
            next: products => {
                this.allProducts = products;
                this.allRows     = this.flatten(products);
                this.apply();
                this.isLoading = false;
            },
            error: () => { this.isLoading = false; }
        });
    }

    private flatten(products: Product[]): StockRow[] {
        const rows: StockRow[] = [];
        for (const p of products) {
            if (!p.presentations?.length) continue;
            const stockUnit = (UnitMeasureLabels as any)[p.stock?.unitMeasure] ?? p.stock?.unitMeasure ?? '';
            const stockQty  = p.stock?.quantity ?? 0;
            const stockDisplay = p.displayStock?.label ?? `${stockQty} ${stockUnit}`;

            for (const pres of p.presentations) {
                rows.push({
                    productId:    p.id,
                    description:  p.description ?? '',
                    brand:        p.brand ?? '',
                    category:     p.category ?? '',
                    saleType:     (SaleTypeLabels as any)[p.saleType] ?? p.saleType,
                    productCode:  p.productCode ?? '',
                    barcode:      pres.barcode ?? '',
                    label:        pres.label ?? '',
                    unitMeasure:  (UnitMeasureLabels as any)[pres.unitMeasure] ?? pres.unitMeasure ?? '',
                    stockQty,
                    stockUnit,
                    stockDisplay,
                    salePrice:    Number(pres.salePrice) ?? 0,
                    costPrice:    Number(pres.costPrice) ?? 0,
                });
            }
        }
        return rows;
    }

    // ─── Filtros y ordenamiento ───────────────────────────────────

    apply(): void {
        const cat    = this.filterCategory.toLowerCase();
        const brand  = this.filterBrand.toLowerCase();
        const search = this.filterSearch.trim().toLowerCase();

        this.filteredRows = this.allRows.filter(r => {
            if (cat   && !r.category.toLowerCase().includes(cat))   return false;
            if (brand && !r.brand.toLowerCase().includes(brand))     return false;
            if (search) {
                const matchDesc   = r.description.toLowerCase().includes(search);
                const matchLabel  = r.label.toLowerCase().includes(search);
                const matchBarcode= r.barcode.toLowerCase().includes(search);
                const matchCode   = r.productCode.toLowerCase().includes(search);
                if (!matchDesc && !matchLabel && !matchBarcode && !matchCode) return false;
            }
            return true;
        });
        this.sortRows();
    }

    clearFilters(): void {
        this.filterCategory = '';
        this.filterBrand    = '';
        this.filterSearch   = '';
        this.showSuggestions = false;
        this.apply();
    }

    // ─── Autocomplete descripción / barcode ───────────────────────

    onSearchInput(): void {
        const q = this.filterSearch.trim().toLowerCase();
        if (q.length < 2) { this.showSuggestions = false; this.apply(); return; }

        const seen = new Set<string>();
        this.searchSuggestions = [];
        for (const r of this.allRows) {
            const desc = r.description;
            if (desc.toLowerCase().includes(q) && !seen.has(desc)) {
                seen.add(desc); this.searchSuggestions.push(desc);
            }
            const bc = r.barcode;
            if (bc.toLowerCase().includes(q) && !seen.has(bc)) {
                seen.add(bc); this.searchSuggestions.push(bc);
            }
            if (this.searchSuggestions.length >= 8) break;
        }
        this.showSuggestions = this.searchSuggestions.length > 0;
        this.apply();
    }

    selectSuggestion(s: string): void {
        this.filterSearch    = s;
        this.showSuggestions = false;
        this.apply();
    }

    // ─── Ordenamiento ─────────────────────────────────────────────

    sortBy(field: keyof StockRow): void {
        if (this.sortField === field) this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
        else { this.sortField = field; this.sortDir = 'asc'; }
        this.sortRows();
    }

    private sortRows(): void {
        const dir = this.sortDir === 'asc' ? 1 : -1;
        this.filteredRows = [...this.filteredRows].sort((a, b) => {
            const av = String(a[this.sortField] ?? '');
            const bv = String(b[this.sortField] ?? '');
            return av.localeCompare(bv, 'es', { numeric: true }) * dir;
        });
    }

    sortIcon(field: keyof StockRow): string {
        if (this.sortField !== field) return 'bi-arrow-down-up text-muted';
        return this.sortDir === 'asc' ? 'bi-arrow-up' : 'bi-arrow-down';
    }

    // ─── Helpers ─────────────────────────────────────────────────

    stockClass(qty: number): string {
        if (qty <= 0)   return 'text-danger fw-bold';
        if (qty <= 10)  return 'text-warning fw-semibold';
        return 'text-success';
    }

    stockBadge(qty: number): string {
        if (qty <= 0)  return 'bg-danger';
        if (qty <= 10) return 'bg-warning text-dark';
        return 'bg-success';
    }

    stockLabel(qty: number): string {
        if (qty <= 0)  return 'Sin stock';
        if (qty <= 10) return 'Stock bajo';
        return 'En stock';
    }

    fmt(v: number): string {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency', currency: 'COP', minimumFractionDigits: 0
        }).format(v);
    }

    // ─── PDF ──────────────────────────────────────────────────────

    generatePdf(): void {
        if (!this.filteredRows.length) return;
        this.isGeneratingPdf = true;

        try {
            const doc  = new jsPDF('landscape', 'mm', 'letter');
            const W    = doc.internal.pageSize.getWidth();
            const H    = doc.internal.pageSize.getHeight();
            const ML   = 10, MR = 10;
            const PRIMARY: [number,number,number]  = [33,37,41];
            const SUCCESS: [number,number,number]  = [25,135,84];
            const WARNING: [number,number,number]  = [255,193,7];
            const DANGER:  [number,number,number]  = [220,53,69];
            const LIGHT:   [number,number,number]  = [248,249,250];

            // Encabezado
            let y = 12;
            doc.setFontSize(16); doc.setFont('helvetica','bold'); doc.setTextColor(...PRIMARY);
            doc.text('REPORTE DE STOCKS DE INVENTARIO', W / 2, y, { align:'center' });
            y += 7;
            doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor(100);
            doc.text(`Generado: ${new Date().toLocaleString('es-CO')}`, W / 2, y, { align:'center' });
            y += 5;

            // Filtros aplicados
            const parts: string[] = [];
            if (this.filterCategory) parts.push(`Categoría: ${this.filterCategory}`);
            if (this.filterBrand)    parts.push(`Marca: ${this.filterBrand}`);
            if (this.filterSearch)   parts.push(`Búsqueda: "${this.filterSearch}"`);
            if (parts.length) {
                doc.setFontSize(8); doc.setTextColor(80);
                doc.text(`Filtros: ${parts.join(' | ')}`, W / 2, y, { align:'center' }); y += 5;
            }

            // Cards resumen
            const sinStock   = this.filteredRows.filter(r => r.stockQty <= 0).length;
            const stockBajo  = this.filteredRows.filter(r => r.stockQty > 0 && r.stockQty <= 10).length;
            const enStock    = this.filteredRows.filter(r => r.stockQty > 10).length;
            const cardW = (W - ML - MR) / 4 - 3, cardH = 14;
            const cards = [
                { label:'Presentaciones', value: String(this.totalPresentations), color: PRIMARY  },
                { label:'En stock',       value: String(enStock),                 color: SUCCESS  },
                { label:'Stock bajo',     value: String(stockBajo),               color: WARNING  },
                { label:'Sin stock',      value: String(sinStock),                color: DANGER   },
            ];
            cards.forEach((c, i) => {
                const x = ML + i * (cardW + 4);
                doc.setFillColor(...c.color); doc.roundedRect(x, y, cardW, cardH, 2, 2, 'F');
                doc.setFontSize(7); doc.setFont('helvetica','normal'); doc.setTextColor(255);
                doc.text(c.label, x + cardW/2, y + 4.5, { align:'center' });
                doc.setFontSize(11); doc.setFont('helvetica','bold');
                doc.text(c.value, x + cardW/2, y + 11, { align:'center' });
            });
            y += cardH + 6;

            // Tabla
            const rows = this.filteredRows.map(r => [
                r.description + (r.brand ? ` — ${r.brand}` : ''),
                r.label || r.barcode,
                r.barcode,
                r.category,
                r.saleType,
                r.stockDisplay,
                this.fmt(r.salePrice),
                this.fmt(r.costPrice),
            ]);

            autoTable(doc, {
                startY: y,
                head: [['Producto','Presentación','Barcode','Categoría','Tipo','Stock actual','P. Venta','P. Costo']],
                body: rows,
                styles: { fontSize: 7, cellPadding: 2, valign: 'middle', overflow: 'linebreak' },
                headStyles: { fillColor: PRIMARY, textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
                columnStyles: {
                    0: { cellWidth: 52 },
                    1: { cellWidth: 38 },
                    2: { cellWidth: 28, halign: 'center' },
                    3: { cellWidth: 26 },
                    4: { cellWidth: 20, halign: 'center' },
                    5: { cellWidth: 30, halign: 'center', fontStyle: 'bold' },
                    6: { cellWidth: 24, halign: 'right' },
                    7: { cellWidth: 24, halign: 'right' },
                },
                alternateRowStyles: { fillColor: LIGHT },
                didParseCell: (data: any) => {
                    if (data.section === 'body' && data.column.index === 5) {
                        const qty = this.filteredRows[data.row.index]?.stockQty ?? 0;
                        if (qty <= 0)        data.cell.styles.textColor = [220,53,69];
                        else if (qty <= 10)  data.cell.styles.textColor = [130,80,0];
                        else                 data.cell.styles.textColor = [25,135,84];
                    }
                },
                rowPageBreak: 'avoid',
                margin: { left: ML, right: MR }
            });

            // Pie de página
            const total = doc.getNumberOfPages();
            for (let i = 1; i <= total; i++) {
                doc.setPage(i);
                doc.setFontSize(7); doc.setTextColor(150);
                doc.text(`Página ${i} de ${total}`, W/2, H-7, { align:'center' });
                doc.text('Concentrados La 28 — Reporte de Stocks', ML, H-7);
            }

            doc.save(`stocks_${new Date().toISOString().split('T')[0]}.pdf`);
        } finally {
            this.isGeneratingPdf = false;
        }
    }
}
