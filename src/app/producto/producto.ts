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
}

export class Presentation {
    barcode: string = "";
    productCode: string = "";
    label: string = "";
    salePrice: number = 0;
    costPrice: number = 0;
    unitMeasure: UnitMeasure = UnitMeasure.UNIDAD;
    conversionFactor: number = 1;
}

export class Stock {
    quantity: number = 0;
    unitMeasure: UnitMeasure = UnitMeasure.UNIDAD;
}

export enum ESaleType {
    WEIGHT = 'WEIGHT',
    UNIT = 'UNIT',
    LONGITUDE = 'LONGITUD',
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
    LITROS = "LITROS",
    MILILITROS = "MILILITROS"
}

// Si necesitas asociar el factor de conversión, puedes usar un objeto auxiliar:
export const UnitMeasureConversion: { [key in UnitMeasure]: number } = {
    [UnitMeasure.KILOGRAMOS]: 1.0,
    [UnitMeasure.UNIDAD]: 1.0,
    [UnitMeasure.CENTIMETROS]: 0.01,
    [UnitMeasure.LITROS]: 1.0,
    [UnitMeasure.MILILITROS]: 0.001
};

export const UnitMeasureLabels: { [key in UnitMeasure]: string } = {
    [UnitMeasure.KILOGRAMOS]: "Kilogramos",
    [UnitMeasure.UNIDAD]: "Unidad",
    [UnitMeasure.CENTIMETROS]: "Centímetros",
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
