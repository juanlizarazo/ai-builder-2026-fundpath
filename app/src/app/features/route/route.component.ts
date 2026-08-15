import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { Observable, catchError, filter, of, switchMap } from 'rxjs';
import { FundpathService } from '@app/core/services/fundpath.service';
import { AuthService } from '@app/core/services/auth.service';
import { NotificationsService } from '@app/core/services/notifications.service';
import { LoadingService } from '@app/core/services/loading.service';
import { AlertBannerComponent } from '@app/shared/components/alert-banner/alert-banner.component';
import { SidePanelComponent } from '@app/shared/components/side-panel/side-panel.component';
import { formatRelativeTime } from '@app/shared/utils/format.utils';
import { StopComponent } from './stop/stop.component';
import { FundPath } from '../../../types/firestore';

@Component({
  selector: 'app-route',
  standalone: true,
  imports: [
    RouterLink,
    MatProgressSpinnerModule,
    MatExpansionModule,
    MatIconModule,
    MatButtonModule,
    AlertBannerComponent,
    SidePanelComponent,
    StopComponent
  ],
  templateUrl: './route.component.html',
  styleUrl: './route.component.scss'
})
export class RouteComponent {
  private readonly _activatedRoute = inject(ActivatedRoute);
  private readonly _fundpathService = inject(FundpathService);
  private readonly _authService = inject(AuthService);
  private readonly _notificationsService = inject(NotificationsService);
  private readonly _loadingService = inject(LoadingService);

  protected readonly notifications = this._notificationsService.notifications;
  protected readonly unreadCount = this._notificationsService.unreadCount;
  protected readonly isInboxOpen = signal(false);
  protected readonly checkForNewMessage = signal('');
  protected readonly checkForNewError = signal('');
  protected readonly formatRelativeTime = formatRelativeTime;

  protected readonly routeId = this._activatedRoute.snapshot.paramMap.get('routeId');

  private readonly _liveRoute = toSignal(this._buildLiveRoute(), { initialValue: undefined });

  protected readonly route = computed<FundPath.Firestore.Routes.IRoute | null>(() => {
    const live = this._liveRoute();

    if (live === undefined) {
      return this._fundpathService.currentRoute();
    }

    return live ?? this._fundpathService.currentRoute();
  });

  protected readonly isLoading = computed<boolean>(() =>
    !!this.routeId && this._liveRoute() === undefined && !this._fundpathService.currentRoute()
  );

  protected readonly primaryStops = computed<FundPath.Firestore.Routes.IStop[]>(() =>
    (this.route()?.stops ?? []).filter(stop => stop.placement === 'primary')
  );

  protected readonly alongsideStops = computed<FundPath.Firestore.Routes.IStop[]>(() =>
    (this.route()?.stops ?? []).filter(stop => stop.placement === 'alongside')
  );

  protected readonly offRouteStops = computed<FundPath.Firestore.Routes.IStop[]>(() =>
    this.route()?.offRoute ?? []
  );

  protected readonly nonGrantStops = computed<FundPath.Firestore.Routes.IStop[]>(() =>
    this.route()?.nonGrantAlternatives ?? []
  );

  protected readonly isAbstention = computed<boolean>(() => {
    const currentRoute = this.route();

    return !!currentRoute && (currentRoute.stops?.length ?? 0) === 0 && (currentRoute.nonGrantAlternatives?.length ?? 0) > 0;
  });

  protected readonly isDeepRunning = computed<boolean>(() =>
    this.route()?.deepPassStatus === 'running'
  );

  protected readonly deepPassFoundNew = computed<boolean>(() =>
    this.route()?.deepPassStatus === 'complete' && (this.route()?.deepPassFoundNew ?? false)
  );

  protected alongsideForPrimary(primaryStop: FundPath.Firestore.Routes.IStop): FundPath.Firestore.Routes.IStop[] {
    const sequenceMonth = primaryStop.sequenceMonth;

    if (sequenceMonth === undefined) { return []; }

    return this.alongsideStops().filter(stop => stop.sequenceMonth === sequenceMonth);
  }

  private _buildLiveRoute(): Observable<FundPath.Firestore.Routes.IRoute | null> {
    const routeId = this.routeId;

    if (!routeId) { return of(null); }

    return this._authService.user$.pipe(
      filter((user) => !!user),
      switchMap(() => this._fundpathService.watchRoute(routeId)),
      catchError(() => of(null))
    );
  }

  protected openInbox(): void {
    this.isInboxOpen.set(true);
  }

  protected closeInbox(): void {
    this.isInboxOpen.set(false);
  }

  protected async onNotificationClick(notification: FundPath.Firestore.Notifications.INotification): Promise<void> {
    if (!notification.readAt && notification.id) {
      await this._notificationsService.markRead(notification.id);
    }

    const stopId = notification.stopIds[0];

    if (stopId) {
      this.closeInbox();
      requestAnimationFrame(() => {
        document.getElementById(`stop-${stopId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  }

  protected deliveryLabel(notification: FundPath.Firestore.Notifications.INotification): string {
    switch (notification.deliveryStatus) {
      case 'sent':
        return notification.channel === 'email' ? 'Emailed to you' : `Sent via ${notification.channel}`;
      case 'failed':
        return 'Delivery failed — in-app only';
      default:
        return 'In-app only';
    }
  }

  protected async checkForNewPrograms(): Promise<void> {
    const routeId = this.routeId;

    if (!routeId) { return; }

    this.checkForNewError.set('');
    this.checkForNewMessage.set('');
    this._loadingService.show();

    try {
      const result = await this._notificationsService.checkForNew(routeId);
      this.checkForNewMessage.set(result.message);
    } catch {
      this.checkForNewError.set('We could not check for new programs just now. Please try again.');
    } finally {
      this._loadingService.hide();
    }
  }

  protected clearCheckForNewError(): void {
    this.checkForNewError.set('');
  }
}
