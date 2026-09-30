export type PermissionType = 'PERMANENT' | 'TEMPORARY';

export interface FeaturePermissionDto {
  id: string;
  featureKey: string;
  featureName: string;
  grantedRoles: string[];
  type: PermissionType;
  expiresAt?: string;
  grantedBy: string;
  grantedAt: string;
  active: boolean;
  notes?: string;
  /** true si el permiso temporal ya venció */
  expired: boolean;
}

export interface CreatePermissionRequest {
  featureKey: string;
  featureName: string;
  grantedRoles: string[];
  type: PermissionType;
  /** ISO datetime string — solo para TEMPORARY */
  expiresAt?: string;
  notes?: string;
}

/** Claves predefinidas de funcionalidades que usan el sistema de permisos */
export const FEATURE_KEYS: { key: string; name: string; isGlobal?: boolean; description?: string }[] = [
  { key: 'INVENTORY_COUNT', name: 'Conteo Físico de Inventario' },
  {
    key: 'STOCK_VALIDATION',
    name: 'Validación de Stock en Ventas',
    isGlobal: true,
    description: 'Cuando está activa, advierte al operador si un producto tiene stock cero antes de agregarlo a una venta o pre-venta.',
  },
];
