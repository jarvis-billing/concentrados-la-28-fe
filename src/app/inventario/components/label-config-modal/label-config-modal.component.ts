import { Component, EventEmitter, inject, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LabelConfig, AVAILABLE_LABEL_FIELDS, LabelField } from '../../models/label-config';
import { LabelConfigService } from '../../services/label-config.service';
import { toast } from 'ngx-sonner';

@Component({
    selector: 'app-label-config-modal',
    standalone: true,
    imports: [CommonModule, FormsModule],
    template: `
        @if (showModal) {
            <div class="modal-backdrop fade show"></div>
            <div class="modal fade show d-block" tabindex="-1">
                <div class="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
                    <div class="modal-content">
                        <div class="modal-header bg-primary text-white">
                            <h5 class="modal-title">
                                <i class="bi bi-gear me-2"></i>
                                Configuración de Etiquetas
                            </h5>
                            <button type="button" class="btn-close btn-close-white" (click)="closeModal()"></button>
                        </div>
                        <div class="modal-body">
                            <!-- Presets -->
                            <div class="mb-4">
                                <label class="form-label fw-bold">
                                    <i class="bi bi-bookmark me-1"></i>Presets Predefinidos
                                </label>
                                <div class="row g-2">
                                    @for (preset of presets; track preset.presetName; let i = $index) {
                                        <div class="col-md-6">
                                            <button 
                                                type="button" 
                                                class="btn w-100 text-start"
                                                [class.btn-outline-primary]="config.presetName !== preset.presetName"
                                                [class.btn-primary]="config.presetName === preset.presetName"
                                                (click)="applyPreset(i)">
                                                <i class="bi bi-tag me-1"></i>
                                                {{ preset.presetName }}
                                                <br>
                                                <small class="opacity-75">
                                                    {{ preset.labelWidth }}x{{ preset.labelHeight }}mm - {{ preset.columns }} col
                                                </small>
                                            </button>
                                        </div>
                                    }
                                </div>
                            </div>

                            <hr>

                            <!-- Dimensiones de la etiqueta -->
                            <div class="mb-4">
                                <h6 class="fw-bold mb-3">
                                    <i class="bi bi-rulers me-1"></i>Dimensiones de la Etiqueta
                                </h6>
                                <div class="row g-3">
                                    <div class="col-md-4">
                                        <label class="form-label">Ancho (mm)</label>
                                        <input type="number" class="form-control" 
                                               [(ngModel)]="config.labelWidth" 
                                               min="10" max="200" step="1">
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label">Alto (mm)</label>
                                        <input type="number" class="form-control" 
                                               [(ngModel)]="config.labelHeight" 
                                               min="10" max="200" step="1">
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label">Columnas</label>
                                        <input type="number" class="form-control" 
                                               [(ngModel)]="config.columns" 
                                               min="1" max="5" step="1">
                                    </div>
                                </div>
                            </div>

                            <!-- Espaciado -->
                            <div class="mb-4">
                                <h6 class="fw-bold mb-3">
                                    <i class="bi bi-distribute-horizontal me-1"></i>Espaciado
                                </h6>
                                <div class="row g-3">
                                    <div class="col-md-6">
                                        <label class="form-label">Espacio entre columnas (mm)</label>
                                        <input type="number" class="form-control" 
                                               [(ngModel)]="config.columnGap" 
                                               min="0" max="20" step="0.5">
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label">Espacio entre filas (mm)</label>
                                        <input type="number" class="form-control" 
                                               [(ngModel)]="config.rowGap" 
                                               min="0" max="20" step="0.5">
                                    </div>
                                </div>
                            </div>

                            <!-- Márgenes -->
                            <div class="mb-4">
                                <h6 class="fw-bold mb-3">
                                    <i class="bi bi-border-outer me-1"></i>Márgenes de Página (mm)
                                </h6>
                                <div class="row g-3">
                                    <div class="col-3">
                                        <label class="form-label">Superior</label>
                                        <input type="number" class="form-control" 
                                               [(ngModel)]="config.marginTop" 
                                               min="0" max="50" step="0.5">
                                    </div>
                                    <div class="col-3">
                                        <label class="form-label">Izquierdo</label>
                                        <input type="number" class="form-control" 
                                               [(ngModel)]="config.marginLeft" 
                                               min="0" max="50" step="0.5">
                                    </div>
                                    <div class="col-3">
                                        <label class="form-label">Derecho</label>
                                        <input type="number" class="form-control" 
                                               [(ngModel)]="config.marginRight" 
                                               min="0" max="50" step="0.5">
                                    </div>
                                    <div class="col-3">
                                        <label class="form-label">Inferior</label>
                                        <input type="number" class="form-control" 
                                               [(ngModel)]="config.marginBottom" 
                                               min="0" max="50" step="0.5">
                                    </div>
                                </div>
                            </div>

                            <hr>

                            <!-- Campos a mostrar -->
                            <div class="mb-4">
                                <h6 class="fw-bold mb-3">
                                    <i class="bi bi-list-check me-1"></i>Campos a Mostrar en la Etiqueta
                                </h6>
                                <div class="row g-2">
                                    @for (field of availableFields; track field.key) {
                                        <div class="col-md-6">
                                            <div class="form-check form-switch">
                                                <input 
                                                    class="form-check-input" 
                                                    type="checkbox" 
                                                    [id]="field.key"
                                                    [(ngModel)]="config[field.key]">
                                                <label class="form-check-label" [for]="field.key">
                                                    <strong>{{ field.label }}</strong>
                                                    <br>
                                                    <small class="text-muted">{{ field.description }}</small>
                                                </label>
                                            </div>
                                        </div>
                                    }
                                </div>
                            </div>

                            <!-- Nombre de empresa -->
                            <div class="mb-3">
                                <label class="form-label fw-bold">
                                    <i class="bi bi-building me-1"></i>Nombre de la Empresa
                                </label>
                                <input type="text" class="form-control" 
                                       [(ngModel)]="config.companyName" 
                                       placeholder="Nombre que aparecerá en las etiquetas">
                            </div>

                            <!-- Preview del tamaño -->
                            <div class="alert alert-info">
                                <i class="bi bi-info-circle me-1"></i>
                                <strong>Ancho total del rollo:</strong> 
                                {{ calculateRollWidth() }}mm
                                ({{ config.columns }} columna(s) de {{ config.labelWidth }}mm)
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-outline-secondary" (click)="resetToDefault()">
                                <i class="bi bi-arrow-counterclockwise me-1"></i>
                                Restaurar Predeterminado
                            </button>
                            <button type="button" class="btn btn-secondary" (click)="closeModal()">
                                Cancelar
                            </button>
                            <button type="button" class="btn btn-primary" (click)="saveAndClose()">
                                <i class="bi bi-check-lg me-1"></i>
                                Guardar Configuración
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        }
    `
})
export class LabelConfigModalComponent implements OnInit {

