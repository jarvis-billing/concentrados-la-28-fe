import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { PurchaseInvoice } from '../models/purchase-invoice';
import { Supplier } from '../models/supplier';
import { PurchasesService } from '../services/purchases.service';
import { SupplierService } from '../services/supplier.service';
import { toast } from 'ngx-sonner';
import { Router } from '@angular/router';
import { ProductsSearchModalComponent } from '../../producto/components/products-search-modal/products-search-modal.component';
import { Product } from '../../producto/producto';

@Component({
  selector: 'app-purchase-invoices-list-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, ProductsSearchModalComponent],
  templateUrl: './purchase-invoices-list-page.component.html'
})
export class PurchaseInvoicesListPageComponent implements OnInit {
  private fb = inject(FormBuilder);
  private purchasesService = inject(PurchasesService);
  private supplierService = inject(SupplierService);
  private router = inject(Router);

  invoices: PurchaseInvoice[] = [];
  filteredInvoices: PurchaseInvoice[] = [];
  suppliers: Supplier[] = [];
  filteredSuppliersForFilter: Supplier[] = [];
  supplierFilterSearchText: string = '';
  showSupplierFilterDropdown: boolean = false;
  selectedSupplierForFilter: Supplier | null = null;
  expandedInvoiceId: string | null = null;
  selectedProduct: Product | null = null;

  @ViewChild(ProductsSearchModalComponent, { static: false }) productsSearchModalComp!: ProductsSearchModalComponent;

  filterForm: FormGroup = this.fb.group({
    startDate: [''],
    endDate: [''],
    supplierId: [''],
    productSearch: ['']
  });

  ngOnInit() {
    this.loadSuppliers();
    // Cargar facturas después de que los proveedores estén cargados
    this.supplierService.list().subscribe(suppliers => {
      this.suppliers = suppliers;
      this.loadInvoices();
    });
    this.filterForm.valueChanges.subscribe(() => this.applyFilters());
  }

  loadSuppliers() {
    this.supplierService.list().subscribe(res => {
      this.suppliers = res;
      this.filteredSuppliersForFilter = res;
    });
  }

  filterSuppliersForFilter(searchText: string) {
    this.supplierFilterSearchText = searchText;
    if (!searchText.trim()) {
      this.filteredSuppliersForFilter = this.suppliers;
      this.showSupplierFilterDropdown = false;
      return;
    }
    
    const query = searchText.toLowerCase();
    this.filteredSuppliersForFilter = this.suppliers.filter(s => {
      const name = (s.name || '').toLowerCase();
      const idNumber = (s.idNumber || '').toLowerCase();
      const docType = (s.documentType || '').toLowerCase();
      return name.includes(query) || idNumber.includes(query) || docType.includes(query);
    });
    this.showSupplierFilterDropdown = this.filteredSuppliersForFilter.length > 0;
  }

  selectSupplierForFilter(supplier: Supplier) {
    this.selectedSupplierForFilter = supplier;
    this.supplierFilterSearchText = `${supplier.name} (${supplier.documentType} ${supplier.idNumber})`;
    this.filterForm.patchValue({ supplierId: supplier.id });
    this.showSupplierFilterDropdown = false;
  }

  clearSupplierFilterSelection() {
    this.selectedSupplierForFilter = null;
    this.supplierFilterSearchText = '';
    this.filterForm.patchValue({ supplierId: '' });
    this.filteredSuppliersForFilter = this.suppliers;
  }

