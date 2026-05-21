import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { FacturaService } from '../../../factura/factura.service';
import { MerchandiseReturnsService } from '../../services/merchandise-returns.service';
import { BankAccountService } from '../../../bank-accounts/services/bank-account.service';
import { BankAccountDto } from '../../../bank-accounts/models/bank-account.model';
import { Billing } from '../../../factura/billing';
import { MerchandiseReturnDto, MerchandiseReturnItemDto, EReturnResolution } from '../../models/merchandise-return';
import { toast } from 'ngx-sonner';

interface ReturnItem extends MerchandiseReturnItemDto {
  maxQuantity: number;
  returnQty: number;
  lineTotal: number;
}

@Component({
  selector: 'app-sale-return-form',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule],
  templateUrl: './sale-return-form.component.html'
})
export class SaleReturnFormComponent implements OnInit {
  private facturaService = inject(FacturaService);
  private returnsService = inject(MerchandiseReturnsService);
  private bankAccountService = inject(BankAccountService);
  private router = inject(Router);

  step = 1;
  isSearching = false;
  isSubmitting = false;

  docNumber = '';
  originalBilling: Billing | null = null;

  returnItems: ReturnItem[] = [];
  resolution: EReturnResolution = 'NOTA_CREDITO';
  bankAccounts: BankAccountDto[] = [];
  bankAccountId = '';
  notes = '';

  createdReturn: MerchandiseReturnDto | null = null;

  readonly resolutions: { value: EReturnResolution; label: string; description: string }[] = [
    { value: 'NOTA_CREDITO', label: 'Nota Crédito', description: 'Genera saldo a favor para el cliente' },
    { value: 'REEMBOLSO_EFECTIVO', label: 'Reembolso Efectivo', description: 'El cliente recibe el dinero en efectivo' },
    { value: 'REEMBOLSO_TRANSFERENCIA', label: 'Reembolso Transferencia', description: 'El cliente recibe el dinero por transferencia' },
    { value: 'CAMBIO_PRODUCTO', label: 'Cambio de Producto', description: 'Se realizará cambio por otro producto (requiere nueva venta)' }
  ];

  ngOnInit(): void {
    this.bankAccountService.listActive().subscribe(r => this.bankAccounts = r);
  }

  searchBilling(): void {
    if (!this.docNumber.trim()) {
      toast.warning('Ingresa el número de factura');
      return;
    }
    this.isSearching = true;
    this.originalBilling = null;
    this.facturaService.getBillingByNumber(this.docNumber.trim()).subscribe({
      next: (billing) => {
        this.originalBilling = billing;
        this.buildReturnItems(billing);
        this.isSearching = false;
        this.step = 2;
      },
      error: (err) => {
        const msg = err.status === 404
          ? `No se encontró la factura Nro. ${this.docNumber}`
          : 'Error al buscar la factura';
        toast.error(msg);
        this.isSearching = false;
      }
    });
  }

  private buildReturnItems(billing: Billing): void {
    this.returnItems = (billing.saleDetails || []).map(detail => {
      const vatRate = detail.totalVat && detail.amount
        ? Math.round((detail.totalVat / (detail.unitPrice * detail.amount)) * 100)
        : 0;
      return {
        productId: detail.product?.id || '',
        productCode: detail.product?.barcode || '',
        presentationBarcode: detail.product?.barcode || '',
        description: detail.product?.description || '',
        quantity: 1,
        unitPrice: detail.unitPrice || 0,
        vatRate: vatRate,
        maxQuantity: detail.amount || 1,
        returnQty: 0,
        lineTotal: 0
      };
    });
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

  get needsBankAccount(): boolean {
    return this.resolution === 'REEMBOLSO_TRANSFERENCIA';
  }

  confirm(): void {
    if (this.needsBankAccount && !this.bankAccountId) {
      toast.warning('Selecciona una cuenta bancaria para el reembolso por transferencia');
      return;
    }
    this.isSubmitting = true;
    const dto: MerchandiseReturnDto = {
      returnType: 'DEVOLUCION_VENTA',
      originalDocumentId: this.originalBilling?.id || undefined,
      originalDocumentNumber: this.originalBilling?.billNumber || this.docNumber,
      clientId: this.originalBilling?.client?.id || undefined,
      clientName: this.originalBilling?.client?.name || undefined,
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
      bankAccountId: this.bankAccountId || undefined,
      notes: this.notes || undefined
    };
    this.returnsService.createSaleReturn(dto).subscribe({
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
