import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { Observable, catchError, filter, of, switchMap } from 'rxjs';
import { FundpathService } from '@app/core/services/fundpath.service';
import { AuthService } from '@app/core/services/auth.service';
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
    StopComponent
  ],
  templateUrl: './route.component.html',
  styleUrl: './route.component.scss'
})
export class RouteComponent {
  private readonly _activatedRoute = inject(ActivatedRoute);
  private readonly _fundpathService = inject(FundpathService);
  private readonly _authService = inject(AuthService);

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
}
