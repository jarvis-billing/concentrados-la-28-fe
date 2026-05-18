import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Chart, ChartConfiguration, ChartType, registerables } from 'chart.js';

Chart.register(...registerables);

export interface ChartDataSet {
  label: string;
  data: number[];
  backgroundColor?: string | string[];
  borderColor?: string;
  borderWidth?: number;
  fill?: boolean;
  tension?: number;
}

export interface ChartConfig {
  title: string;
  labels: string[];
  datasets: ChartDataSet[];
  chartType?: ChartType;
}

@Component({
  selector: 'app-report-chart-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './report-chart-modal.component.html',
  styleUrls: ['./report-chart-modal.component.css']
})
export class ReportChartModalComponent implements AfterViewInit, OnDestroy, OnChanges {
  @ViewChild('chartCanvas') chartCanvas!: ElementRef<HTMLCanvasElement>;
  @Input() visible = false;
  @Input() config: ChartConfig | null = null;
  @Input() availableCharts: ChartConfig[] = [];
  @Output() visibleChange = new EventEmitter<boolean>();

  private chart: Chart | null = null;
  selectedChartIndex = 0;
  selectedChartType: ChartType = 'bar';
  chartTypes: { value: ChartType; label: string; icon: string }[] = [
    { value: 'bar', label: 'Barras', icon: 'bi-bar-chart-fill' },
    { value: 'line', label: 'Líneas', icon: 'bi-graph-up' },
    { value: 'pie', label: 'Circular', icon: 'bi-pie-chart-fill' },
    { value: 'doughnut', label: 'Dona', icon: 'bi-record-circle' },
  ];

  private initialized = false;

  ngAfterViewInit(): void {
    this.initialized = true;
    if (this.visible) {
      setTimeout(() => this.renderChart(), 100);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible && this.initialized) {
      setTimeout(() => this.renderChart(), 100);
    }
    if (changes['config'] && this.visible && this.initialized) {
      setTimeout(() => this.renderChart(), 100);
    }
  }

  ngOnDestroy(): void {
    this.destroyChart();
  }

  close(): void {
    this.visible = false;
    this.visibleChange.emit(false);
    this.destroyChart();
  }

  onChartSelect(): void {
    this.renderChart();
  }

  onChartTypeChange(): void {
    this.renderChart();
  }

  private getCurrentConfig(): ChartConfig | null {
    if (this.availableCharts.length > 0) {
      return this.availableCharts[this.selectedChartIndex] || null;
    }
    return this.config;
  }

  private renderChart(): void {
    this.destroyChart();
    const cfg = this.getCurrentConfig();
    if (!cfg || !this.chartCanvas) return;

    const ctx = this.chartCanvas.nativeElement.getContext('2d');
    if (!ctx) return;

    const type = this.selectedChartType || cfg.chartType || 'bar';
    const isPieOrDoughnut = type === 'pie' || type === 'doughnut';

    const colors = [
      'rgba(40, 167, 69, 0.7)',   // green
      'rgba(220, 53, 69, 0.7)',   // red
      'rgba(0, 123, 255, 0.7)',   // blue
      'rgba(255, 193, 7, 0.7)',   // yellow
      'rgba(23, 162, 184, 0.7)',  // teal
      'rgba(111, 66, 193, 0.7)',  // purple
      'rgba(253, 126, 20, 0.7)',  // orange
      'rgba(108, 117, 125, 0.7)', // gray
      'rgba(32, 201, 151, 0.7)',  // mint
      'rgba(232, 62, 140, 0.7)',  // pink
    ];

    const borderColors = colors.map(c => c.replace('0.7', '1'));

    const datasets = cfg.datasets.map((ds, idx) => {
      const base: any = {
        label: ds.label,
        data: ds.data,
        borderWidth: ds.borderWidth ?? 2,
      };

      if (isPieOrDoughnut) {
        base.backgroundColor = colors.slice(0, cfg.labels.length);
        base.borderColor = borderColors.slice(0, cfg.labels.length);
      } else {
        base.backgroundColor = ds.backgroundColor || colors[idx % colors.length];
        base.borderColor = ds.borderColor || borderColors[idx % borderColors.length];
        base.fill = ds.fill ?? false;
        base.tension = ds.tension ?? 0.3;
      }

      return base;
    });

    const chartConfig: ChartConfiguration = {
      type,
      data: { labels: cfg.labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: cfg.title,
            font: { size: 16, weight: 'bold' },
            padding: { top: 10, bottom: 20 }
          },
          legend: {
            display: true,
            position: isPieOrDoughnut ? 'right' : 'top',
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const value = context.parsed?.y ?? context.parsed;
                const formatted = typeof value === 'number'
                  ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value)
                  : value;
                return `${context.dataset.label || ''}: ${formatted}`;
              }
            }
          }
        },
        scales: isPieOrDoughnut ? {} : {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (value) =>
                new Intl.NumberFormat('es-CO', { notation: 'compact', compactDisplay: 'short' }).format(Number(value))
            }
          },
          x: {
            ticks: {
              maxRotation: 45,
              minRotation: 0
            }
          }
        }
      }
    };

    this.chart = new Chart(ctx, chartConfig);
  }

  private destroyChart(): void {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
  }
}
