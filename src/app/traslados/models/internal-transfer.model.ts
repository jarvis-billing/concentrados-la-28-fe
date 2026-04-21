export type InternalTransferType = 'TRASLADO_EFECTIVO_BANCO';
export type InternalTransferStatus = 'ACTIVO' | 'ANULADO';
export type BankAccountType = 'AHORROS' | 'CORRIENTE';

export interface CashToBankTransferRequest {
    amount: number;
    accountNumber: string;
    bankName?: string;
    accountType?: BankAccountType;
    reference: string;
    transferDate?: string;
    notes?: string;
    supportFile?: File;
}

export interface InternalTransfer {
    id: string;
    transferDate: string;
    transferDateTime: string;
    amount: number;
    type: InternalTransferType;
    sourceId: string;
    destinationBankName?: string;
    destinationAccountNumber?: string;
    destinationAccountType?: BankAccountType;
    responsibleUserId?: string;
    responsibleUserName?: string;
    reference: string;
    notes?: string;
    supportFileUrl?: string;
    supportFileName?: string;
    status: InternalTransferStatus;
    cancelledAt?: string;
    cancelReason?: string;
    createdAt: string;
}
