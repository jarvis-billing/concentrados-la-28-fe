export class Product {
    id: string = "";
    description: string = "";
    saleType: ESaleType = ESaleType.WEIGHT;
    brand: string = "";
    category: string = "";
    productCode: string = "";
    presentations: Presentation[] = [];
    stock: Stock = new Stock();
    vatValue: number | null = null;
    vatType: EVatType | null = null;
    selected: boolean = false;
    totalValue: number = 0;
    amount: number = 0;
    price: number = 0;
    barcode: string = "";
    // Set at runtime when the chosen presentation is bulk ("granel")
    isBulk?: boolean;
    // Unit measure of the selected presentation (for display/calculations)
    selectedUnitMeasure?: UnitMeasure;
    // Label of the selected presentation (for display in modals)
    selectedPresentationLabel?: string;
    // Fixed amount flag for pack-sized presentations (e.g., bulto/medio bulto)
    hasFixedAmount?: boolean;
    fixedAmount?: number;
    // Backend-computed stock presentation (packs/rollos + remainder)
    displayStock?: DisplayStock;
}

export class Presentation {
    barcode: string = "";
    productCode: string = "";
    label: string = "";
    salePrice: number = 0;
    costPrice: number = 0;
    unitMeasure: UnitMeasure = UnitMeasure.UNIDAD;
    // Explicit flags to define behavior (flexible, scalable)
    isBulk?: boolean;            // true when this presentation is sold in bulk (granel)
    isFixedAmount?: boolean;     // true when this presentation has a fixed amount (e.g., bulto)
    fixedAmount?: number;        // the fixed amount (e.g., 40 kg for bulto, 20 kg for medio bulto)
}

export class Stock {
    quantity: number = 0;
    unitMeasure: UnitMeasure = UnitMeasure.UNIDAD;
}

export enum ESaleType {
    WEIGHT = 'WEIGHT',
    UNIT = 'UNIT',
    LONGITUDE = 'LONGITUDE',
    VOLUME = 'VOLUME',
    OTHER = 'OTHER'
}

export enum EVatType {
    TARIFA_GENERAL = 'TARIFA_GENERAL',
    TARIFA_REDUCIDA = 'TARIFA_REDUCIDA',
    TARIFA_CERO = 'TARIFA_CERO'
}

export enum ESale {
    PESO = 'PESO',
    UNIDAD = 'UNIDAD'
}

export enum UnitMeasure {
    KILOGRAMOS = "KILOGRAMOS",
    UNIDAD = "UNIDAD",
    CENTIMETROS = "CENTIMETROS",
    METROS = "METROS",
    LITROS = "LITROS",
    MILILITROS = "MILILITROS"
}

// Si necesitas asociar el factor de conversión, puedes usar un objeto auxiliar:
export const UnitMeasureConversion: { [key in UnitMeasure]: number } = {
    [UnitMeasure.KILOGRAMOS]: 1.0,
    [UnitMeasure.UNIDAD]: 1.0,
    [UnitMeasure.CENTIMETROS]: 0.01,
    [UnitMeasure.METROS]: 1.0,
    [UnitMeasure.LITROS]: 1.0,
    [UnitMeasure.MILILITROS]: 0.001
};

export const UnitMeasureLabels: { [key in UnitMeasure]: string } = {
    [UnitMeasure.KILOGRAMOS]: "Kilogramos",
    [UnitMeasure.UNIDAD]: "Unidad",
    [UnitMeasure.CENTIMETROS]: "Centímetros",
    [UnitMeasure.METROS]: "Metros",
    [UnitMeasure.LITROS]: "Litros",
    [UnitMeasure.MILILITROS]: "Mililitros"
};

export const SaleTypeLabels: { [key in ESaleType]: string } = {
    [ESaleType.WEIGHT]: "Peso",
    [ESaleType.UNIT]: "Unidad",
    [ESaleType.LONGITUDE]: "Longitud",
    [ESaleType.VOLUME]: "Volumen",
    [ESaleType.OTHER]: "Otro"
};

export interface ProductCodeResponse {
  value: string;
}

// Backend-computed stock presentation helper
export interface DisplayStock {
  kind: 'WEIGHT' | 'LONGITUDE' | null;
  packSize: number | null;
  packs: number | null;
  remainder: number | null;
  unit: string;
  label: string;       // e.g., "12 bultos + 8 kg" or fallback "248 kg"
  computedAt?: string; // ISO timestamp
}
