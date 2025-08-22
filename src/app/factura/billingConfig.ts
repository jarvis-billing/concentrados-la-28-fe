export class BillingConfig {
    id: string = "";
    bankAccountType: string = "";
    billingType: string = "";
    paymentMethods: string[] = [];
    resolutionExpiresDate: string = "";
    billFrom: number = 0;
    billUntil: number = 0;
    bank: string = "";
    bankAccountNumber: string = "";
    prefixBill: string = "";
    dianResolutionNumber: string = "";
    taxRegime: string = "";
    isCurrentResolution: boolean = false;
}