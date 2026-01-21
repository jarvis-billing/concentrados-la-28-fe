import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { urlConfig } from '../../../config/config';
import { InventoryMovement, InventoryMovementFilter } from '../models/inventory-movement';
import { PhysicalInventory, PhysicalInventoryFilter, PhysicalInventoryByPresentationsRequest } from '../models/physical-inventory';
import { InventoryAdjustment, InventoryAdjustmentFilter } from '../models/inventory-adjustment';
import { InventoryDashboard, StockAlert } from '../models/inventory-dashboard';

@Injectable({
  providedIn: 'root'
})
export class InventoryService {
  private http = inject(HttpClient);
  private baseUrl = urlConfig.getInventoryServiceUrl();

  // ============ MOVIMIENTOS DE INVENTARIO ============
  
  getMovements(filter?: InventoryMovementFilter): Observable<InventoryMovement[]> {
    let params = new HttpParams();
    if (filter?.startDate) params = params.set('startDate', filter.startDate);
    if (filter?.endDate) params = params.set('endDate', filter.endDate);
    if (filter?.productId) params = params.set('productId', filter.productId);
    if (filter?.movementType) params = params.set('movementType', filter.movementType);
    if (filter?.userId) params = params.set('userId', filter.userId);
    
    return this.http.get<InventoryMovement[]>(`${this.baseUrl}/movements`, { params });
  }

  getMovementsByProduct(productId: string): Observable<InventoryMovement[]> {
    return this.http.get<InventoryMovement[]>(`${this.baseUrl}/movements/product/${productId}`);
  }

  getMovementById(id: string): Observable<InventoryMovement> {
    return this.http.get<InventoryMovement>(`${this.baseUrl}/movements/${id}`);
  }

  createMovement(movement: Partial<InventoryMovement>): Observable<InventoryMovement> {
    return this.http.post<InventoryMovement>(`${this.baseUrl}/movements`, movement);
  }

  // ============ INVENTARIO FÍSICO ============
  
  getPhysicalInventories(filter?: PhysicalInventoryFilter): Observable<PhysicalInventory[]> {
    let params = new HttpParams();
    if (filter?.startDate) params = params.set('startDate', filter.startDate);
    if (filter?.endDate) params = params.set('endDate', filter.endDate);
    if (filter?.productId) params = params.set('productId', filter.productId);
    if (filter?.adjustmentReason) params = params.set('adjustmentReason', filter.adjustmentReason);
    
    return this.http.get<PhysicalInventory[]>(`${this.baseUrl}/physical-count`, { params });
  }

  getPhysicalInventoryById(id: string): Observable<PhysicalInventory> {
    return this.http.get<PhysicalInventory>(`${this.baseUrl}/physical-count/${id}`);
  }

  createPhysicalInventory(inventory: Partial<PhysicalInventory>): Observable<PhysicalInventory> {
    return this.http.post<PhysicalInventory>(`${this.baseUrl}/physical-count`, inventory);
  }

  createPhysicalInventoryByPresentations(request: PhysicalInventoryByPresentationsRequest): Observable<PhysicalInventory> {
    return this.http.post<PhysicalInventory>(`${this.baseUrl}/physical-count/presentations`, request);
  }

  // ============ AJUSTES DE INVENTARIO ============
  
  getAdjustments(filter?: InventoryAdjustmentFilter): Observable<InventoryAdjustment[]> {
    let params = new HttpParams();
    if (filter?.startDate) params = params.set('startDate', filter.startDate);
    if (filter?.endDate) params = params.set('endDate', filter.endDate);
    if (filter?.productId) params = params.set('productId', filter.productId);
    if (filter?.adjustmentType) params = params.set('adjustmentType', filter.adjustmentType);
    if (filter?.reason) params = params.set('reason', filter.reason);
    
    return this.http.get<InventoryAdjustment[]>(`${this.baseUrl}/adjustments`, { params });
  }

  getAdjustmentById(id: string): Observable<InventoryAdjustment> {
    return this.http.get<InventoryAdjustment>(`${this.baseUrl}/adjustments/${id}`);
  }

  createAdjustment(adjustment: Partial<InventoryAdjustment>): Observable<InventoryAdjustment> {
    return this.http.post<InventoryAdjustment>(`${this.baseUrl}/adjustments`, adjustment);
  }

  authorizeAdjustment(id: string): Observable<InventoryAdjustment> {
    return this.http.put<InventoryAdjustment>(`${this.baseUrl}/adjustments/${id}/authorize`, {});
  }

  // ============ DASHBOARD Y ALERTAS ============
  
  getDashboard(): Observable<InventoryDashboard> {
    return this.http.get<InventoryDashboard>(`${this.baseUrl}/dashboard`);
  }

  getStockAlerts(): Observable<StockAlert[]> {
    return this.http.get<StockAlert[]>(`${this.baseUrl}/stock-alerts`);
  }

  // ============ REPORTES ============
  
  getRotationReport(startDate?: string, endDate?: string): Observable<any> {
    let params = new HttpParams();
    if (startDate) params = params.set('startDate', startDate);
    if (endDate) params = params.set('endDate', endDate);
    
    return this.http.get(`${this.baseUrl}/reports/rotation`, { params });
  }

  getValuationReport(): Observable<any> {
    return this.http.get(`${this.baseUrl}/reports/valuation`);
  }

  getABCReport(): Observable<any> {
    return this.http.get(`${this.baseUrl}/reports/abc`);
  }
}
