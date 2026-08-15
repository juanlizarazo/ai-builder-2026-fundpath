import { Injectable, inject, signal } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { FundPath } from '../../../types/firestore';

@Injectable({ providedIn: 'root' })
export class FundpathService {
  private readonly _functions = inject(Functions);

  public readonly currentRoute = signal<FundPath.Firestore.Routes.IRoute | null>(null);
  public readonly currentRouteId = signal<string | null>(null);
  public readonly currentProfileId = signal<string | null>(null);

  public async buildRoute(description: string): Promise<{ profileId: string; routeId: string; route: FundPath.Firestore.Routes.IRoute }> {
    const fn = httpsCallable<{ description: string }, { profileId: string; routeId: string; route: FundPath.Firestore.Routes.IRoute }>(
      this._functions,
      'buildRoute'
    );
    const result = await fn({ description });

    this.currentRoute.set(result.data.route);
    this.currentRouteId.set(result.data.routeId);
    this.currentProfileId.set(result.data.profileId);

    return result.data;
  }
}
