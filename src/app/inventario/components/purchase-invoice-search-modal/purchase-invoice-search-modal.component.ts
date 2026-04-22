import { Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PurchaseInvoice } from '../../../compras/models/purchase-invoice';
import { PurchaseItem } from '../../../compras/models/purchase-item';
import { Supplier } from '../../../compras/models/supplier';
import { PurchasesService } from '../../../compras/services/purchases.service';
import { SupplierService } from '../../../compras/services/supplier.service';
import { toast } from 'ngx-sonner';

@Component({
    selector: 'app-purchase-invoice-search-modal',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './purchase-invoice-search-modal.component.html',
    styleUrl: './purchase-invoice-search-modal.component.css'
})
export class PurchaseInvoiceSearchModalComponent implements OnInit {

    @Output() invoiceSelected = new EventEmitter<PurchaseInvoice>();

    private purchasesService = inject(PurchasesService);
    private supplierService = inject(SupplierService);

    showModal = false;
    isLoading = false;

    // Filtros
    startDate = '';
    endDate = '';
    invoiceNumberSearch = '';
    supplierSearchText = '';
    showSupplierDropdown = false;
    selectedSupplier: Supplier | null = null;

    // Datos
    suppliers: Supplier[] = [];
    filteredSuppliers: Supplier[] = [];
    invoices: PurchaseInvoice[] = [];
    filteredInvoices: PurchaseInvoice[] = [];

    // Factura expandida para ver detalle
    expandedInvoiceId: string | null = null;

    ngOnInit(): void {
        this.loadSuppliers();
    }

    openModal(): void {
        this.resetFilters();
        this.showModal = true;
        this.loadInvoices();
    }

    closeModal(): void {
        this.showModal = false;
    }

    private loadSuppliers(): void {
        this.supplierService.list().subscribe({
            next: (suppliers) => {
                this.suppliers = suppliers;
                this.filteredSuppliers = suppliers;
            }
        });
    }

    loadInvoices(): void {
        this.isLoading = true;
        this.purchasesService.list().subscribe({
            next: (invoices) => {
                this.invoices = invoices.map((inv: any) => {
                    // Mapear invoiceDate a emissionDate si viene del backend
                    if (inv.invoiceDate && !inv.emissionDate) {
                        inv.emissionDate = inv.invoiceDate;
                    }
                    // Resolver supplier si viene como ID
                    if (typeof inv.supplier === 'string') {
                        const supplierId = inv.supplier;
                        const supplierObj = this.suppliers.find(s => s.id === supplierId);
                        if (supplierObj) {
                            inv.supplier = supplierObj;
                        }
                    } else if (inv.supplier && !inv.supplier.name) {
                        const supplierId = inv.supplier.id;
                        const supplierObj = this.suppliers.find(s => s.id === supplierId);
                        if (supplierObj) {
                            inv.supplier = supplierObj;
                        }
                    }
                    return inv;
                }).sort((a: any, b: any) => {
                    const dateA = new Date(a.createdAt || 0).getTime();
                    const dateB = new Date(b.createdAt || 0).getTime();
                    return dateB - dateA;
                });
                this.applyFilters();
                this.isLoading = false;
            },
            error: () => {
                toast.error('Error al cargar las facturas de compra');
                this.isLoading = false;
            }
        });
    }

    applyFilters(): void {
        let filtered = [...this.invoices];

        // Filtrar por fecha de inicio
        if (this.startDate) {
            filtered = filtered.filter(inv => {
                const date = (inv.createdAt || inv.emissionDate || '').split('T')[0];
                return date >= this.startDate;
            });
        }

        // Filtrar por fecha de fin
        if (this.endDate) {
            filtered = filtered.filter(inv => {
                const date = (inv.createdAt || inv.emissionDate || '').split('T')[0];
                return date <= this.endDate;
            });
        }

        // Filtrar por proveedor
        if (this.selectedSupplier) {
            filtered = filtered.filter(inv =>
                inv.supplier?.id === this.selectedSupplier!.id
            );
        }

        // Filtrar por número de factura
        if (this.invoiceNumberSearch.trim()) {
            const term = this.invoiceNumberSearch.toLowerCase().trim();
            filtered = filtered.filter(inv =>
                (inv.invoiceNumber || '').toLowerCase().includes(term)
            );
        }

        this.filteredInvoices = filtered;
    }

    // Supplier autocomplete
    filterSuppliers(searchText: string): void {
        this.supplierSearchText = searchText;
        if (!searchText.trim()) {
            this.filteredSuppliers = this.suppliers;
            this.showSupplierDropdown = false;
            return;
        }
        const query = searchText.toLowerCase();
        this.filteredSuppliers = this.suppliers.filter(s =>
            (s.name || '').toLowerCase().includes(query) ||
            (s.idNumber || '').toLowerCase().includes(query)
        );
        this.showSupplierDropdown = this.filteredSuppliers.length > 0;
    }

    onSupplierBlur(): void {
        // Delay para permitir que el click en el dropdown se registre antes de cerrar
        setTimeout(() => {
            this.showSupplierDropdown = false;
        }, 200);
    }

    selectSupplier(supplier: Supplier): void {
        this.selectedSupplier = supplier;
        this.supplierSearchText = supplier.name;
        this.showSupplierDropdown = false;
        this.applyFilters();
    }

    clearSupplier(): void {
        this.selectedSupplier = null;
        this.supplierSearchText = '';
        this.filteredSuppliers = this.suppliers;
        this.applyFilters();
    }

    toggleDetails(invoiceId: string | undefined): void {
        if (!invoiceId) return;
        this.expandedInvoiceId = this.expandedInvoiceId === invoiceId ? null : invoiceId;
    }

    isExpanded(invoiceId: string | undefined): boolean {
        return invoiceId === this.expandedInvoiceId;
    }

    selectInvoice(invoice: PurchaseInvoice): void {
        this.invoiceSelected.emit(invoice);
        toast.success(`Factura ${invoice.invoiceNumber} seleccionada`);
        this.closeModal();
    }

    resetFilters(): void {
        this.startDate = '';
        this.endDate = '';
        this.invoiceNumberSearch = '';
        this.selectedSupplier = null;
        this.supplierSearchText = '';
        this.expandedInvoiceId = null;
    }

    getSupplierName(invoice: PurchaseInvoice): string {
        return invoice.supplier?.name || 'N/A';
    }

    formatDate(dateStr: string | undefined): string {
        if (!dateStr) return '';
        const datePart = dateStr.split('T')[0];
        const [year, month, day] = datePart.split('-');
        const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        return date.toLocaleDateString('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit' });
    }

    formatCurrency(value: number | undefined | null): string {
        const numValue = Number(value) || 0;
        if (!isFinite(numValue)) return '$ 0';
        return '$ ' + new Intl.NumberFormat('es-CO', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(numValue);
    }

    getItemsCount(invoice: PurchaseInvoice): number {
        return (invoice.items || []).length;
    }
}
