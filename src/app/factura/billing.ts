import { User } from "../auth/user";
import { Client } from "../cliente/cliente";
import { Order } from "../orden/orden";
import { Company } from "./company";
import { SaleDetail } from "./saleDetail";
import { formatInTimeZone } from 'date-fns-tz';

// Fecha por defecto en GMT-5 (America/Bogota)

export class Billing {
    id: any;
    billNumber: string = "";
    dateTimeRecord: string = formatInTimeZone(new Date(), 'America/Bogota', "yyyy-MM-dd'T'HH:mm:ssXXX");
    client: Client = new Client();
    order: Order = new Order();
    company: Company = new Company();
    saleDetails: SaleDetail[] = [];
    creationUser: User = new User();
    subTotalSale: number = 0;
    receivedValue: number = 0;
    returnedValue: number = 0;
    totalIVAT: number = 0;
    totalBilling: number = 0;
    billingType: string = "";
    paymentMethods: string[] = [];
    payments?: PaymentEntry[]; // Detalle de pagos por método (opcional)
    isReportInvoice: boolean = false;
    saleType: saleType = saleType.CONTADO;
}

// Detalle de pago por método (opcional en el payload)
export interface PaymentEntry {
    method: string;      // EFECTIVO, TRANSFERENCIA, TARJETA_CREDITO, etc.
    amount: number;      // Monto pagado en este método
    reference?: string;  // Referencia/nota opcional (No. transferencia, últimos 4, etc.)
}
export class BillingReportFilter {
    toDate: string = ''; // Formato 'yyyy-MM-dd'
    fromDate: string = '';
    billNumber: string = '';
    userSale: string = '';
    client: string = '';
    product: string = '';
}

export class ProductSalesSummary {
    id: string = '';
    totalAmount: number = 0;
    description: string = '';
    unitPrice: number = 0;
}

export enum saleType {
    CONTADO = 'CONTADO',
    CREDITO = 'CREDITO'
}

export function saleTypeFromString(value: unknown): saleType | undefined {
    if (typeof value !== 'string') return undefined;
    const normalized = value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toUpperCase();
    switch (normalized) {
        case 'CONTADO':
            return saleType.CONTADO;
        case 'CRÉDITO': // in case coming already upper with accent
        case 'CREDITO':
            return saleType.CREDITO;
        default:
            return undefined;
    }
}
    