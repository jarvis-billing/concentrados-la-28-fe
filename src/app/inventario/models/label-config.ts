/**
 * Configuración de etiquetas para impresión
 */
export interface LabelConfig {
    // Dimensiones de la etiqueta en mm
    labelWidth: number;
    labelHeight: number;
    
    // Configuración del rollo/página
    columns: number;           // Número de columnas de etiquetas
    columnGap: number;         // Espacio entre columnas en mm
    rowGap: number;            // Espacio entre filas en mm
    
    // Márgenes de la página en mm
    marginTop: number;
    marginLeft: number;
    marginRight: number;
    marginBottom: number;
    
    // Campos a mostrar en la etiqueta
    showCompanyName: boolean;
    showBarcode: boolean;
    showBarcodeNumber: boolean;
    showDescription: boolean;
    showPrice: boolean;
    
    // Nombre de la empresa (personalizable)
    companyName: string;
    
    // Nombre del preset para identificarlo
    presetName: string;
}

/**
 * Campos disponibles para mostrar en la etiqueta
 */
export interface LabelField {
    key: keyof Pick<LabelConfig, 'showCompanyName' | 'showBarcode' | 'showBarcodeNumber' | 'showDescription' | 'showPrice'>;
    label: string;
    description: string;
}

/**
 * Lista de campos disponibles para configurar
 */
export const AVAILABLE_LABEL_FIELDS: LabelField[] = [
    { key: 'showCompanyName', label: 'Razón Social', description: 'Nombre de la empresa en la parte superior' },
    { key: 'showBarcode', label: 'Código de Barras', description: 'Imagen del código de barras' },
    { key: 'showBarcodeNumber', label: 'Número de Código', description: 'Número debajo del código de barras' },
    { key: 'showDescription', label: 'Descripción/Presentación', description: 'Descripción del producto' },
    { key: 'showPrice', label: 'Precio de Venta', description: 'Precio del producto' }
];

/**
 * Configuración por defecto (etiqueta 50x25mm, 1 columna)
 */
export const DEFAULT_LABEL_CONFIG: LabelConfig = {
    labelWidth: 50,
    labelHeight: 25,
    columns: 1,
    columnGap: 2,
    rowGap: 0,
    marginTop: 0,
    marginLeft: 0,
    marginRight: 0,
    marginBottom: 0,
    showCompanyName: true,
    showBarcode: true,
    showBarcodeNumber: true,
    showDescription: true,
    showPrice: true,
    companyName: 'CONCENTRADOS LA 28',
    presetName: 'Etiqueta 50x25mm (1 columna)'
};

/**
 * Presets predefinidos de configuración
 */
export const LABEL_PRESETS: LabelConfig[] = [
    {
        ...DEFAULT_LABEL_CONFIG,
        presetName: 'Etiqueta 50x25mm (1 columna)'
    },
    {
        labelWidth: 32,
        labelHeight: 25,
        columns: 2,
        columnGap: 2,
        rowGap: 0,
        marginTop: 0,
        marginLeft: 0,
        marginRight: 0,
        marginBottom: 0,
        showCompanyName: true,
        showBarcode: true,
        showBarcodeNumber: true,
        showDescription: true,
        showPrice: true,
        companyName: 'CONCENTRADOS LA 28',
        presetName: 'Etiqueta 32x25mm (2 columnas)'
    },
    {
        labelWidth: 40,
        labelHeight: 30,
        columns: 2,
        columnGap: 3,
        rowGap: 2,
        marginTop: 0,
        marginLeft: 0,
        marginRight: 0,
        marginBottom: 0,
        showCompanyName: true,
        showBarcode: true,
        showBarcodeNumber: true,
        showDescription: true,
        showPrice: true,
        companyName: 'CONCENTRADOS LA 28',
        presetName: 'Etiqueta 40x30mm (2 columnas)'
    },
    {
        labelWidth: 30,
        labelHeight: 20,
        columns: 3,
        columnGap: 2,
        rowGap: 2,
        marginTop: 0,
        marginLeft: 0,
        marginRight: 0,
        marginBottom: 0,
        showCompanyName: false,
        showBarcode: true,
        showBarcodeNumber: true,
        showDescription: true,
        showPrice: true,
        companyName: 'CONCENTRADOS LA 28',
        presetName: 'Etiqueta 30x20mm (3 columnas, sin empresa)'
    }
];
