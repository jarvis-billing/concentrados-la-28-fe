import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { urlConfig } from '../../../config/config';
import { CreatePermissionRequest, FeaturePermissionDto } from '../models/feature-permission';

@Injectable({ providedIn: 'root' })
export class FeaturePermissionService {
  private base = urlConfig.baseUrl + '/api/feature-permissions';

  constructor(private http: HttpClient) {}

  findAll(): Observable<FeaturePermissionDto[]> {
    return this.http.get<FeaturePermissionDto[]>(this.base);
  }

  /**
   * Verifica si un rol tiene acceso a una funcionalidad.
   * El backend comprueba si hay un permiso activo no expirado.
   */
  check(featureKey: string, role: string): Observable<{ granted: boolean }> {
    const params = new HttpParams()
      .set('featureKey', featureKey)
      .set('role', role);
    return this.http.get<{ granted: boolean }>(`${this.base}/check`, { params });
  }

  create(request: CreatePermissionRequest): Observable<FeaturePermissionDto> {
    return this.http.post<FeaturePermissionDto>(this.base, request);
  }

  revoke(id: string): Observable<FeaturePermissionDto> {
    return this.http.delete<FeaturePermissionDto>(`${this.base}/${id}`);
  }
}
