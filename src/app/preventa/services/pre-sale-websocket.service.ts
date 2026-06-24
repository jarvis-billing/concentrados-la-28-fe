import { Injectable, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { urlConfig } from '../../../config/config';
import { PreSaleNotification } from '../models/pre-sale';

export type WsPreventaType = 'PREVENTA_READY' | 'PREVENTA_BILLED' | 'PREVENTA_CANCELLED';

export interface WsPreventaEvent {
  type: WsPreventaType;
  payload: PreSaleNotification;
}

@Injectable({ providedIn: 'root' })
export class PreSaleWebSocketService implements OnDestroy {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private currentToken: string | null = null;
  private destroyed = false;

  private eventsSubject = new Subject<WsPreventaEvent>();

  /** Todos los eventos tipados (READY, BILLED, CANCELLED) */
  readonly events$ = this.eventsSubject.asObservable();

  /** Compatibilidad: solo emite las notificaciones PREVENTA_READY */
  readonly notifications$ = this.events$.pipe(
    filter(e => e.type === 'PREVENTA_READY'),
    map(e => e.payload)
  );

  connect(token: string): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.currentToken = token;
    this.destroyed = false;
    this.openSocket();
  }

  private openSocket(): void {
    if (!this.currentToken) return;
    try {
      const wsUrl = `${urlConfig.getWebSocketUrl()}?token=${encodeURIComponent(this.currentToken)}`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[PreSaleWS] Connected');
      };

      this.ws.onmessage = (ev: MessageEvent) => {
        try {
          const msg = JSON.parse(ev.data as string);
          const type = msg?.type as WsPreventaType;
          if (type === 'PREVENTA_READY' || type === 'PREVENTA_BILLED' || type === 'PREVENTA_CANCELLED') {
            this.eventsSubject.next({ type, payload: msg.payload as PreSaleNotification });
          }
        } catch {
          // mensaje malformado — ignorar
        }
      };

      this.ws.onerror = () => {
        console.warn('[PreSaleWS] Connection error');
      };

      this.ws.onclose = () => {
        console.log('[PreSaleWS] Disconnected — scheduling reconnect in 5s');
        if (!this.destroyed) {
          this.reconnectTimer = setTimeout(() => this.openSocket(), 5000);
        }
      };
    } catch {
      // WebSocket no disponible (SSR o bloqueado)
    }
  }

  disconnect(): void {
    this.destroyed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
