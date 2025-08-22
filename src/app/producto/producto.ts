export class Product {
    id: string = "";
    barcode: string = "";
    description: string = "";
    price: number = 0;
    amount: number = 0;
    totalValue: number = 0;
    saleType: ESale = ESale.UNIDAD;
    currentStock: number = 0;
    minStock: number = 0;
    brand: string = "";
    pluCode: string = "";
    category: Category = new Category;
    vatValue: number = 0;
    vatType: EVat = EVat.TARIFA_CERO;
    cost: number = 0;
    selected: boolean = false;
}

export enum ESale {
    PESO = 'PESO',
    UNIDAD = 'UNIDAD'
}

export class Category {
    id: string = "";
    description: string = "";
}

export enum EVat {
    TARIFA_GENERAL = 'TARIFA_GENERAL',
    TARIFA_REDUCIDA = 'TARIFA_REDUCIDA',
    TARIFA_CERO = 'TARIFA_CERO'
}