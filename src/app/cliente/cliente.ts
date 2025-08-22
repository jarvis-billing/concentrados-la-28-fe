export class Client {
    id: string = "";
    idNumber: string = "";
    name: string = "";
    surname: string = "";
    address: string = "";
    phone: string = "";
    email: string = "";
    businessName: string = "";
    autoReportBilling: boolean = true;
    clientType: EClient = EClient.NATURAL;
    documentType: EDocument = EDocument.default;
    nickname: string = "";
    fullName: string = "";
  }
  
  export enum EClient {
    NATURAL = 'NATURAL',
    JURIDICO = 'JURIDICO'
  }
  
  export enum EDocument {
    CEDULA_CIUDADANIA = 'CEDULA CIUDADANIA',
    NIT = 'NIT',
    PASAPORTE = 'PASAPORTE',
    CEDULA_EXTRANJERIA = 'CEDULA EXTRANJERIA',
    default = "",
  }

  export class SearchCriteriaClient {
    idNumber: string = "";
    documentType: string = EDocument.CEDULA_CIUDADANIA;
  }

