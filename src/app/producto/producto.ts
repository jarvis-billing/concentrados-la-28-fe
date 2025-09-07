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
}

export class Presentation {
    barcode: string = "";
    productCode: string = "";
    label: string = "";
    salePrice: number = 0;
    costPrice: number = 0;
    unitMeasure: string = "";
    conversionFactor: number = 1;
}

export class Stock {
    quantity: number = 0;
    unitMeasure: string = "";
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
