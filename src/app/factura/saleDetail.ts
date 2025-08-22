import { Product } from "../producto/producto";

export class SaleDetail {
    id: string = "";
    product: Product = new Product();
    amount: number = 0;
    unitPrice: number = 0;
    subTotal: number = 0;
    totalVat: number = 0;
}