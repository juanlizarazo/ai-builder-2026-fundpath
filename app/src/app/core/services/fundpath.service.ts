import { Injectable, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Auth, authState } from '@angular/fire/auth';
import { Functions, httpsCallable } from '@angular/fire/functions';
import {
  DocumentReference,
  Firestore,
  collection,
  collectionData,
  doc,
  docData,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where
} from '@angular/fire/firestore';
import { Observable, catchError, map, of, switchMap } from 'rxjs';
import { FundPath } from '../../../types/firestore';

export interface IStarterKitSummary {
  id: string;
  routeId: string;
  stopId: string;
  opportunityTitle: string;
  agency: string;
  hasSf424: boolean;
  sf424StoragePath?: string;
  createdAt: FundPath.Firestore.Applications.IStarterKit['createdAt'];
}

const COMPANY_NAME_SESSION_KEY = 'fundpath.companyName';

const BUILD_ROUTE_TIMEOUT_MS = 300000;

@Injectable({ providedIn: 'root' })
export class FundpathService {
  private readonly _functions = inject(Functions);
  private readonly _firestore = inject(Firestore);
  private readonly _auth = inject(Auth);

  public readonly currentRoute = signal<FundPath.Firestore.Routes.IRoute | null>(null);
  public readonly currentRouteId = signal<string | null>(null);
  public readonly currentProfileId = signal<string | null>(null);

  private readonly _myRoutes$: Observable<FundPath.Firestore.Routes.IRoute[]> = authState(this._auth).pipe(
    switchMap(user => {
      if (!user || user.isAnonymous) {
        return of<FundPath.Firestore.Routes.IRoute[]>([]);
      }

      const myRoutesQuery = query(
        collection(this._firestore, 'routes'),
        where('uid', '==', user.uid),
        orderBy('createdAt', 'desc')
      );

      return collectionData(myRoutesQuery, { idField: 'id' }) as Observable<FundPath.Firestore.Routes.IRoute[]>;
    }),
    catchError(() => of<FundPath.Firestore.Routes.IRoute[]>([]))
  );

  /** Every path (route) the signed-in founder has built, newest first — powers the "My paths" menu. */
  public readonly myRoutes = toSignal(this._myRoutes$, { initialValue: [] });

  private readonly _myStarterKits$: Observable<IStarterKitSummary[]> = authState(this._auth).pipe(
    switchMap(user => {
      if (!user || user.isAnonymous) {
        return of<IStarterKitSummary[]>([]);
      }

      const kitsQuery = query(
        collection(this._firestore, 'starterKits'),
        where('uid', '==', user.uid),
        orderBy('createdAt', 'desc')
      );

      return (collectionData(kitsQuery, { idField: 'id' }) as Observable<FundPath.Firestore.Applications.IStarterKit[]>).pipe(
        map(kits => kits.map(kit => ({
          id: kit.id!,
          routeId: kit.routeId,
          stopId: kit.stopId,
          opportunityTitle: kit.opportunityTitle,
          agency: kit.agency,
          hasSf424: !!kit.sf424?.storagePath,
          sf424StoragePath: kit.sf424?.storagePath,
          createdAt: kit.createdAt
        })))
      );
    }),
    catchError(() => of<IStarterKitSummary[]>([]))
  );

  public readonly myStarterKits = toSignal(this._myStarterKits$, { initialValue: [] });

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

  /**
   * Must be called AFTER `buildRoute` resolves — the callable itself writes
   * `profiles/{uid}` with `{merge: true}` mid-request, so persisting before
   * that resolves would be clobbered. Mirrored to `sessionStorage` so a
   * refresh before the write completes doesn't lose it.
   */
  public async saveCompanyName(profileId: string, companyName: string): Promise<void> {
    if (!companyName.trim()) { return; }

    try {
      sessionStorage.setItem(COMPANY_NAME_SESSION_KEY, companyName);
    } catch {
      // sessionStorage can throw in locked-down/private-browsing contexts — non-critical, continue to the real write.
    }

    const profileRef = doc(this._firestore, 'profiles', profileId);
    await setDoc(profileRef, { companyName }, { merge: true });
  }

  /** Marks a route as publicly readable (or revokes it) so its owner can hand out a share link. */
  public async setRoutePublic(routeId: string, isPublic: boolean): Promise<void> {
    const routeRef = doc(this._firestore, 'routes', routeId);
    await setDoc(routeRef, { isPublic, sharedAt: serverTimestamp() }, { merge: true });
  }
}
