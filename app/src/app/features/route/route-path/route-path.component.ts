import { Component, ElementRef, HostListener, computed, inject, input, model, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { formatDate, formatDollars, toDate } from '@app/shared/utils/format.utils';
import { FIT_TIER_LABELS, FitTier, FundPath } from '../../../../types/firestore';

type IStop = FundPath.Firestore.Routes.IStop;

export interface IRoutePathStation {
  stop: IStop;
  /** Proportional position (0..1) along the route's time scale — used only for chronological ordering, not layout. */
  position: number;
  kind: 'primary' | 'alongside';
}

type StationStatus = 'next' | 'open' | 'closed';

const TIER_COLOR_VAR: Record<FitTier, string> = {
  'likely': 'var(--fp-tier-likely)',
  'potential': 'var(--fp-tier-potential)',
  'adjacent': 'var(--fp-tier-adjacent)',
  'probably-not': 'var(--fp-tier-probably-not)'
};

/** Money-themed waypoint icons — a piggy bank for primary stops (the main funding targets), a coin for alongside stops. */
const KIND_ICON: Record<IRoutePathStation['kind'], string> = {
  primary: 'savings',
  alongside: 'paid'
};

/** Fit-tier icons — a checkmark for a likely fit, softer signals for the rest. */
const TIER_ICON: Record<FitTier, string> = {
  'likely': 'check_circle',
  'potential': 'help',
  'adjacent': 'info',
  'probably-not': 'cancel'
};

/** Vertical space between waypoints in the zigzag lane. */
const ROW_HEIGHT = 116;
const TOP_PADDING = 72;
const BOTTOM_PADDING = 64;

/** Deterministic left/right wander (0..100 scale) — a level-map rhythm, not a data encoding. */
function laneX(index: number): number {
  return 50 + 18 * Math.sin(index * 1.7);
}

interface IPoint {
  x: number;
  y: number;
}

/** Catmull-Rom-to-Bezier smoothing — a flowing curve through every point, rather than straight zigzag segments. */
function buildSmoothPathD(points: IPoint[]): string {
  if (points.length < 2) { return ''; }
  if (points.length === 2) { return `M${points[0].x},${points[0].y} L${points[1].x},${points[1].y}`; }

  let d = `M${points[0].x},${points[0].y}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }

  return d;
}

/**
 * The route rendered as a Duolingo-style vertical path: chunky waypoint
 * "pucks" zigzagging down the page in chronological order, colored by fit
 * tier and iconed by money (piggy bank for primary stops, coin for
 * alongside). Tapping a waypoint opens a floating preview card; the card's
 * own button opens the full stop-detail side panel via `opened`.
 *
 * A compact fallback list renders below for touch/keyboard/screen-reader
 * users who don't work well with a floating-card interaction alone.
 */
@Component({
  selector: 'app-route-path',
  standalone: true,
  imports: [MatIconModule],
  templateUrl: './route-path.component.html',
  styleUrl: './route-path.component.scss'
})
export class RoutePathComponent {
  private readonly _elementRef = inject(ElementRef<HTMLElement>);

  public readonly stations = input.required<IRoutePathStation[]>();
  /** Shared with the parent: which stop's preview card, if any, is open. */
  public readonly hoveredStopId = model<string | null>(null);
  public readonly opened = output<IStop>();

  protected readonly tierLabels = FIT_TIER_LABELS;

  /** Stations in chronological order — the vertical order the path is drawn in. */
  protected readonly orderedStations = computed<IRoutePathStation[]>(() =>
    [...this.stations()].sort((a, b) => a.position - b.position)
  );

  protected readonly containerHeight = computed<number>(() =>
    TOP_PADDING + this.orderedStations().length * ROW_HEIGHT + BOTTOM_PADDING
  );

  /** The connector's `d` string — a smooth curve threaded through every waypoint in order. */
  protected readonly connectorD = computed<string>(() => {
    const ordered = this.orderedStations();
    if (ordered.length < 2) { return ''; }

    const points = ordered.map((_, index) => ({ x: this.leftPct(index), y: this.topPx(index) }));
    return buildSmoothPathD(points);
  });

  /** The soonest station whose deadline hasn't passed (or the first station, if none/all have passed). */
  protected readonly nextStationId = computed<string | null>(() => {
    const ordered = this.orderedStations();
    const upcoming = ordered.find(station => {
      const days = this._daysUntilClose(station.stop);
      return days === null || days >= 0;
    });

    return (upcoming ?? ordered[0])?.stop.id ?? null;
  });

  protected leftPct(index: number): number {
    return laneX(index);
  }

  protected topPx(index: number): number {
    return TOP_PADDING + index * ROW_HEIGHT;
  }

  protected icon(station: IRoutePathStation): string {
    return KIND_ICON[station.kind];
  }

  protected tierColor(stop: IStop): string {
    return TIER_COLOR_VAR[stop.fitTier];
  }

  protected tierIcon(stop: IStop): string {
    return TIER_ICON[stop.fitTier];
  }

  protected status(stop: IStop): StationStatus {
    const days = this._daysUntilClose(stop);
    if (days !== null && days < 0) { return 'closed'; }
    return this.nextStationId() === stop.id ? 'next' : 'open';
  }

  protected amountLabel(stop: IStop): string {
    const { minAward, maxAward } = stop;

    if (minAward && maxAward) { return `${formatDollars(minAward)}–${formatDollars(maxAward)}`; }
    if (maxAward) { return `Up to ${formatDollars(maxAward)}`; }
    if (minAward) { return `From ${formatDollars(minAward)}`; }

    return '';
  }

  protected deadlineLabel(stop: IStop): string {
    const raw = stop.closeDate ?? stop.registrationDeadline;
    const date = toDate(raw);

    if (!date) { return ''; }

    const label = formatDate(raw);
    const days = this._daysUntilClose(stop);

    return days !== null && days >= 0 ? `Closes ${label} · ${days}d` : `Closed ${label}`;
  }

  protected isOpen(stop: IStop): boolean {
    return this.hoveredStopId() === stop.id;
  }

  /** Toggles the floating preview card for `stop` — a second tap on the same waypoint closes it. */
  protected toggle(stop: IStop): void {
    this.hoveredStopId.set(this.isOpen(stop) ? null : stop.id);
  }

  protected viewDetails(stop: IStop): void {
    this.hoveredStopId.set(null);
    this.opened.emit(stop);
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (!this._elementRef.nativeElement.contains(event.target as Node)) {
      this.hoveredStopId.set(null);
    }
  }

  private _daysUntilClose(stop: IStop): number | null {
    const date = toDate(stop.closeDate ?? stop.registrationDeadline);
    if (!date) { return null; }

    return Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  }
}
