export type BankAccountType = 'AHORROS' | 'CORRIENTE';

export interface BankAccountDto {
    id: string;
    name: string;
    bankName: string;
    accountNumber: string;
    accountType: BankAccountType;
    active: boolean;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface CreateBankAccountRequest {
    name: string;
    bankName: string;
    accountNumber: string;
    accountType: BankAccountType;
    notes?: string;
}
