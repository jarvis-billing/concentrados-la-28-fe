import { Routes } from '@angular/router';
import { PersonaComponent } from './persona/persona.component';
import { LoginComponent } from './auth/login/login.component';
import { MenuComponent } from './menu/menu.component';
import { InicioComponent } from './inicio/inicio.component';
import { MainComponent } from './main/main.component';
import { ProductoComponent } from './producto/producto.component';
import { PriceManagerPageComponent } from './producto/pages/price-manager-page/price-manager-page.component';
import { PresentationEditorPageComponent } from './producto/pages/presentation-editor-page/presentation-editor-page.component';
import { CategoriaComponent } from './categoria/categoria.component';
import { EmpresaComponent } from './empresa/empresa.component';
import { FacturacionComponent } from './facturacion/facturacion.component';
import { PerfilComponent } from './perfil/perfil.component';
import { OrdenComponent } from './orden/orden.component';
import { FacturaComponent } from './factura/factura.component';
import { CrearProductoComponent } from './producto/crear-producto.component';
import { ImportOrderComponent } from './factura/components/import-order/import-order.component';
import { FacturasTableComponent } from './factura/facturas-table/facturas-table.component';
import { InvoicesReportPageComponent } from './factura/pages/invoices-report-page/invoices-report-page.component';
import { ConfiguracionComponent } from './configuracion/configuracion.component';
import { ProductsSalesListComponent } from './factura/components/products-sales-list/products-sales-list.component';
import { PurchaseInvoicesPageComponent } from './compras/pages/purchase-invoices-page.component';
import { PurchaseInvoicesListPageComponent } from './compras/pages/purchase-invoices-list-page.component';
import { PurchaseCostHistoryPageComponent } from './compras/pages/purchase-cost-history-page.component';
import { PurchaseCostReportPageComponent } from './compras/pages/purchase-cost-report-page.component';
import { SuppliersPageComponent } from './compras/pages/suppliers-page.component';
import { SupplierPaymentsPageComponent } from './compras/pages/supplier-payments-page.component';
import { SupplierPaymentsListPageComponent } from './compras/pages/supplier-payments-list-page.component';
import { InventoryDashboardComponent } from './inventario/pages/inventory-dashboard/inventory-dashboard.component';
import { PhysicalInventoryPageComponent } from './inventario/pages/physical-inventory-page/physical-inventory-page.component';
import { InventoryMovementsPageComponent } from './inventario/pages/inventory-movements-page/inventory-movements-page.component';
import { StockAlertsPageComponent } from './inventario/pages/stock-alerts-page/stock-alerts-page.component';
import { InventoryAdjustmentsPageComponent } from './inventario/pages/inventory-adjustments-page/inventory-adjustments-page.component';
import { InventoryReportPageComponent } from './inventario/pages/inventory-report-page/inventory-report-page.component';
import { BarcodeLabelsPageComponent } from './inventario/pages/barcode-labels-page/barcode-labels-page.component';
import { BarcodeAlbumPageComponent } from './inventario/pages/barcode-album-page/barcode-album-page.component';
import { LabelAlbumBuilderComponent } from './inventario/pages/label-album-builder/label-album-builder.component';
import { ClientAccountViewComponent } from './cuenta-cliente/components/client-account-view/client-account-view.component';
import { AccountsReceivableReportComponent } from './cuenta-cliente/pages/accounts-receivable-report/accounts-receivable-report.component';
import { CreditsReportComponent } from './cuenta-cliente/pages/credits-report/credits-report.component';
import { BatchManagementPageComponent } from './lotes/pages/batch-management-page/batch-management-page.component';
import { CashCountPageComponent } from './arqueo-caja/pages/cash-count-page/cash-count-page.component';
import { CashCountReportsComponent } from './arqueo-caja/pages/cash-count-reports/cash-count-reports.component';
import { CashLoansPageComponent } from './arqueo-caja/pages/cash-loans-page/cash-loans-page.component';
import { OwnerWithdrawalsPageComponent } from './arqueo-caja/pages/owner-withdrawals-page/owner-withdrawals-page.component';
import { TransfersListComponent } from './traslados/pages/transfers-list/transfers-list.component';
import { BankReconciliationPageComponent } from './bank-reconciliation/pages/bank-reconciliation-page/bank-reconciliation-page.component';
import { BankReconciliationReportsComponent } from './bank-reconciliation/pages/bank-reconciliation-reports/bank-reconciliation-reports.component';
import { BankAccountsPageComponent } from './bank-accounts/pages/bank-accounts-page/bank-accounts-page.component';
import { ClienteComponent } from './cliente/cliente.component';
import { ReportsDashboardComponent } from './reportes/pages/reports-dashboard/reports-dashboard.component';
import { ProfitReportComponent } from './reportes/pages/profit-report/profit-report.component';
import { ProductMovementsReportComponent } from './reportes/pages/product-movements-report/product-movements-report.component';
import { CashFlowReportComponent } from './reportes/pages/cash-flow-report/cash-flow-report.component';
import { SalesMonthlyReportComponent } from './reportes/pages/sales-monthly-report/sales-monthly-report.component';
import { ReturnsListPageComponent } from './devoluciones/pages/returns-list-page/returns-list-page.component';
import { SaleReturnFormComponent } from './devoluciones/pages/sale-return-form/sale-return-form.component';
import { PurchaseReturnFormComponent } from './devoluciones/pages/purchase-return-form/purchase-return-form.component';
import { ReturnDetailPageComponent } from './devoluciones/pages/return-detail-page/return-detail-page.component';
import { PreventaPageComponent } from './preventa/pages/preventa-page/preventa-page.component';
import { PreventaListComponent } from './preventa/pages/preventa-list/preventa-list.component';
import { authGuard } from './auth/auth.guard';
import { UsersPageComponent } from './configuracion/pages/users-page/users-page.component';
import { CompanyPageComponent } from './configuracion/pages/company-page/company-page.component';

