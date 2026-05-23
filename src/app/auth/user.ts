import { Company } from "../factura/company";

export const USER_ROLES = ['ADMIN', 'FACTURADOR', 'VENDEDOR'] as const;
export type UserRole = typeof USER_ROLES[number];

export class User {
    id: string = "";
    numberIdentity: string = "";
    password: string = "";
    name: string = "";
    surname: string = "";
    phone: string = "";
    address: string = "";
    company: Company = new Company();
    rol: UserRole | string = "";
    fullName: string = "";
    createdAt: string = "";
    updatedAt: string = "";
    createdBy: string = "";
    updatedBy: string = "";
}

export interface CreateUserRequest {
    numberIdentity: string;
    password: string;
    name: string;
    surname: string;
    phone: string;
    address: string;
    rol: string;
}

export interface UpdateUserRequest {
    name: string;
    surname: string;
    phone: string;
    address: string;
    rol: string;
}

export interface ChangePasswordRequest {
    newPassword: string;
}