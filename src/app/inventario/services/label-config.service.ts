import { Injectable } from '@angular/core';
import { LabelConfig, DEFAULT_LABEL_CONFIG, LABEL_PRESETS } from '../models/label-config';

const STORAGE_KEY = 'labelConfig';

@Injectable({
    providedIn: 'root'
})
export class LabelConfigService {

    private currentConfig: LabelConfig = { ...DEFAULT_LABEL_CONFIG };

    constructor() {
        this.loadConfig();
    }

    /**
     * Obtiene la configuración actual
     */
    getConfig(): LabelConfig {
        return { ...this.currentConfig };
    }

    /**
     * Guarda la configuración
     */
    saveConfig(config: LabelConfig): void {
        this.currentConfig = { ...config };
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.currentConfig));
        } catch (e) {
            console.warn('Error saving label config to localStorage:', e);
        }
    }

    /**
     * Carga la configuración desde localStorage
     */
    loadConfig(): LabelConfig {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored) as LabelConfig;
                // Merge con defaults para asegurar que todos los campos existan
                this.currentConfig = { ...DEFAULT_LABEL_CONFIG, ...parsed };
            } else {
                this.currentConfig = { ...DEFAULT_LABEL_CONFIG };
            }
        } catch (e) {
            console.warn('Error loading label config from localStorage:', e);
            this.currentConfig = { ...DEFAULT_LABEL_CONFIG };
        }
        return { ...this.currentConfig };
    }

    /**
     * Resetea a la configuración por defecto
     */
    resetToDefault(): LabelConfig {
        this.currentConfig = { ...DEFAULT_LABEL_CONFIG };
        this.saveConfig(this.currentConfig);
        return { ...this.currentConfig };
    }

    /**
     * Aplica un preset predefinido
     */
    applyPreset(presetIndex: number): LabelConfig {
        if (presetIndex >= 0 && presetIndex < LABEL_PRESETS.length) {
            this.currentConfig = { ...LABEL_PRESETS[presetIndex] };
            this.saveConfig(this.currentConfig);
        }
        return { ...this.currentConfig };
    }

    /**
     * Obtiene todos los presets disponibles
     */
    getPresets(): LabelConfig[] {
        return LABEL_PRESETS.map(p => ({ ...p }));
    }

    /**
     * Calcula el ancho total del rollo basado en la configuración
     */
    calculateRollWidth(config: LabelConfig): number {
        return config.marginLeft + 
               (config.labelWidth * config.columns) + 
               (config.columnGap * (config.columns - 1)) + 
               config.marginRight;
    }
}
