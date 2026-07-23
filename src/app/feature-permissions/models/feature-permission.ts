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
export const FEATURE_KEYS: { key: string; name: string }[] = [
  { key: 'INVENTORY_COUNT', name: 'Conteo Físico de Inventario' },
];
