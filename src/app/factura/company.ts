import { BillingConfig } from "./billingConfig";

export class Company {
    id: string = "";
    nit: string = "";
    businessName: string = "";
    phone: string = "";
    address: string = "";
    email: string = "";
    status: string = "ACTIVO";
    billingConfig: BillingConfig = new BillingConfig();
}