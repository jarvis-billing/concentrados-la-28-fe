export enum CatalogType {
  BRAND = 'BRAND',
  CATEGORY = 'CATEGORY'
}

export interface Catalog {
  id?: string;
  value: string;
  type: CatalogType;
  active?: boolean;
  createdAt?: Date;
  useCount?: number;
}