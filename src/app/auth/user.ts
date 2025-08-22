import { Company } from "../factura/company";

export class User {
    id: string = "";
    numberIdentity: string = "";
    password: string = "";
    name: string = "";
    surname: string = "";
    phone: string = "";
    address: string = "";
    company: Company = new Company();
    rol: string = "";
    fullName: string = "";
}