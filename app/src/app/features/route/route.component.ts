import { Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { Observable, catchError, distinctUntilChanged, filter, map, of, switchMap } from 'rxjs';
import { FundpathService } from '@app/core/services/fundpath.service';
import { AuthService } from '@app/core/services/auth.service';
import { NotificationsService } from '@app/core/services/notifications.service';
import { LoadingService } from '@app/core/services/loading.service';
import { AlertBannerComponent } from '@app/shared/components/alert-banner/alert-banner.component';
import { SidePanelComponent } from '@app/shared/components/side-panel/side-panel.component';
import { FundingStackComponent } from '@app/shared/components/funding-stack/funding-stack.component';
import { formatDollars, formatRelativeTime, toDate } from '@app/shared/utils/format.utils';
import { datePosition, monthTicks } from '@app/shared/utils/scale.utils';
import { toSentences } from '@app/shared/utils/text.utils';
import { StopComponent } from './stop/stop.component';
import { FundPath } from '../../../types/firestore';

type IStop = FundPath.Firestore.Routes.IStop;

interface IDiagramTick {
  label: string;
  position: number;
}

interface IDiagramStation {
  stop: IStop;
  position: number;
  kind: 'primary' | 'alongside';
}

interface IAwardRange {
  min: number;
  max: number;
}

/** Months in the diagram's fixed time-scale domain — `[today, today + DIAGRAM_HORIZON_MONTHS]`. */
const DIAGRAM_HORIZON_MONTHS = 24;

/** A deadline inside this many days renders in `--fp-signal` on the summary rail. */
const URGENT_DEADLINE_DAYS = 45;

@Component({
  selector: 'app-route',
  standalone: true,
  imports: [
    RouterLink,
    MatProgressSpinnerModule,
    MatIconModule,
    MatButtonModule,
    AlertBannerComponent,
    SidePanelComponent,
    StopComponent,
    FundingStackComponent
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
  protected readonly formatDollars = formatDollars;

  /** Fixed at construction so the diagram's time scale doesn't jitter re-render to re-render. */
  private readonly _today = new Date();

  /** Seam for Task 7 (side panel): set by `openStopDetail`, not consumed by any UI yet. */
  protected readonly selectedStopForDetail = signal<IStop | null>(null);

  protected readonly isRuledOutOpen = signal(false);

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

  /**
   * The founder's profile (for `askMin`/`askMax`), re-fetched whenever the
   * route's `profileId` changes. Nothing else on this page needed the
   * profile before now — `FundpathService` only carries `currentProfileId`,
   * which is transient and not populated on a fresh `/route/:routeId` load,
   * so this reads live from Firestore the same way `_liveRoute` does.
   */
  private readonly _liveProfile = toSignal(
    toObservable(this.route).pipe(
      map(route => route?.profileId ?? null),
      distinctUntilChanged(),
      switchMap(profileId => (profileId ? this._fundpathService.watchProfile(profileId) : of(null)))
    ),
    { initialValue: null }
  );

  /** The founder's funding need — the funding-stack's scale domain. `null` until the profile loads (or if unset). */
  protected readonly askMax = computed<number | null>(() => this._liveProfile()?.askMax ?? null);

  /** Primary + alongside stops passed to the funding-stack bar (same set the survey-line diagram renders). */
  protected readonly fundingStackStops = computed<IStop[]>(() => this.route()?.stops ?? []);

  /** Shared with `FundingStackComponent`: which stop, if any, is hovered/focused — read by the spine below to light up the matching station. */
  protected readonly hoveredStopId = signal<string | null>(null);

  protected readonly isDeepRunning = computed<boolean>(() =>
    this.route()?.deepPassStatus === 'running'
  );

  protected readonly deepPassFoundNew = computed<boolean>(() =>
    this.route()?.deepPassStatus === 'complete' && (this.route()?.deepPassFoundNew ?? false)
  );

  protected readonly utahResources = computed<FundPath.Firestore.Routes.IUtahResourceMatch[]>(() =>
    this.route()?.utahResources ?? []
  );

  // --- Header summary rail --------------------------------------------------

  protected readonly stopCount = computed<number>(() => (this.route()?.stops ?? []).length);

  protected readonly awardRange = computed<IAwardRange | null>(() => {
    const stops = this.route()?.stops ?? [];
    const mins = stops.map(stop => stop.minAward).filter((value): value is number => typeof value === 'number');
    const maxes = stops.map(stop => stop.maxAward).filter((value): value is number => typeof value === 'number');

    if (mins.length === 0 && maxes.length === 0) { return null; }

    return {
      min: Math.min(...(mins.length > 0 ? mins : maxes)),
      max: Math.max(...(maxes.length > 0 ? maxes : mins))
    };
  });

  protected readonly nextDeadlineDays = computed<number | null>(() => {
    const stops = this.route()?.stops ?? [];
    const now = Date.now();

    const daysUntil = stops
      .map(stop => toDate(stop.closeDate ?? stop.registrationDeadline))
      .filter((date): date is Date => !!date)
      .map(date => Math.ceil((date.getTime() - now) / (1000 * 60 * 60 * 24)))
      .filter(days => days >= 0);

    return daysUntil.length > 0 ? Math.min(...daysUntil) : null;
  });

  protected readonly isDeadlineUrgent = computed<boolean>(() => {
    const days = this.nextDeadlineDays();
    return days !== null && days < URGENT_DEADLINE_DAYS;
  });

  // --- Survey-line diagram ---------------------------------------------------

  protected readonly diagramDomain = computed<[Date, Date]>(() => {
    const end = new Date(this._today);
    end.setMonth(end.getMonth() + DIAGRAM_HORIZON_MONTHS);
    return [this._today, end];
  });

  protected readonly diagramTicks = computed<IDiagramTick[]>(() => {
    const [from, to] = this.diagramDomain();

    return monthTicks(from, to).map(date => ({
      label: date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
      position: datePosition(date, from, to)
    }));
  });

  /** Elapsed fraction of the domain up to "now" — the spine's traversed portion. */
  protected readonly traversedFraction = computed<number>(() => {
    const [from, to] = this.diagramDomain();
    return datePosition(new Date(), from, to);
  });

  /**
   * Primary + alongside stops in diagram order, each carrying its proportional
   * position (0..1) along the fixed [today, today + 24 months] time scale.
   */
  protected readonly diagramStations = computed<IDiagramStation[]>(() => {
    const stations: IDiagramStation[] = [];

    for (const stop of this.primaryStops()) {
      stations.push({ stop, position: this.stopPosition(stop), kind: 'primary' });

      for (const alongside of this.alongsideForPrimary(stop)) {
        stations.push({ stop: alongside, position: this.stopPosition(alongside), kind: 'alongside' });
      }
    }

    for (const stop of this.alongsideStops()) {
      if (stop.sequenceMonth === undefined) {
        stations.push({ stop, position: this.stopPosition(stop), kind: 'alongside' });
      }
    }

    return stations;
  });

  /**
   * Proportional position (0..1) of `stop` along the diagram's time scale,
   * from its `sequenceMonth`. Stops without a `sequenceMonth` (today's
   * fallback for some alongside stops) anchor near the nearest primary
   * stop — here, the first primary stop's month, or month 0 if there is
   * none — rather than being placed arbitrarily.
   */
  protected stopPosition(stop: IStop): number {
    const [from, to] = this.diagramDomain();
    return datePosition(this._stopDate(stop), from, to);
  }

  protected alongsideForPrimary(primaryStop: FundPath.Firestore.Routes.IStop): FundPath.Firestore.Routes.IStop[] {
    const sequenceMonth = primaryStop.sequenceMonth;

    if (sequenceMonth === undefined) { return []; }

    return this.alongsideStops().filter(stop => stop.sequenceMonth === sequenceMonth);
  }

  private _stopDate(stop: IStop): Date {
    const date = new Date(this._today);
    date.setMonth(date.getMonth() + this._stopMonth(stop));
    return date;
  }

  private _stopMonth(stop: IStop): number {
    if (typeof stop.sequenceMonth === 'number') { return stop.sequenceMonth; }

    // Fallback for stops without a sequenceMonth: anchor near the nearest
    // primary stop (the first one, in the absence of a better signal).
    return this.primaryStops()[0]?.sequenceMonth ?? 0;
  }

  /**
   * Seam for Task 7: this will wire the click into a side-panel instance.
   * For now it only records the selection; no UI consumes it yet.
   */
  protected openStopDetail(stop: IStop): void {
    this.selectedStopForDetail.set(stop);
  }

  protected toggleRuledOut(): void {
    this.isRuledOutOpen.update(open => !open);
  }

  protected ruledOutReason(stop: IStop): string {
    const severityRank: Record<FundPath.Firestore.Routes.IEligibilityFlag['severity'], number> = {
      block: 0,
      warn: 1,
      info: 2
    };

    const mostSevere = [...(stop.eligibilityFlags ?? [])].sort(
      (a, b) => severityRank[a.severity] - severityRank[b.severity]
    )[0];

    if (mostSevere) { return mostSevere.message; }

    const [firstSentence] = toSentences(stop.whyIneligible);
    return firstSentence || 'Not a fit for your profile right now.';
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
