import { ESaleType } from './producto';

export type SaleMode = 'NORMAL' | 'BULK' | 'FIXED_FULL' | 'FIXED_HALF';

/**
 * Configuración de un tipo de embalaje.
 * Cada embalaje pertenece a un tipo de venta y deriva un modo de venta interno.
 */
export interface PackageTypeConfig {
    /** Clave interna (se guarda en la BD) */
    key: string;
    /** Etiqueta visible al usuario */
    label: string;
    /** Modo de venta derivado */
    saleMode: SaleMode;
    /**
     * Plantilla para auto-generar la etiqueta de impresión.
     * Variables disponibles: {desc} {size} {unit}
     */
    labelTemplate: string;
    /** Si true, muestra el campo de tamaño/cantidad del embalaje */
    needsSize: boolean;
    /** Ícono Bootstrap */
    icon: string;
    /** Color del chip */
    chipClass: string;
}

/**
 * Embalajes disponibles por tipo de venta del producto.
 * Orden: primero el más común, luego variantes.
 */
export const PACKAGE_TYPES_BY_SALE_TYPE: Record<string, PackageTypeConfig[]> = {

    [ESaleType.WEIGHT]: [
        { key: 'GRANEL',      label: 'Granel',       saleMode: 'BULK',       labelTemplate: '{desc} - GRANEL {unit}',           needsSize: false, icon: 'bi-droplet-half', chipClass: 'pkg-bulk'  },
        { key: 'BULTO',       label: 'Bulto',        saleMode: 'FIXED_FULL', labelTemplate: '{desc} - BULTO {size} {unit}',      needsSize: true,  icon: 'bi-box-seam',     chipClass: 'pkg-fixed' },
        { key: 'MEDIO_BULTO', label: 'Medio Bulto',  saleMode: 'FIXED_HALF', labelTemplate: '{desc} - MEDIO BULTO {size} {unit}',needsSize: true,  icon: 'bi-box',          chipClass: 'pkg-half'  },
        { key: 'SACO',        label: 'Saco',         saleMode: 'FIXED_FULL', labelTemplate: '{desc} - SACO {size} {unit}',       needsSize: true,  icon: 'bi-bag',          chipClass: 'pkg-fixed' },
        { key: 'BOLSA',       label: 'Bolsa',        saleMode: 'FIXED_FULL', labelTemplate: '{desc} - BOLSA {size} {unit}',      needsSize: true,  icon: 'bi-bag-fill',     chipClass: 'pkg-fixed' },
        { key: 'KG_UNIDAD',   label: 'Por Kilo',     saleMode: 'NORMAL',     labelTemplate: '{desc} - 1 {unit}',                needsSize: false, icon: 'bi-scale',        chipClass: 'pkg-normal'},
    ],

    [ESaleType.UNIT]: [
        { key: 'UNIDAD',   label: 'Unidad',   saleMode: 'NORMAL',     labelTemplate: '{desc}',                       needsSize: false, icon: 'bi-box2',           chipClass: 'pkg-normal'},
        { key: 'CAJA',     label: 'Caja',     saleMode: 'FIXED_FULL', labelTemplate: '{desc} - CAJA x{size} UN',     needsSize: true,  icon: 'bi-archive',        chipClass: 'pkg-fixed' },
        { key: 'PAQUETE',  label: 'Paquete',  saleMode: 'FIXED_FULL', labelTemplate: '{desc} - PAQUETE x{size} UN',  needsSize: true,  icon: 'bi-bag-check',      chipClass: 'pkg-fixed' },
        { key: 'DISPLAY',  label: 'Display',  saleMode: 'FIXED_FULL', labelTemplate: '{desc} - DISPLAY x{size} UN',  needsSize: true,  icon: 'bi-grid-3x3-gap',   chipClass: 'pkg-fixed' },
        { key: 'BLISTER',  label: 'Blíster',  saleMode: 'FIXED_FULL', labelTemplate: '{desc} - BLISTER x{size} UN',  needsSize: true,  icon: 'bi-square-half',    chipClass: 'pkg-fixed' },
        { key: 'ROLLO_UN', label: 'Rollo',    saleMode: 'FIXED_FULL', labelTemplate: '{desc} - ROLLO x{size} UN',    needsSize: true,  icon: 'bi-record-circle',  chipClass: 'pkg-fixed' },
    ],

    [ESaleType.LONGITUDE]: [
        { key: 'POR_METRO', label: 'Por Metro', saleMode: 'BULK',       labelTemplate: '{desc} - Por metro',          needsSize: false, icon: 'bi-rulers',         chipClass: 'pkg-bulk'  },
        { key: 'ROLLO',     label: 'Rollo',     saleMode: 'FIXED_FULL', labelTemplate: '{desc} - ROLLO {size} m',     needsSize: true,  icon: 'bi-record-circle',  chipClass: 'pkg-fixed' },
        { key: 'CARRETE',   label: 'Carrete',   saleMode: 'FIXED_FULL', labelTemplate: '{desc} - CARRETE {size} m',   needsSize: true,  icon: 'bi-circle',         chipClass: 'pkg-fixed' },
        { key: 'MADEJA',    label: 'Madeja',    saleMode: 'FIXED_FULL', labelTemplate: '{desc} - MADEJA {size} m',    needsSize: true,  icon: 'bi-infinity',       chipClass: 'pkg-fixed' },
        { key: 'BOBINA',    label: 'Bobina',    saleMode: 'FIXED_FULL', labelTemplate: '{desc} - BOBINA {size} m',    needsSize: true,  icon: 'bi-disc',           chipClass: 'pkg-fixed' },
        { key: 'POR_CM',    label: 'Por cm',    saleMode: 'BULK',       labelTemplate: '{desc} - Por centímetro',     needsSize: false, icon: 'bi-dash-lg',        chipClass: 'pkg-bulk'  },
    ],

    [ESaleType.VOLUME]: [
        { key: 'GRANEL_V',  label: 'Granel',   saleMode: 'BULK',       labelTemplate: '{desc} - GRANEL {unit}',       needsSize: false, icon: 'bi-water',          chipClass: 'pkg-bulk'  },
        { key: 'BOTELLA',   label: 'Botella',  saleMode: 'FIXED_FULL', labelTemplate: '{desc} - BOTELLA {size} {unit}',needsSize: true,  icon: 'bi-cup-straw',      chipClass: 'pkg-fixed' },
        { key: 'GALON',     label: 'Galón',    saleMode: 'FIXED_FULL', labelTemplate: '{desc} - GALÓN {size} {unit}', needsSize: true,  icon: 'bi-bucket',         chipClass: 'pkg-fixed' },
        { key: 'CANECA',    label: 'Caneca',   saleMode: 'FIXED_FULL', labelTemplate: '{desc} - CANECA {size} {unit}',needsSize: true,  icon: 'bi-trash3',         chipClass: 'pkg-fixed' },
        { key: 'TARRO',     label: 'Tarro',    saleMode: 'FIXED_FULL', labelTemplate: '{desc} - TARRO {size} {unit}', needsSize: true,  icon: 'bi-box-fill',       chipClass: 'pkg-fixed' },
        { key: 'LITRO',     label: 'Litro',    saleMode: 'NORMAL',     labelTemplate: '{desc} - 1 {unit}',            needsSize: false, icon: 'bi-droplet',        chipClass: 'pkg-normal'},
    ],

    [ESaleType.OTHER]: [
        { key: 'OTRO',     label: 'Otro',     saleMode: 'NORMAL',     labelTemplate: '{desc}',                       needsSize: false, icon: 'bi-three-dots',     chipClass: 'pkg-normal'},
        { key: 'CAJA_O',   label: 'Caja',     saleMode: 'FIXED_FULL', labelTemplate: '{desc} - CAJA x{size}',        needsSize: true,  icon: 'bi-archive',        chipClass: 'pkg-fixed' },
    ],
};

/** Obtiene los embalajes disponibles para un tipo de venta */
export function getPackageTypes(saleType: string): PackageTypeConfig[] {
    return PACKAGE_TYPES_BY_SALE_TYPE[saleType] ?? PACKAGE_TYPES_BY_SALE_TYPE[ESaleType.OTHER];
}

/** Busca la configuración de un embalaje por su key */
export function findPackageType(saleType: string, key: string): PackageTypeConfig | undefined {
    return getPackageTypes(saleType).find(p => p.key === key);
}

/**
 * Genera la etiqueta de la presentación a partir de la plantilla,
 * la descripción del producto, el tamaño y la unidad de medida.
 */
export function buildPackageLabel(
    template: string,
    desc: string,
    size: number | null | undefined,
    unit: string
): string {
    return template
        .replace('{desc}', desc)
        .replace('{size}', size != null ? String(size) : '')
        .replace('{unit}', unit)
        .trim()
        .replace(/\s+/g, ' ');   // limpiar espacios dobles si size está vacío
}
