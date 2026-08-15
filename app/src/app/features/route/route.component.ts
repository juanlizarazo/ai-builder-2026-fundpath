import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { FundpathService } from '@app/core/services/fundpath.service';
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

  protected readonly routeId = this._activatedRoute.snapshot.paramMap.get('routeId');

  protected readonly route = computed(() => this._fundpathService.currentRoute());

  protected readonly primaryStops = computed<FundPath.Firestore.Routes.IStop[]>(() =>
    this.route()?.stops.filter(s => s.placement === 'primary') ?? []
  );

  protected readonly alongsideStops = computed<FundPath.Firestore.Routes.IStop[]>(() =>
    this.route()?.stops.filter(s => s.placement === 'alongside') ?? []
  );

  protected readonly offRouteStops = computed<FundPath.Firestore.Routes.IStop[]>(() =>
    this.route()?.offRoute ?? []
  );

  protected readonly nonGrantStops = computed<FundPath.Firestore.Routes.IStop[]>(() =>
    this.route()?.nonGrantAlternatives ?? []
  );

  protected readonly isAbstention = computed<boolean>(() => {
    const r = this.route();
    return !!r && r.stops.length === 0 && (r.nonGrantAlternatives?.length ?? 0) > 0;
  });

  protected readonly isDeepRunning = computed<boolean>(() =>
    this.route()?.deepPassStatus === 'running'
  );

  protected readonly deepPassFoundNew = computed<boolean>(() =>
    this.route()?.deepPassStatus === 'complete' && (this.route()?.deepPassFoundNew ?? false)
  );

  protected alongsideForPrimary(primaryStop: FundPath.Firestore.Routes.IStop): FundPath.Firestore.Routes.IStop[] {
    const seq = primaryStop.sequenceMonth;

    if (seq === undefined) { return []; }

    return this.alongsideStops().filter(s => s.sequenceMonth === seq);
  }
}
