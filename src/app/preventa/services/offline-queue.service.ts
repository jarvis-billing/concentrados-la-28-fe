import { Injectable } from '@angular/core';
import { Product } from '../../producto/producto';
import { CreatePreSaleRequest, PreSaleItemDto } from '../models/pre-sale';

export interface QueuedPreSale {
  tempId: string;
  request: CreatePreSaleRequest;
  queuedAt: string;
}

interface ProductCache {
  products: Product[];
  cachedAt: string;
}

interface PreventaDraft {
  items: PreSaleItemDto[];
  totalAmount: number;
  savedAt: string;
}

@Injectable({ providedIn: 'root' })
export class OfflineQueueService {

  private readonly PRODUCT_CACHE_KEY = 'preventa_products_cache';
  private readonly QUEUE_KEY = 'preventa_offline_queue';
  private readonly DRAFT_KEY = 'preventa_draft';

  // ── Product cache ────────────────────────────────────────────────────────

  saveProductCache(products: Product[]): void {
    try {
      const data: ProductCache = { products, cachedAt: new Date().toISOString() };
      localStorage.setItem(this.PRODUCT_CACHE_KEY, JSON.stringify(data));
    } catch {
      // Storage quota exceeded or unavailable — ignore silently
    }
  }

  loadProductCache(): ProductCache | null {
    try {
      const raw = localStorage.getItem(this.PRODUCT_CACHE_KEY);
      return raw ? (JSON.parse(raw) as ProductCache) : null;
    } catch {
      return null;
    }
  }

  // ── Draft (in-progress preventa) ──────────────────────────────────────────

  saveDraft(items: PreSaleItemDto[], totalAmount: number): void {
    if (items.length === 0) {
      this.clearDraft();
      return;
    }
    try {
      const data: PreventaDraft = { items, totalAmount, savedAt: new Date().toISOString() };
      localStorage.setItem(this.DRAFT_KEY, JSON.stringify(data));
    } catch { /* storage unavailable */ }
  }

  loadDraft(): PreventaDraft | null {
    try {
      const raw = localStorage.getItem(this.DRAFT_KEY);
      return raw ? (JSON.parse(raw) as PreventaDraft) : null;
    } catch {
      return null;
    }
  }

  clearDraft(): void {
    localStorage.removeItem(this.DRAFT_KEY);
  }

  // ── Offline queue ─────────────────────────────────────────────────────────

  getQueue(): QueuedPreSale[] {
    try {
      const raw = localStorage.getItem(this.QUEUE_KEY);
      return raw ? (JSON.parse(raw) as QueuedPreSale[]) : [];
    } catch {
      return [];
    }
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
