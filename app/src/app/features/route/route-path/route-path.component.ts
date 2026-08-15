import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy, computed, inject, input, model, output, signal, viewChild } from '@angular/core';
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

/**
 * Minimum horizontal space between waypoints — time runs left to right, like
 * a trail-app elevation profile. When the chart fits the viewport without
 * this much room per stop, columns stretch to fill it edge to edge instead
 * (so a short route's peak is never hidden behind a scrollbar); routes with
 * enough stops to need more room than that fall back to this floor and
 * scroll horizontally.
 */
const MIN_COL_WIDTH = 176;
const LEFT_PADDING = 112;
const RIGHT_PADDING = 100;
/** How far the trailhead/summit markers sit from the nearest waypoint. */
const END_MARKER_GAP = 52;

/** Vertical chart band the elevation profile is drawn in — ground level at the bottom, tallest peak at the top. */
const CHART_TOP = 96;
const CHART_BOTTOM = 248;
const BOTTOM_PADDING = 64;

/** How much bigger a fully-loaded stop's waypoint renders, as a scale multiplier. */
const SCALE_MAX = 0.32;

/**
 * A fixed dollar scale every route is measured against (not just this route's
 * own min/max) — so a $2M stop always reads as a tall peak and a $75K stop
 * always reads as a foothill, chart to chart. Log-scaled so mid-size awards
 * still separate visually instead of bunching near the bottom.
 */
const ELEVATION_DOMAIN_MIN = 25_000;
const ELEVATION_DOMAIN_MAX = 3_000_000;
/** A plausible mid-size award, used only when a stop lists no amount at all. */
const FALLBACK_AMOUNT = 150_000;

/** Reference elevation bands drawn behind the trail, each labeled with its dollar value. */
const ELEVATION_TICKS = [50_000, 250_000, 1_000_000, 2_500_000];

function logT(amount: number): number {
  const clamped = Math.min(Math.max(amount, ELEVATION_DOMAIN_MIN), ELEVATION_DOMAIN_MAX);
  return (Math.log(clamped) - Math.log(ELEVATION_DOMAIN_MIN)) / (Math.log(ELEVATION_DOMAIN_MAX) - Math.log(ELEVATION_DOMAIN_MIN));
}

interface IPoint {
  x: number;
  y: number;
}

export interface IElevationTick {
  label: string;
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
 * The route rendered as a left-to-right elevation profile, the way a hiking
 * app charts a trail: time runs along the x-axis in chronological order,
 * and each stop's height on the y-axis is its award size — the biggest
 * checks are the tallest peaks. Waypoints are colored by fit tier and
 * iconed by money (piggy bank for primary stops, coin for alongside).
 * Tapping a waypoint opens a floating preview card right above it; the
 * card's own button opens the full stop-detail side panel via `opened`.
 * The card is positioned via `position: fixed` from the tapped button's own
 * bounding rect (rather than being anchored with CSS relative to the
 * waypoint) so it floats above the chart's horizontal-scroll clipping
 * instead of getting cut off by it, and closes on scroll/resize so it never
 * drifts out of sync with the waypoint it belongs to.
 *
 * A compact fallback list renders below for touch/keyboard/screen-reader
 * users who don't work well with the chart interaction alone.
 */
@Component({
  selector: 'app-route-path',
  standalone: true,
  imports: [MatIconModule],
  templateUrl: './route-path.component.html',
  styleUrl: './route-path.component.scss'
})
export class RoutePathComponent implements AfterViewInit, OnDestroy {
  private readonly _elementRef = inject(ElementRef<HTMLElement>);
  private readonly _scrollEl = viewChild<ElementRef<HTMLElement>>('scrollEl');
  private readonly _hostWidth = signal(0);
  private _resizeObserver: ResizeObserver | null = null;

  /**
   * The floating preview card's anchor, in coordinates relative to this
   * component's own host element (not the viewport) — an ancestor up the
   * tree runs a one-time entrance animation with `transform`, and a
   * `transform` on any ancestor turns `position: fixed` descendants into
   * `position: absolute`-relative-to-that-ancestor under the CSS spec. Since
   * we can't rely on true viewport-fixed positioning, this component's own
   * root is the containing block instead: it's untransformed, and it isn't
   * clipped by the chart's horizontal-scroll container because the preview
   * card renders as that scroll container's sibling, not its descendant.
   */
  private readonly _anchor = signal<{ left: number; top: number } | null>(null);

  public readonly stations = input.required<IRoutePathStation[]>();
  /** Shared with the parent: which stop, if any, is selected and showing in the detail rail. */
  public readonly hoveredStopId = model<string | null>(null);
  public readonly opened = output<IStop>();

  protected readonly tierLabels = FIT_TIER_LABELS;

  /** Stations in chronological order — the left-to-right order the trail is drawn in. */
  protected readonly orderedStations = computed<IRoutePathStation[]>(() =>
    [...this.stations()].sort((a, b) => a.position - b.position)
  );

