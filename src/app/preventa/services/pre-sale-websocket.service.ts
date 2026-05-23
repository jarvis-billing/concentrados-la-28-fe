import { Injectable, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { urlConfig } from '../../../config/config';
import { PreSaleNotification } from '../models/pre-sale';

@Injectable({ providedIn: 'root' })
export class PreSaleWebSocketService implements OnDestroy {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private currentToken: string | null = null;
  private destroyed = false;

  private notificationsSubject = new Subject<PreSaleNotification>();
  readonly notifications$ = this.notificationsSubject.asObservable();

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
          if (msg?.type === 'PREVENTA_READY') {
            this.notificationsSubject.next(msg.payload as PreSaleNotification);
          }
        } catch {
          // malformed message — ignore
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
      // WebSocket not available (SSR or blocked)
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
