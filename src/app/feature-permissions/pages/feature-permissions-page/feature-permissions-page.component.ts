import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { toast } from 'ngx-sonner';
import { FeaturePermissionService } from '../../services/feature-permission.service';
import { CreatePermissionRequest, FeaturePermissionDto, FEATURE_KEYS, PermissionType } from '../../models/feature-permission';

@Component({
  selector: 'app-feature-permissions-page',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './feature-permissions-page.component.html',
})
export class FeaturePermissionsPageComponent implements OnInit {
  private service = inject(FeaturePermissionService);
  private fb      = inject(FormBuilder);

  permissions: FeaturePermissionDto[] = [];
  isLoading = false;
  isSaving  = false;
  showForm  = false;

  featureKeys = FEATURE_KEYS;
  availableRoles = ['VENDEDOR', 'FACTURADOR'];

  form!: FormGroup;

  ngOnInit(): void {
    this.loadAll();
    this.initForm();
  }

  loadAll(): void {
    this.isLoading = true;
    this.service.findAll().subscribe({
      next: (list) => { this.permissions = list; this.isLoading = false; },
      error: () => { toast.error('Error al cargar los permisos'); this.isLoading = false; },
    });
  }

  initForm(): void {
    this.form = this.fb.group({
      featureKey:   ['INVENTORY_COUNT', Validators.required],
      featureName:  ['Conteo Físico de Inventario', Validators.required],
      type:         ['PERMANENT', Validators.required],
      expiresAt:    [null],
      grantedRoles: [['VENDEDOR'], Validators.required],
      notes:        [''],
    });

    // Sincronizar featureName cuando cambia featureKey
    this.form.get('featureKey')?.valueChanges.subscribe(key => {
      const found = this.featureKeys.find(f => f.key === key);
      if (found) this.form.patchValue({ featureName: found.name }, { emitEvent: false });
    });
  }

  onTypeChange(): void {
    const type = this.form.get('type')?.value as PermissionType;
    if (type === 'PERMANENT') {
      this.form.get('expiresAt')?.setValue(null);
      this.form.get('expiresAt')?.clearValidators();
    } else {
      this.form.get('expiresAt')?.setValidators(Validators.required);
    }
    this.form.get('expiresAt')?.updateValueAndValidity();
  }

  toggleRole(role: string): void {
    const current: string[] = this.form.get('grantedRoles')?.value ?? [];
    const updated = current.includes(role)
      ? current.filter(r => r !== role)
      : [...current, role];
    this.form.patchValue({ grantedRoles: updated });
  }

  isRoleSelected(role: string): boolean {
    return (this.form.get('grantedRoles')?.value ?? []).includes(role);
  }

  submit(): void {
    if (this.form.invalid || this.isSaving) return;
    const v = this.form.getRawValue();

    if (v.grantedRoles.length === 0) {
      toast.warning('Selecciona al menos un rol');
      return;
    }

    const req: CreatePermissionRequest = {
      featureKey:   v.featureKey,
      featureName:  v.featureName,
      type:         v.type,
      grantedRoles: v.grantedRoles,
      notes:        v.notes || undefined,
      expiresAt:    v.type === 'TEMPORARY' && v.expiresAt ? new Date(v.expiresAt).toISOString() : undefined,
    };

    this.isSaving = true;
    this.service.create(req).subscribe({
      next: (created) => {
        this.permissions.unshift(created);
        this.isSaving = false;
        this.showForm = false;
        this.initForm();
        toast.success(`Permiso creado para ${created.featureName}`);
      },
      error: () => { this.isSaving = false; toast.error('Error al crear el permiso'); },
    });
  }

  revoke(perm: FeaturePermissionDto): void {
    toast.warning(`¿Revocar el permiso de "${perm.featureName}"?`, {
      description: `Roles afectados: ${perm.grantedRoles.join(', ')}`,
      action: {
        label: 'Sí, revocar',
        onClick: () => {
          this.service.revoke(perm.id).subscribe({
            next: (updated) => {
              const idx = this.permissions.findIndex(p => p.id === updated.id);
              if (idx >= 0) this.permissions[idx] = updated;
              toast.success('Permiso revocado');
            },
            error: () => toast.error('Error al revocar el permiso'),
          });
        },
      },
    });
  }

  typeLabel(type: PermissionType): string {
    return type === 'PERMANENT' ? 'Permanente' : 'Temporal';
  }

  statusBadge(perm: FeaturePermissionDto): { text: string; cls: string } {
    if (!perm.active) return { text: 'Revocado', cls: 'bg-secondary' };
    if (perm.expired)  return { text: 'Expirado', cls: 'bg-warning text-dark' };
    return { text: 'Activo', cls: 'bg-success' };
  }

  formatDate(iso?: string): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
  }

  get activePermissions(): FeaturePermissionDto[] {
    return this.permissions.filter(p => p.active && !p.expired);
  }

  get inactivePermissions(): FeaturePermissionDto[] {
    return this.permissions.filter(p => !p.active || p.expired);
  }
}
