import { Injectable } from '@angular/core';
import { Product } from '../../producto/producto';
import { CreatePreSaleRequest, PreSaleItemDto, PreventaDraft } from '../models/pre-sale';

export interface QueuedPreSale {
  tempId: string;
  request: CreatePreSaleRequest;
  queuedAt: string;
}

interface ProductCache {
  products: Product[];
  cachedAt: string;
}

@Injectable({ providedIn: 'root' })
export class OfflineQueueService {

  private readonly PRODUCT_CACHE_KEY = 'preventa_products_cache';
  private readonly QUEUE_KEY         = 'preventa_offline_queue';
  /** Lista de drafts activos (multi-preventa) */
  private readonly DRAFTS_KEY        = 'preventa_drafts';
  /** ID del draft activo */
  private readonly ACTIVE_DRAFT_KEY  = 'preventa_active_draft_id';
  /** Compatibilidad: draft único legacy */
  private readonly LEGACY_DRAFT_KEY  = 'preventa_draft';

  // ── Product cache ────────────────────────────────────────────────────────

  saveProductCache(products: Product[]): void {
    try {
      const data: ProductCache = { products, cachedAt: new Date().toISOString() };
      localStorage.setItem(this.PRODUCT_CACHE_KEY, JSON.stringify(data));
    } catch { /* quota exceeded */ }
  }

  loadProductCache(): ProductCache | null {
    try {
      const raw = localStorage.getItem(this.PRODUCT_CACHE_KEY);
      return raw ? (JSON.parse(raw) as ProductCache) : null;
    } catch { return null; }
  }

  // ── Multi-draft API ───────────────────────────────────────────────────────

  /** Devuelve todos los drafts activos ordenados por tabIndex */
  listDrafts(): PreventaDraft[] {
    try {
      const raw = localStorage.getItem(this.DRAFTS_KEY);
      const list: PreventaDraft[] = raw ? JSON.parse(raw) : [];
      return list.sort((a, b) => a.tabIndex - b.tabIndex);
    } catch { return []; }
  }

  private saveDraftList(list: PreventaDraft[]): void {
    try {
      localStorage.setItem(this.DRAFTS_KEY, JSON.stringify(list));
    } catch { /* quota exceeded */ }
  }

  /** Crea un draft nuevo, lo guarda y lo activa. Devuelve el draft creado. */
  createDraft(): PreventaDraft {
    const existing = this.listDrafts();
    const draft: PreventaDraft = {
      id: `draft-${Date.now()}`,
      clientName: '',
      items: [],
      totalAmount: 0,
      savedAt: new Date().toISOString(),
      tabIndex: existing.length,
    };
    this.saveDraftList([...existing, draft]);
    this.setActiveDraftId(draft.id);
    return draft;
  }

