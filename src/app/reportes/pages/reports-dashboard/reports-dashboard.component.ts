import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

interface ReportCard {
  title: string;
  description: string;
  icon: string;
  route: string;
  color: string;
  tags: string[];
}

@Component({
  selector: 'app-reports-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './reports-dashboard.component.html',
  styleUrls: ['./reports-dashboard.component.css']
})
export class ReportsDashboardComponent {

  reports: ReportCard[] = [
    {
      title: 'Utilidad por Ventas',
      description: 'Reporte de utilidad bruta por periodo, producto, cliente y categoría. Analiza márgenes de ganancia y rentabilidad.',
      icon: 'bi-graph-up-arrow',
      route: '/main/reportes/utilidad',
      color: 'success',
      tags: ['Ventas', 'Margen', 'Rentabilidad']
    },
    {
      title: 'Movimientos de Productos',
      description: 'Visualiza todas las entradas y salidas de inventario: ventas, compras, ajustes y traslados.',
      icon: 'bi-arrow-left-right',
      route: '/main/reportes/movimientos',
      color: 'info',
      tags: ['Inventario', 'Compras', 'Ventas']
    },
    {
      title: 'Flujo de Caja',
      description: 'Estado contable de ingresos y egresos. Control financiero con desglose por categoría y método de pago.',
      icon: 'bi-cash-coin',
      route: '/main/reportes/flujo-caja',
      color: 'warning',
      tags: ['Contable', 'Ingresos', 'Egresos']
    }
  ];
}
