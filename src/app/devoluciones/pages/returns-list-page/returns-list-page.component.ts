import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { MerchandiseReturnsService } from '../../services/merchandise-returns.service';
import { MerchandiseReturnDto, ReturnFilterDto, EReturnType, EReturnStatus } from '../../models/merchandise-return';
import { toast } from 'ngx-sonner';

@Component({
  selector: 'app-returns-list-page',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule],
  templateUrl: './returns-list-page.component.html'
})
export class ReturnsListPageComponent implements OnInit {
  private returnsService = inject(MerchandiseReturnsService);
  private router = inject(Router);
  private fb = inject(FormBuilder);

  returns: MerchandiseReturnDto[] = [];
  isLoading = false;
  today = new Date().toISOString().split('T')[0];

  filterForm: FormGroup = this.fb.group({
    returnType: [''],
    status: [''],
    fromDate: [''],
    toDate: [''],
    originalDocumentNumber: ['']
  });

  ngOnInit(): void {
    this.filterForm.patchValue({ fromDate: this.today, toDate: this.today });
    this.search();
  }

  search(): void {
    this.isLoading = true;
    const f = this.filterForm.value;
    const filter: ReturnFilterDto = {
      returnType: f.returnType || undefined,
      status: f.status || undefined,
      fromDate: f.fromDate || undefined,
      toDate: f.toDate || undefined,
      originalDocumentNumber: f.originalDocumentNumber || undefined
    };
    this.returnsService.list(filter).subscribe({
      next: (res) => {
        this.returns = res.sort((a, b) => {
          const da = new Date(a.createdAt || 0).getTime();
          const db = new Date(b.createdAt || 0).getTime();
          return db - da;
        });
        this.isLoading = false;
      },
      error: () => {
        toast.error('Error al cargar las devoluciones');
        this.isLoading = false;
      }
    });
  }

  clearFilters(): void {
    this.filterForm.reset({ returnType: '', status: '', fromDate: '', toDate: '', originalDocumentNumber: '' });
    this.search();
  }

  goToDetail(id: string | undefined): void {
    if (!id) return;
    this.router.navigate(['/main/devoluciones', id]);
  }

  goToNewSaleReturn(): void {
    this.router.navigate(['/main/devoluciones/nueva-venta']);
  }

  goToNewPurchaseReturn(): void {
    this.router.navigate(['/main/devoluciones/nueva-compra']);
  }

  getStatusBadge(status: EReturnStatus | undefined): string {
    switch (status) {
      case 'PROCESADA': return 'badge bg-success';
      case 'ANULADA':   return 'badge bg-danger';
      default:          return 'badge bg-secondary';
    }
  }

  getTypeBadge(type: EReturnType): string {
    return type === 'DEVOLUCION_VENTA' ? 'badge bg-primary' : 'badge bg-warning text-dark';
  }

  getTypeLabel(type: EReturnType): string {
    return type === 'DEVOLUCION_VENTA' ? 'Venta' : 'Compra';
  }

  getResolutionLabel(resolution: string): string {
    const map: Record<string, string> = {
      NOTA_CREDITO: 'Nota Crédito',
      REEMBOLSO_EFECTIVO: 'Reembolso Efectivo',
      REEMBOLSO_TRANSFERENCIA: 'Reembolso Transferencia',
      CAMBIO_PRODUCTO: 'Cambio Producto',
      ABONO_PROVEEDOR: 'Abono Proveedor',
      REEMBOLSO_PROVEEDOR: 'Reembolso Proveedor'
    };
    return map[resolution] || resolution;
  }

  formatCurrency(value: number | undefined): string {
    const n = Number(value) || 0;
    return '$ ' + new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
  }

  formatDate(dateStr: string | undefined): string {
    if (!dateStr) return '';
    const part = dateStr.split('T')[0];
    const [y, m, d] = part.split('-');
    return new Date(+y, +m - 1, +d).toLocaleDateString('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }

  get totalAmount(): number {
    return this.returns.reduce((s, r) => s + (r.totalAmount || 0), 0);
  }
}