  /** Actualiza ítems, total y nombre de cliente de un draft específico */
  updateDraft(id: string, items: PreSaleItemDto[], totalAmount: number, clientName: string): void {
    const list = this.listDrafts();
    const idx = list.findIndex(d => d.id === id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], items, totalAmount, clientName, savedAt: new Date().toISOString() };
      this.saveDraftList(list);
    }
  }

  /** Elimina un draft por ID. Si era el activo, activa el siguiente disponible o crea uno nuevo. */
  removeDraft(id: string): PreventaDraft | null {
    const list = this.listDrafts().filter(d => d.id !== id);
    // re-numerar tabs
    list.forEach((d, i) => { d.tabIndex = i; });
    this.saveDraftList(list);

    const wasActive = this.getActiveDraftId() === id;
    if (wasActive) {
      if (list.length > 0) {
        this.setActiveDraftId(list[0].id);
        return list[0];
      } else {
        localStorage.removeItem(this.ACTIVE_DRAFT_KEY);
        return null;
      }
    }
    return this.getActiveDraft();
  }

  getDraftById(id: string): PreventaDraft | null {
    return this.listDrafts().find(d => d.id === id) ?? null;
  }

  getActiveDraftId(): string {
    return localStorage.getItem(this.ACTIVE_DRAFT_KEY) || '';
  }

  setActiveDraftId(id: string): void {
    localStorage.setItem(this.ACTIVE_DRAFT_KEY, id);
  }

  getActiveDraft(): PreventaDraft | null {
    const id = this.getActiveDraftId();
    if (!id) return null;
    return this.getDraftById(id);
  }

  /**
   * Punto de entrada al iniciar la app.
   * Si hay drafts multi, los devuelve.
   * Si hay solo un draft legacy (preventa_draft), lo migra.
   * Si no hay nada, crea un draft inicial.
   */
  initDrafts(): PreventaDraft {
    const existing = this.listDrafts();
    if (existing.length > 0) {
      // Ya hay multi-drafts; asegurar que haya un activo
      const activeId = this.getActiveDraftId();
      const hasActive = existing.some(d => d.id === activeId);
      if (!hasActive) this.setActiveDraftId(existing[0].id);
      return this.getActiveDraft() ?? existing[0];
    }

    // Migrar draft legacy si existe
    try {
      const legacyRaw = localStorage.getItem(this.LEGACY_DRAFT_KEY);
      if (legacyRaw) {
        const legacy = JSON.parse(legacyRaw) as { items: PreSaleItemDto[]; totalAmount: number; savedAt: string };
        const draft: PreventaDraft = {
          id: `draft-${Date.now()}`,
          clientName: '',
          items: legacy.items || [],
          totalAmount: legacy.totalAmount || 0,
          savedAt: legacy.savedAt || new Date().toISOString(),
          tabIndex: 0,
        };
        this.saveDraftList([draft]);
        this.setActiveDraftId(draft.id);
        localStorage.removeItem(this.LEGACY_DRAFT_KEY);
        return draft;
      }
    } catch { /* noop */ }

    // Crear draft vacío inicial
    return this.createDraft();
  }

  // ── Compat wrappers (para no romper otros consumidores legacy) ────────────

  /** @deprecated usa updateDraft() */
  saveDraft(items: PreSaleItemDto[], totalAmount: number): void {
    const id = this.getActiveDraftId();
    if (id) this.updateDraft(id, items, totalAmount, this.getActiveDraft()?.clientName ?? '');
  }

  /** @deprecated usa getActiveDraft() */
  loadDraft(): { items: PreSaleItemDto[]; totalAmount: number } | null {
    return this.getActiveDraft();
  }

  /** @deprecated usa removeDraft() */
  clearDraft(): void {
    const id = this.getActiveDraftId();
    if (id) {
      const list = this.listDrafts();
      const idx = list.findIndex(d => d.id === id);
      if (idx >= 0) {
        list[idx] = { ...list[idx], items: [], totalAmount: 0 };
        this.saveDraftList(list);
      }
    }
  }

  // ── Offline queue ─────────────────────────────────────────────────────────

  getQueue(): QueuedPreSale[] {
    try {
      const raw = localStorage.getItem(this.QUEUE_KEY);
      return raw ? (JSON.parse(raw) as QueuedPreSale[]) : [];
    } catch { return []; }
  }

  addToQueue(request: CreatePreSaleRequest): QueuedPreSale {
    const item: QueuedPreSale = {
      tempId: `LOCAL-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      request,
      queuedAt: new Date().toISOString(),
    };
    const queue = this.getQueue();
    queue.push(item);
    localStorage.setItem(this.QUEUE_KEY, JSON.stringify(queue));
    return item;
  }

  removeFromQueue(tempId: string): void {
    const queue = this.getQueue().filter(i => i.tempId !== tempId);
    localStorage.setItem(this.QUEUE_KEY, JSON.stringify(queue));
  }

  get queueLength(): number {
    return this.getQueue().length;
  }
}
