import { Routes } from '@angular/router';
import { PersonaComponent } from './persona/persona.component';
import { LoginComponent } from './auth/login/login.component';
import { MenuComponent } from './menu/menu.component';
import { InicioComponent } from './inicio/inicio.component';
import { MainComponent } from './main/main.component';
import { ProductoComponent } from './producto/producto.component';
import { CategoriaComponent } from './categoria/categoria.component';
import { EmpresaComponent } from './empresa/empresa.component';
import { FacturacionComponent } from './facturacion/facturacion.component';
import { PerfilComponent } from './perfil/perfil.component';
import { OrdenComponent } from './orden/orden.component';
import { FacturaComponent } from './factura/factura.component';
import { CrearProductoComponent } from './producto/crear-producto.component';
import { ImportOrderComponent } from './factura/components/import-order/import-order.component';
import { FacturasTableComponent } from './factura/facturas-table/facturas-table.component';
import { ConfiguracionComponent } from './configuracion/configuracion.component';
import { ProductsSalesListComponent } from './factura/components/products-sales-list/products-sales-list.component';

export const routes: Routes = [
    { path: '', pathMatch: 'full', redirectTo: '/login' },
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
            path:'crearproducto/:barcode', component: CrearProductoComponent
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
            path:'list/sale/products', component: ProductsSalesListComponent
        },
        {
            path:'perfil', component: PerfilComponent
        },
        {
            path: 'import-order', component: ImportOrderComponent
        },
        {
            path: 'configuracion', component: ConfiguracionComponent
        }
    ]}
];
