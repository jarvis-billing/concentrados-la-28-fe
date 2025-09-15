import { EVatType } from "./producto";

export class Vat {
    id: string = '';
    vatType: EVatType = EVatType.TARIFA_CERO;
    percentage: number = 0;
}