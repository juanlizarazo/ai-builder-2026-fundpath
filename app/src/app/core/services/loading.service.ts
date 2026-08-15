import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class LoadingService {
  private readonly _isLoading = signal(false);
  public readonly isLoading = this._isLoading.asReadonly();

  public show(): void {
    this._isLoading.set(true);
  }

  public hide(): void {
    this._isLoading.set(false);
  }
}
