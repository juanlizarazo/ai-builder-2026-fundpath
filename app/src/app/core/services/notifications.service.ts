import { Injectable, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Auth, authState } from '@angular/fire/auth';
import { Firestore, collection, collectionData, orderBy, query, where } from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Observable, of, switchMap } from 'rxjs';
import { FundPath } from '../../../types/firestore';

type INotification = FundPath.Firestore.Notifications.INotification;

export interface ICheckForNewResult {
  foundNew: boolean;
  addedCount: number;
  message: string;
}

export interface ISimulateNotificationResult {
  sentTo: string;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly _firestore = inject(Firestore);
  private readonly _auth = inject(Auth);
  private readonly _functions = inject(Functions);

  private readonly _notifications$: Observable<INotification[]> = authState(this._auth).pipe(
    switchMap(user => {
      if (!user) {
        return of<INotification[]>([]);
      }

      const notificationsQuery = query(
        collection(this._firestore, 'notifications'),
        where('uid', '==', user.uid),
        orderBy('createdAt', 'desc')
      );

      return collectionData(notificationsQuery, { idField: 'id' }) as Observable<INotification[]>;
    })
  );

  public readonly notifications = toSignal(this._notifications$, { initialValue: [] });

  public readonly unreadCount = computed(() => this.notifications().filter(notification => !notification.readAt).length);

  public async markRead(notificationId: string): Promise<void> {
    const fn = httpsCallable<{ notificationId: string }, { success: boolean }>(this._functions, 'markNotificationRead');
    await fn({ notificationId });
  }

  public async checkForNew(routeId: string): Promise<ICheckForNewResult> {
    const fn = httpsCallable<{ routeId: string }, ICheckForNewResult>(this._functions, 'checkForNew');
    const result = await fn({ routeId });

    return result.data;
  }

  public async simulateNotification(): Promise<ISimulateNotificationResult> {
    const fn = httpsCallable<void, ISimulateNotificationResult>(this._functions, 'simulateNotification');
    const result = await fn();

    return result.data;
  }
}