export const routes: Routes = [
    { path: '', pathMatch: 'full', redirectTo: '/login' },
    { path: 'preventa', component: PreventaPageComponent, canActivate: [authGuard] },
    { path: 'preventa/lista', component: PreventaListComponent, canActivate: [authGuard] },
    { path: 'persona', component: PersonaComponent },
    { path: 'login', component: LoginComponent },
    { path: 'menu', component: MenuComponent },

    { path: 'main', pathMatch: 'full', redirectTo: '/main/inicio' },
    { path: 'main', component: MainComponent, children: [
        {
            path:'inicio', component: InicioComponent
        },
        {
            path:'persona', component: PersonaComponent
        },
        {
            path:'producto', component: ProductoComponent
        },
        {
            path:'producto/precios', component: PriceManagerPageComponent
        },
        {
            path:'producto/presentaciones', component: PresentationEditorPageComponent
        },
        {
            path:'crearproducto/:barcode', component: CrearProductoComponent
        },
        {
            path: 'crearproducto', component: CrearProductoComponent
        },
        {
            path:'categoria', component: CategoriaComponent
        },
        {
            path:'empresa', component: EmpresaComponent
        },
        {
            path:'facturacion', component: FacturacionComponent
        },
        {
            path:'orden', component: OrdenComponent
        },
        {
            path:'factura', component: FacturaComponent
        },
        {
            path:'list/facturas', component: FacturasTableComponent
        },
        {
            path:'ventas/reporte-facturas', component: InvoicesReportPageComponent
        },
        {
            path:'list/sale/products', component: ProductsSalesListComponent
        },
        {
            path: 'compras/proveedores', component: SuppliersPageComponent
        },
        {
            path: 'compras/facturas', component: PurchaseInvoicesPageComponent
        },
        {
            path: 'compras/facturas/editar/:id', component: PurchaseInvoicesPageComponent
        },
        {
            path: 'compras/facturas/list', component: PurchaseInvoicesListPageComponent
        },
        {
            path: 'compras/facturas/historial-costos', component: PurchaseCostHistoryPageComponent
        },
        {
            path: 'compras/reporte-costos-venta', component: PurchaseCostReportPageComponent
        },
        {
            path: 'compras/pagos-proveedor', component: SupplierPaymentsPageComponent
        },
        {
            path: 'compras/pagos-proveedor/list', component: SupplierPaymentsListPageComponent
        },
        {
            path:'perfil', component: PerfilComponent
        },
        {
            path: 'import-order', component: ImportOrderComponent
        },
        {
            path: 'configuracion', component: ConfiguracionComponent
        },
        {
            path: 'configuracion/usuarios', component: UsersPageComponent
        },
        {
            path: 'configuracion/empresa', component: CompanyPageComponent
        },
        {
            path: 'inventario', component: InventoryDashboardComponent
        },
        {
            path: 'inventario/fisico', component: PhysicalInventoryPageComponent
        },
        {
            path: 'inventario/movimientos', component: InventoryMovementsPageComponent
        },
        {
            path: 'inventario/alertas', component: StockAlertsPageComponent
        },
        {
            path: 'inventario/ajustes', component: InventoryAdjustmentsPageComponent
        },
        {
            path: 'inventario/reporte', component: InventoryReportPageComponent
        },
        {
            path: 'inventario/etiquetas', component: BarcodeLabelsPageComponent
        },
        {
            path: 'inventario/album-barcodes', component: BarcodeAlbumPageComponent
        },
        {
            path: 'inventario/album-etiquetas', component: LabelAlbumBuilderComponent
        },
        {
            path: 'clientes', component: ClienteComponent
        },
        {
            path: 'clientes/cuenta', component: ClientAccountViewComponent
        },
        {
            path: 'clientes/cuentas-por-cobrar', component: AccountsReceivableReportComponent
        },
        {
            path: 'clientes/anticipos', component: CreditsReportComponent
        },
        {
            path: 'inventario/lotes', component: BatchManagementPageComponent
        },
        {
            path: 'arqueo-caja', component: CashCountPageComponent
        },
        {
            path: 'arqueo-caja/reportes', component: CashCountReportsComponent
        },
        {
            path: 'arqueo-caja/prestamos', component: CashLoansPageComponent
        },
        {
            path: 'arqueo-caja/traslados', component: TransfersListComponent
        },
        {
            path: 'arqueo-caja/retiros-propietario', component: OwnerWithdrawalsPageComponent
        },
        {
            path: 'arqueo-bancario', component: BankReconciliationPageComponent
        },
        {
            path: 'arqueo-bancario/reportes', component: BankReconciliationReportsComponent
        },
        {
            path: 'cuentas-bancarias', component: BankAccountsPageComponent
        },
        {
            path: 'reportes', component: ReportsDashboardComponent
        },
        {
            path: 'reportes/utilidad', component: ProfitReportComponent
        },
        {
            path: 'reportes/movimientos', component: ProductMovementsReportComponent
        },
        {
            path: 'reportes/flujo-caja', component: CashFlowReportComponent
        },
        {
            path: 'reportes/ventas-mes', component: SalesMonthlyReportComponent
        },
        {
            path: 'devoluciones', component: ReturnsListPageComponent
        },
        {
            path: 'devoluciones/nueva-venta', component: SaleReturnFormComponent
        },
        {
            path: 'devoluciones/nueva-compra', component: PurchaseReturnFormComponent
        },
        {
            path: 'devoluciones/:id', component: ReturnDetailPageComponent
        },
        {
            path: 'preventa/lista', component: PreventaListComponent
        }
    ]}
];
