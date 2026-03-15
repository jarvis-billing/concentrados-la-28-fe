export type CashLoanStatus = 'PENDIENTE' | 'DEVUELTO' | 'ANULADO';

export interface CashLoan {
    id: string;
    loanDate: string;
    amount: number;
    borrower: string;
    reason: string | null;
    notes: string | null;
    status: CashLoanStatus;
    returnDate: string | null;
    returnedAmount: number | null;
    returnNotes: string | null;
    createdBy: string;
    createdAt: string;
    updatedAt: string | null;
}

export interface CreateCashLoanRequest {
    loanDate?: string;
    amount: number;
    borrower: string;
    reason?: string | null;
    notes?: string | null;
}

export interface ReturnCashLoanRequest {
    returnDate?: string;
    returnedAmount: number;
    returnNotes?: string | null;
}

export interface CashLoanFilter {
    fromDate?: string;
    toDate?: string;
    status?: CashLoanStatus;
}