  loadInvoices() {
    this.purchasesService.list().subscribe(res => {
      console.log('Facturas recibidas del backend:', res);
      this.invoices = res.map((invoice: any) => {
        console.log('Procesando factura:', invoice);
        
        // Mapear invoiceDate a emissionDate si viene del backend
        if (invoice.invoiceDate && !invoice.emissionDate) {
          invoice.emissionDate = invoice.invoiceDate;
        }
        
        // Calcular total si no viene del backend
        if (!invoice.total || invoice.total === 0) {
          invoice.total = (invoice.items || []).reduce((sum: number, item: any) => 
            sum + (item.totalCost || (item.quantity * item.unitCost) || 0), 0
          );
        }
        
        // Resolver supplier si viene como ID o está incompleto
        if (typeof invoice.supplier === 'string') {
          const supplierId = invoice.supplier;
          const supplierObj = this.suppliers.find(s => s.id === supplierId);
          if (supplierObj) {
            invoice.supplier = supplierObj;
          }
        } else if (invoice.supplier && !invoice.supplier.name) {
          // Si supplier es un objeto pero no tiene name, intentar completarlo
          const supplierId = invoice.supplier.id;
          const supplierObj = this.suppliers.find(s => s.id === supplierId);
          if (supplierObj) {
            invoice.supplier = supplierObj;
          }
        }
        
        // Validar que emissionDate y paymentType existan después del mapeo
        if (!invoice.emissionDate) {
          console.warn('Factura sin emissionDate/invoiceDate:', invoice);
        }
        if (!invoice.paymentType) {
          console.warn('Factura sin paymentType:', invoice);
        }
        
        return invoice;
      }).sort((a: any, b: any) => {
        // Ordenar por fecha de ingreso (createdAt) descendente - más recientes primero
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      });
      console.log('Facturas procesadas:', this.invoices);
      this.applyFilters();
    });
  }

  applyFilters() {
    const filters = this.filterForm.value;
    let filtered = [...this.invoices];

    // Filtrar por fecha de inicio (fecha de ingreso)
    if (filters.startDate) {
      filtered = filtered.filter(inv => {
        if (!inv.createdAt) return false;
        const createdDate = inv.createdAt.split('T')[0]; // Extraer solo la fecha YYYY-MM-DD
        return createdDate >= filters.startDate;
      });
    }

    // Filtrar por fecha de fin (fecha de ingreso)
    if (filters.endDate) {
      filtered = filtered.filter(inv => {
        if (!inv.createdAt) return false;
        const createdDate = inv.createdAt.split('T')[0]; // Extraer solo la fecha YYYY-MM-DD
        return createdDate <= filters.endDate;
      });
    }

    // Filtrar por proveedor
    if (filters.supplierId) {
      filtered = filtered.filter(inv => {
        if (!inv.supplier || !inv.supplier.id) return false;
        return inv.supplier.id === filters.supplierId;
      });
    }

    // Filtrar por producto seleccionado
    if (this.selectedProduct) {
      filtered = filtered.filter(inv => {
        return inv.items.some(item => {
          // Buscar por productId o por barcode
          return item.productId === this.selectedProduct!.id || 
                 item.presentationBarcode === this.selectedProduct!.barcode;
        });
      });
    }

    this.filteredInvoices = filtered;
  }

  clearFilters() {
    this.selectedProduct = null;
    this.selectedSupplierForFilter = null;
    this.supplierFilterSearchText = '';
    this.filteredSuppliersForFilter = this.suppliers;
    this.filterForm.reset({
      startDate: '',
      endDate: '',
      supplierId: '',
      productSearch: ''
    });
  }

  openProductModal() {
    this.productsSearchModalComp?.openModal();
  }

  onProductSelected(product: Product) {
    this.selectedProduct = product;
    const searchText = `${product.description || ''} - ${product.barcode || ''}`;
    this.filterForm.patchValue({ productSearch: searchText });
  }

  clearProductFilter() {
    this.selectedProduct = null;
    this.filterForm.patchValue({ productSearch: '' });
  }

  toggleInvoiceDetails(invoiceId: string | undefined) {
    if (!invoiceId) return;
    this.expandedInvoiceId = this.expandedInvoiceId === invoiceId ? null : invoiceId;
  }

  isExpanded(invoiceId: string | undefined): boolean {
    return invoiceId === this.expandedInvoiceId;
  }

  goToCreateInvoice() {
    this.router.navigate(['/main/compras/facturas']);
  }

  getSupplierName(invoice: PurchaseInvoice): string {
    if (!invoice || !invoice.supplier) return 'N/A';
    return invoice.supplier.name || 'N/A';
  }

  getSupplierDocument(invoice: PurchaseInvoice): string {
    const s = invoice.supplier;
    if (!s) return '';
    return `${s.documentType || ''} ${s.idNumber || ''}`.trim();
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    
    // Extraer solo la parte de fecha si viene con hora (YYYY-MM-DD o YYYY-MM-DDTHH:mm:ss)
    const datePart = dateStr.split('T')[0];
    const [year, month, day] = datePart.split('-');
    
    // Crear fecha en zona horaria local para evitar desfase
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

  getTotalInvoices(): number {
    return this.filteredInvoices.length;
  }

  getTotalAmount(): number {
    return this.filteredInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
  }
}
