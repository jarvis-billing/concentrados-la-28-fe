export type SupplierStatus = 'ACTIVE' | 'INACTIVE';

export interface Supplier {
  id?: string;
  name: string;
  documentType: 'NIT' | 'CC' | 'CE' | 'PASAPORTE';
  idNumber: string;
  phone?: string;
  email?: string;
  address: string; // domicilio
  status: SupplierStatus;
}
