import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class LoadingService {
  private pendingRequests = 0;
  private readonly _isLoading$ = new BehaviorSubject<boolean>(false);

  isLoading$ = this._isLoading$.asObservable();

  start(): void {
    this.pendingRequests++;
    if (this.pendingRequests === 1) {
      this._isLoading$.next(true);
    }
  }

  stop(): void {
    if (this.pendingRequests > 0) {
      this.pendingRequests--;
      if (this.pendingRequests === 0) {
        this._isLoading$.next(false);
      }
    }
  }

  reset(): void {
    this.pendingRequests = 0;
    this._isLoading$.next(false);
  }
}