  /** The narrowest the chart can be while still giving every stop its minimum column width. */
  private readonly _naturalWidth = computed<number>(() =>
    LEFT_PADDING + this.orderedStations().length * MIN_COL_WIDTH + RIGHT_PADDING
  );

  /** Whichever is bigger: the space actually available, or the room the stops need at their minimum width. */
  protected readonly containerWidth = computed<number>(() =>
    Math.max(this._hostWidth(), this._naturalWidth())
  );

  /** Stretches each column to fill the available width when there's room to spare; otherwise sits at the minimum. */
  private readonly _colWidth = computed<number>(() => {
    const n = this.orderedStations().length;
    if (n <= 0) { return MIN_COL_WIDTH; }

    return (this.containerWidth() - LEFT_PADDING - RIGHT_PADDING) / n;
  });

  /** True once a route has more stops than fit at their minimum width — there's a scrollbar, so hint at it. */
  protected readonly hasOverflow = computed<boolean>(() =>
    this._hostWidth() > 0 && this._naturalWidth() > this._hostWidth()
  );

  protected readonly containerHeight = CHART_BOTTOM + BOTTOM_PADDING;

  /** The floating preview card's `left`, clamped so it can't run off either edge of this component. */
  protected readonly previewLeft = computed<number>(() => {
    const anchor = this._anchor();
    if (!anchor) { return 0; }

    const cardHalfWidth = 118;
    const margin = 16;
    const hostWidth = this._elementRef.nativeElement.getBoundingClientRect().width;
    return Math.min(Math.max(anchor.left, cardHalfWidth + margin), hostWidth - cardHalfWidth - margin);
  });

  /** The floating preview card's `top`, just below the tapped button. */
  protected readonly previewTop = computed<number>(() => this._anchor()?.top ?? 0);

  /**
   * Whether the trail has "drawn in" yet — starts `false` so the reveal clip
   * sits at zero width, then flips to `true` a beat after first paint so the
   * CSS `width` transition on `.route-sweep-rect` actually animates instead
   * of snapping straight to full width. One orchestrated page-load moment,
   * not a loop — and skipped entirely under reduced motion.
   */
  protected readonly sweptIn = signal(false);

  public ngAfterViewInit(): void {
    const el = this._scrollEl()?.nativeElement;
    if (!el) { return; }

    this._resizeObserver = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width;
      if (width) { this._hostWidth.set(width); }
    });
    this._resizeObserver.observe(el);

