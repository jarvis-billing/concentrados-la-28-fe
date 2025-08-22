import { User } from "../auth/user";
import { Client } from "../cliente/cliente";
import { Product } from "../producto/producto";

export class Order {
    id: string = "";
    orderNumber: number = 0;
    totalOrder: number = 0;
    products: Product[] = [];
    creationDate?: Date;
    updateDate?: Date;
    creationUser?: User;
    status?: EStatusOrder = EStatusOrder.INICIADO;
    client: Client = new Client();
  }
  
  export enum EStatusOrder {
    INICIADO = 'INICIADO',
    FINALIZADO = 'FINALIZADO',
    FACTURADO = 'FACTURADO',
  }