    @Output() configSaved = new EventEmitter<LabelConfig>();

    private configService = inject(LabelConfigService);

    showModal = false;
    config: LabelConfig = {} as LabelConfig;
    presets: LabelConfig[] = [];
    availableFields: LabelField[] = AVAILABLE_LABEL_FIELDS;

    ngOnInit(): void {
        this.loadConfig();
        this.presets = this.configService.getPresets();
    }

    openModal(): void {
        this.loadConfig();
        this.showModal = true;
    }

    closeModal(): void {
        this.showModal = false;
    }

    loadConfig(): void {
        this.config = this.configService.getConfig();
    }

    applyPreset(index: number): void {
        this.config = this.configService.applyPreset(index);
    }

    resetToDefault(): void {
        this.config = this.configService.resetToDefault();
        toast.info('Configuración restaurada a valores predeterminados');
    }

    saveAndClose(): void {
        // Validaciones básicas
        if (this.config.labelWidth < 10 || this.config.labelHeight < 10) {
            toast.warning('Las dimensiones mínimas de la etiqueta son 10x10mm');
            return;
        }
        if (this.config.columns < 1) {
            toast.warning('Debe haber al menos 1 columna');
            return;
        }

        // Actualizar nombre del preset a "Personalizado" si se modificó
        this.config.presetName = 'Personalizado';
        
        this.configService.saveConfig(this.config);
        this.configSaved.emit(this.config);
        toast.success('Configuración de etiquetas guardada');
        this.closeModal();
    }

    calculateRollWidth(): number {
        return this.configService.calculateRollWidth(this.config);
    }
}