    /** The card is anchored by a one-time rect snapshot, not tracked live — closing on scroll avoids it drifting from its waypoint. */
    el.addEventListener('scroll', this._closePreview, { passive: true });

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      this.sweptIn.set(true);
    } else {
      setTimeout(() => this.sweptIn.set(true), 60);
    }
  }

  public ngOnDestroy(): void {
    this._resizeObserver?.disconnect();
    this._scrollEl()?.nativeElement.removeEventListener('scroll', this._closePreview);
  }

  @HostListener('window:resize')
  protected onWindowResize(): void {
    this._closePreview();
  }

  private readonly _closePreview = (): void => {
    this.hoveredStopId.set(null);
    this._anchor.set(null);
  };
  /** Ground level on the elevation chart — where the trailhead and summit markers sit. */
  protected readonly chartBaseline = CHART_BOTTOM;

  /** Reference elevation bands (with their $ labels) drawn behind the trail — the chart's y-axis made visible. */
  protected readonly elevationTicks = computed<IElevationTick[]>(() =>
    ELEVATION_TICKS.map(value => ({
      label: formatDollars(value),
      y: CHART_BOTTOM - logT(value) * (CHART_BOTTOM - CHART_TOP)
    }))
  );

  /** Every point the trail passes through, ground level at the trailhead and the summit flag included. */
  private readonly _trailPoints = computed<IPoint[]>(() => {
    const ordered = this.orderedStations();
    const stationPoints = ordered.map((_, index) => ({ x: this.leftPx(index), y: this.elevationY(index) }));

    return [
      { x: this.todayX(), y: CHART_BOTTOM },
      ...stationPoints,
      { x: this.finishX(), y: CHART_BOTTOM }
    ];
  });

  /** The connector's `d` string — a smooth curve threaded through the trailhead, every waypoint, and the summit. */
  protected readonly connectorD = computed<string>(() => buildSmoothPathD(this._trailPoints()));

  /** A filled silhouette following the same ridge as the connector, sunk to a shared baseline — the trail's mountain range. */
  protected readonly mountainD = computed<string>(() => {
    const points = this._trailPoints();
    if (points.length < 2) { return ''; }

    const ridge = buildSmoothPathD(points);
    const floor = CHART_BOTTOM + 40;
    const last = points[points.length - 1];
    const first = points[0];

    return `${ridge} L${last.x},${floor} L${first.x},${floor} Z`;
  });

  /** Total funding on offer across every stop on this trail — the number waiting at the summit. */
  protected readonly totalPotential = computed<number>(() =>
    this.orderedStations().reduce((sum, station) => sum + this._stopAmount(station.stop), 0)
  );

  protected readonly totalPotentialLabel = computed<string>(() => {
    const total = this.totalPotential();
    return total > 0 ? formatDollars(total) : '';
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

  /** Chronological x position — evenly spaced left to right, time's arrow for the whole chart. */
  protected leftPx(index: number): number {
    return LEFT_PADDING + index * this._colWidth();
  }

  /** A little left of the first stop — the trailhead, at ground level. */
  protected todayX(): number {
    return LEFT_PADDING - END_MARKER_GAP;
  }

  /** A little right of the last stop — the summit marker, back down at ground level. */
  protected finishX(): number {
    const lastIndex = Math.max(0, this.orderedStations().length - 1);
    return this.leftPx(lastIndex) + END_MARKER_GAP;
  }

  /** Ground level minus a rise proportional to the stop's award size — bigger stops are taller peaks. */
  protected elevationY(index: number): number {
    const station = this.orderedStations()[index];
    if (!station) { return CHART_BOTTOM; }

    const weight = this.elevationWeight(station.stop);
    return CHART_BOTTOM - weight * (CHART_BOTTOM - CHART_TOP);
  }

  /** 0..1 — where this stop's award falls on the fixed dollar scale. Missing data reads as a plausible mid-size hill. */
  protected elevationWeight(stop: IStop): number {
    const amount = this._stopAmount(stop);
    return logT(amount > 0 ? amount : FALLBACK_AMOUNT);
  }

  /** Waypoint scale — the biggest stops on the route render as visibly bigger pucks. */
  protected nodeScale(stop: IStop): number {
    return 1 + this.elevationWeight(stop) * SCALE_MAX;
  }

  /**
   * The single tallest peak on the trail — `null` when the route is flat
   * (every stop landed on the same fallback elevation, so there's nothing
   * real to crown). Only stops with genuine separation from the rest get
   * the peak treatment; a coin-flip-close "biggest" reads as arbitrary.
   */
  protected readonly peakStopId = computed<string | null>(() => {
    const ordered = this.orderedStations();
    if (ordered.length === 0) { return null; }

    const weighted = ordered.map(station => ({ id: station.stop.id, weight: this.elevationWeight(station.stop) }));
    const peak = weighted.reduce((a, b) => (b.weight > a.weight ? b : a));
    const floor = Math.min(...weighted.map(w => w.weight));

    return peak.weight - floor > 0.05 ? peak.id : null;
  });

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

  /** Just the date portion, for the two-line label under a waypoint (narrower than the full deadline sentence). */
  protected closeDateLabel(stop: IStop): string {
    const raw = stop.closeDate ?? stop.registrationDeadline;
    const date = toDate(raw);
    if (!date) { return ''; }

    const days = this._daysUntilClose(stop);
    return days !== null && days >= 0 ? formatDate(raw) : `Closed ${formatDate(raw)}`;
  }

  /** Just the "Nd" countdown, for the two-line label under a waypoint. */
  protected daysLeftLabel(stop: IStop): string {
    const days = this._daysUntilClose(stop);
    return days !== null && days >= 0 ? `${days}d` : '';
  }

  /** The selected stop's own station, for the floating preview card — `null` when nothing is selected. */
  protected readonly selectedStation = computed<IRoutePathStation | null>(() => {
    const id = this.hoveredStopId();
    return this.orderedStations().find(station => station.stop.id === id) ?? null;
  });

  protected isOpen(stop: IStop): boolean {
    return this.hoveredStopId() === stop.id;
  }

  /** Opens the floating preview card for `stop`, anchored to the tapped button — a second tap closes it. */
  protected toggle(stop: IStop, event: MouseEvent): void {
    if (this.isOpen(stop)) {
      this._closePreview();
      return;
    }

    this.hoveredStopId.set(stop.id);

    const buttonRect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const hostRect = this._elementRef.nativeElement.getBoundingClientRect();
    this._anchor.set({
      left: buttonRect.left - hostRect.left + buttonRect.width / 2,
      top: buttonRect.bottom - hostRect.top + 14
    });
  }

  protected viewDetails(stop: IStop): void {
    this._closePreview();
    this.opened.emit(stop);
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (!this._elementRef.nativeElement.contains(event.target as Node)) {
      this._closePreview();
    }
  }

  /** Best single number for a stop's award — the midpoint of a range, or whichever bound is on file. */
  private _stopAmount(stop: IStop): number {
    const { minAward, maxAward } = stop;
    if (minAward && maxAward) { return (minAward + maxAward) / 2; }
    return maxAward ?? minAward ?? 0;
  }

  private _daysUntilClose(stop: IStop): number | null {
    const date = toDate(stop.closeDate ?? stop.registrationDeadline);
    if (!date) { return null; }

    return Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  }
}
