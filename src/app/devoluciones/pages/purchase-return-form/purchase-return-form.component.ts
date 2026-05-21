import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { PurchasesService } from '../../../compras/services/purchases.service';
import { MerchandiseReturnsService } from '../../services/merchandise-returns.service';
import { BankAccountService } from '../../../bank-accounts/services/bank-account.service';
import { BankAccountDto } from '../../../bank-accounts/models/bank-account.model';
import { PurchaseInvoice } from '../../../compras/models/purchase-invoice';
import { MerchandiseReturnDto, MerchandiseReturnItemDto, EReturnResolution } from '../../models/merchandise-return';
import { toast } from 'ngx-sonner';

interface ReturnItem extends MerchandiseReturnItemDto {
  maxQuantity: number;
  returnQty: number;
  lineTotal: number;
}

@Component({
  selector: 'app-purchase-return-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './purchase-return-form.component.html'
})
export class PurchaseReturnFormComponent implements OnInit {
  private purchasesService = inject(PurchasesService);
  private returnsService = inject(MerchandiseReturnsService);
  private bankAccountService = inject(BankAccountService);
  private router = inject(Router);

  step = 1;
  isSearching = false;
  isSubmitting = false;

  docNumber = '';
  originalInvoice: PurchaseInvoice | null = null;

  returnItems: ReturnItem[] = [];
  resolution: EReturnResolution = 'ABONO_PROVEEDOR';
  bankAccounts: BankAccountDto[] = [];
  bankAccountId = '';
  refundMethod = '';
  notes = '';

  createdReturn: MerchandiseReturnDto | null = null;

  readonly resolutions: { value: EReturnResolution; label: string; description: string }[] = [
    { value: 'ABONO_PROVEEDOR', label: 'Abono Proveedor', description: 'El proveedor emite nota crédito (se abona a futuras facturas)' },
    { value: 'REEMBOLSO_PROVEEDOR', label: 'Reembolso Proveedor', description: 'El proveedor reembolsa el dinero' }
  ];

  ngOnInit(): void {
    this.bankAccountService.listActive().subscribe(r => this.bankAccounts = r);
  }

  searchInvoice(): void {
    if (!this.docNumber.trim()) {
      toast.warning('Ingresa el número de factura de compra');
      return;
    }
    this.isSearching = true;
    this.originalInvoice = null;
    this.purchasesService.list({ invoiceNumber: this.docNumber.trim() }).subscribe({
      next: (invoices) => {
        const found = invoices.find(inv =>
          (inv.invoiceNumber || '').toLowerCase() === this.docNumber.trim().toLowerCase()
        );
        if (!found) {
          toast.error(`No se encontró la factura de compra Nro. ${this.docNumber}`);
          this.isSearching = false;
          return;
        }
        this.originalInvoice = found;
        this.buildReturnItems(found);
        this.isSearching = false;
        this.step = 2;
      },
      error: () => {
        toast.error('Error al buscar la factura de compra');
        this.isSearching = false;
      }
    });
  }

  private buildReturnItems(invoice: PurchaseInvoice): void {
    this.returnItems = (invoice.items || []).map(item => ({
      productId: item.productId || '',
      productCode: item.presentationBarcode || '',
      presentationBarcode: item.presentationBarcode || '',
      description: item.description || '',
      quantity: 1,
      unitPrice: item.unitCost || 0,
      vatRate: item.vatRate || 0,
      maxQuantity: item.quantity || 1,
      returnQty: 0,
      lineTotal: 0
    }));
  }

  updateLineTotal(item: ReturnItem): void {
    if (item.returnQty < 0) item.returnQty = 0;
    if (item.returnQty > item.maxQuantity) item.returnQty = item.maxQuantity;
    item.quantity = item.returnQty;
    const base = item.returnQty * item.unitPrice;
    const vat = base * ((item.vatRate || 0) / 100);
    item.lineTotal = base + vat;
  }

  get selectedItems(): ReturnItem[] {
    return this.returnItems.filter(i => i.returnQty > 0);
  }

  get subtotal(): number {
    return this.selectedItems.reduce((s, i) => s + i.returnQty * i.unitPrice, 0);
  }

  get totalVat(): number {
    return this.selectedItems.reduce((s, i) => {
      const base = i.returnQty * i.unitPrice;
      return s + base * ((i.vatRate || 0) / 100);
    }, 0);
  }

  get totalAmount(): number {
    return this.subtotal + this.totalVat;
  }

  goStep(n: number): void {
    if (n === 3 && this.selectedItems.length === 0) {
      toast.warning('Selecciona al menos un ítem para devolver');
      return;
    }
    if (n === 4 && !this.resolution) {
      toast.warning('Selecciona el tipo de resolución');
      return;
    }
    this.step = n;
  }

  getResolutionLabel(val: string): string {
    return this.resolutions.find(r => r.value === val)?.label || val;
  }

  get needsRefund(): boolean {
    return this.resolution === 'REEMBOLSO_PROVEEDOR';
  }

  getSupplierName(): string {
    const s = this.originalInvoice?.supplier;
    if (!s) return 'N/A';
    return s.name || 'N/A';
  }

  confirm(): void {
    this.isSubmitting = true;
    const dto: MerchandiseReturnDto = {
      returnType: 'DEVOLUCION_COMPRA',
      originalDocumentId: this.originalInvoice?.id || undefined,
      originalDocumentNumber: this.originalInvoice?.invoiceNumber || this.docNumber,
      supplierId: this.originalInvoice?.supplier?.id || undefined,
      supplierName: this.getSupplierName(),
      resolution: this.resolution,
      items: this.selectedItems.map(i => ({
        productId: i.productId,
        productCode: i.productCode,
        presentationBarcode: i.presentationBarcode,
        description: i.description,
        quantity: i.returnQty,
        unitPrice: i.unitPrice,
        vatRate: i.vatRate
      })),
      refundMethod: this.needsRefund ? (this.refundMethod || undefined) : undefined,
      bankAccountId: this.needsRefund && this.bankAccountId ? this.bankAccountId : undefined,
      notes: this.notes || undefined
    };
    this.returnsService.createPurchaseReturn(dto).subscribe({
      next: (result) => {
        this.createdReturn = result;
        this.isSubmitting = false;
        this.step = 5;
        toast.success(`Devolución ${result.returnNumber} creada exitosamente`);
      },
      error: (err) => {
        toast.error(err?.error?.message || 'Error al registrar la devolución');
        this.isSubmitting = false;
      }
    });
  }

  goToList(): void {
    this.router.navigate(['/main/devoluciones']);
  }

  goToDetail(): void {
    if (this.createdReturn?.id) {
      this.router.navigate(['/main/devoluciones', this.createdReturn.id]);
    }
  }

  formatCurrency(value: number): string {
    return '$ ' + new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
  }
}
