import { Injectable, inject, signal } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { DocumentReference, Firestore, doc, docData } from '@angular/fire/firestore';
import { Observable, catchError, map, of } from 'rxjs';
import { FundPath } from '../../../types/firestore';

const BUILD_ROUTE_TIMEOUT_MS = 300000;

@Injectable({ providedIn: 'root' })
export class FundpathService {
  private readonly _functions = inject(Functions);
  private readonly _firestore = inject(Firestore);

  public readonly currentRoute = signal<FundPath.Firestore.Routes.IRoute | null>(null);
  public readonly currentRouteId = signal<string | null>(null);
  public readonly currentProfileId = signal<string | null>(null);

  public async buildRoute(
    description: string,
    notify?: { notifyEmail?: string; notifyPhone?: string; smsOptIn?: boolean }
  ): Promise<{ profileId: string; routeId: string; route: FundPath.Firestore.Routes.IRoute }> {
    type BuildRouteRequest = { description: string; notifyEmail?: string; notifyPhone?: string; smsOptIn?: boolean };
    type BuildRouteResponse = { profileId: string; routeId: string; route: FundPath.Firestore.Routes.IRoute };

    const fn = httpsCallable<BuildRouteRequest, BuildRouteResponse>(
      this._functions,
      'buildRoute',
      { timeout: BUILD_ROUTE_TIMEOUT_MS }
    );
    const result = await fn({ description, ...notify });

    this.currentRoute.set(result.data.route);
    this.currentRouteId.set(result.data.routeId);
    this.currentProfileId.set(result.data.profileId);

    return result.data;
  }

  public watchRoute(routeId: string): Observable<FundPath.Firestore.Routes.IRoute | null> {
    const routeRef = doc(this._firestore, 'routes', routeId) as DocumentReference<FundPath.Firestore.Routes.IRoute>;

    return docData(routeRef, { idField: 'id' }).pipe(
      map((route) => route ?? null),
      catchError(() => of(null))
    );
  }

  /** Profile docs are keyed by `profileId` (the founder's uid) in the `profiles` collection. */
  public watchProfile(profileId: string): Observable<FundPath.Firestore.Profiles.IStartupProfile | null> {
    const profileRef = doc(this._firestore, 'profiles', profileId) as DocumentReference<FundPath.Firestore.Profiles.IStartupProfile>;

    return docData(profileRef, { idField: 'id' }).pipe(
      map((profile) => profile ?? null),
      catchError(() => of(null))
    );
  }
}
