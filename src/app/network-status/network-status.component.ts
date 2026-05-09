import { Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-network-status',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngIf="isOffline"
         class="network-offline-bar d-flex align-items-center justify-content-center gap-2">
      <i class="bi bi-wifi-off"></i>
      <span>Sin conexión a internet — verifica tu red para seguir trabajando</span>
    </div>
    <div *ngIf="showReconnected"
         class="network-online-bar d-flex align-items-center justify-content-center gap-2">
      <i class="bi bi-wifi"></i>
      <span>Conexión restablecida</span>
    </div>
  `,
  styles: [`
    .network-offline-bar {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 10000;
      background: #dc3545;
      color: #fff;
      font-weight: 600;
      font-size: 0.88rem;
      padding: 0.45rem 1rem;
      text-align: center;
      animation: slideUp 0.25s ease;
    }
    .network-online-bar {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 10000;
      background: #198754;
      color: #fff;
      font-weight: 600;
      font-size: 0.88rem;
      padding: 0.45rem 1rem;
      text-align: center;
      animation: slideUp 0.25s ease;
    }
    @keyframes slideUp {
      from { transform: translateY(100%); opacity: 0; }
      to   { transform: translateY(0);    opacity: 1; }
    }
  `]
})
export class NetworkStatusComponent implements OnInit, OnDestroy {

  isOffline = !navigator.onLine;
  showReconnected = false;
  private reconnectedTimer: any;

  private onlineHandler = () => {
    this.zone.run(() => {
      this.isOffline = false;
      this.showReconnected = true;
      clearTimeout(this.reconnectedTimer);
      this.reconnectedTimer = setTimeout(() => {
        this.showReconnected = false;
      }, 3000);
    });
  };

  private offlineHandler = () => {
    this.zone.run(() => {
      this.isOffline = true;
      this.showReconnected = false;
      clearTimeout(this.reconnectedTimer);
    });
  };

  constructor(private zone: NgZone) {}

  ngOnInit() {
    window.addEventListener('online', this.onlineHandler);
    window.addEventListener('offline', this.offlineHandler);
  }

  ngOnDestroy() {
    window.removeEventListener('online', this.onlineHandler);
    window.removeEventListener('offline', this.offlineHandler);
    clearTimeout(this.reconnectedTimer);
  }
}
