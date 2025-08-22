import { EVat } from "./producto";

export class Vat {
    id: string = '';
    vatType: EVat = EVat.TARIFA_CERO;
    percentage: number = 0;
}