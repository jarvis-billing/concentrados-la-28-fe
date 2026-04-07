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
    templateUrl: './label-config-modal.component.html',
    styleUrl: './label-config-modal.component.css'
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
