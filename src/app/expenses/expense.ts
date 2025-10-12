export interface Expense {
  id?: string;
  dateTimeRecord: string; // ISO string
  amount: number;
  paymentMethod: 'EFECTIVO' | 'TRANSFERENCIA' | 'TARJETA_CREDITO' | 'TARJETA_DEBITO' | 'CHEQUE' | string;
  category: string; // e.g., Transporte, Servicios, Suministros
  description: string;
  reference?: string; // numero de referencia o nota
  source?: string; // pantalla origen
  createdBy?: string; // username/id
}
