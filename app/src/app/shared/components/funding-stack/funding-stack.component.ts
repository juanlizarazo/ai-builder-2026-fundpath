import { Component, computed, input, model } from '@angular/core';

import { formatDollars } from '@app/shared/utils/format.utils';
import { linearPosition } from '@app/shared/utils/scale.utils';
import { FitTier, FundPath } from '../../../../types/firestore';

type IStop = FundPath.Firestore.Routes.IStop;

/** One rendered segment of the stack: a stop plus its expected-award midpoint. */
export interface IFundingStackSegment {
  stop: IStop;
  /** Midpoint of `minAward`/`maxAward` — the "expected award" this segment represents. */
  amount: number;
  /** Cumulative total (in dollars) at the *end* of this segment, including it. */
  cumulativeEnd: number;
  /** Left edge of the segment as a 0..1 fraction of `askMax` (clamped). */
  startFraction: number;
  /** Right edge of the segment as a 0..1 fraction of `askMax` (clamped). */
  endFraction: number;
}

/** Tier ramp from Task 1's tokens (`--fp-tier-*`), reused here for segment fill. */
const TIER_COLOR_VAR: Record<FitTier, string> = {
  'likely': 'var(--fp-tier-likely)',
  'potential': 'var(--fp-tier-potential)',
  'adjacent': 'var(--fp-tier-adjacent)',
  'probably-not': 'var(--fp-tier-probably-not)'
};

/** Midpoint of a stop's award range — falls back to whichever bound is present. */
function midpointAward(stop: IStop): number {
  const { minAward, maxAward } = stop;

  if (typeof minAward === 'number' && typeof maxAward === 'number') { return (minAward + maxAward) / 2; }
  if (typeof maxAward === 'number') { return maxAward; }
  if (typeof minAward === 'number') { return minAward; }

  return 0;
}

/**
 * The funding stack: a single horizontal bar showing how each stop's expected
 * award (midpoint of `minAward`/`maxAward`) stacks toward the founder's
 * `askMax`. Segments are ordered by `sequenceMonth` and colored by fit tier.
 *
 * Any shortfall (`askMax - Σ(segments)` > 0) renders as a hatched gap with
 * its dollar amount. Any overshoot (segments exceed `askMax`) renders as a
 * visible extension past the track's cap rather than being silently
 * clipped — the point is to read as "more than you asked for."
 *
 * Hovering/focusing a segment sets `hoveredStopId` (a two-way model),
 * shared with the survey-line diagram so the matching station can light up.
 */
@Component({
  selector: 'app-funding-stack',
  standalone: true,
  imports: [],
  templateUrl: './funding-stack.component.html',
  styleUrl: './funding-stack.component.scss'
})
export class FundingStackComponent {
  /** Stops to render as segments — typically the route's primary + alongside stops. */
  public readonly stops = input.required<IStop[]>();
  /** The founder's funding need — the track's scale domain (`[0, askMax]`). */
  public readonly askMax = input.required<number>();
  /** Shared with the survey-line diagram: which stop, if any, is currently hovered/focused. */
  public readonly hoveredStopId = model<string | null>(null);

  protected readonly formatDollars = formatDollars;
  protected readonly tierColor = TIER_COLOR_VAR;

  /** Stops with award data, ordered by `sequenceMonth` (undefined sorts last). */
  protected readonly segments = computed<IFundingStackSegment[]>(() => {
    const askMax = this.askMax();

    const ordered = [...this.stops()]
      .filter(stop => typeof stop.minAward === 'number' || typeof stop.maxAward === 'number')
      .sort((a, b) => (a.sequenceMonth ?? Number.MAX_SAFE_INTEGER) - (b.sequenceMonth ?? Number.MAX_SAFE_INTEGER));

    let cumulative = 0;

    return ordered.map((stop) => {
      const amount = midpointAward(stop);
      const startFraction = linearPosition(cumulative, 0, askMax);
      cumulative += amount;
      const endFraction = linearPosition(cumulative, 0, askMax);

      return { stop, amount, cumulativeEnd: cumulative, startFraction, endFraction };
    });
  });

  /** Σ(segment midpoints) — the total expected award across all segments. */
  protected readonly totalAmount = computed<number>(() => {
    const segments = this.segments();
    return segments.length > 0 ? segments[segments.length - 1].cumulativeEnd : 0;
  });

  /** `askMax - Σ(segments)`, floored at 0 — renders as the hatched gap. */
  protected readonly shortfall = computed<number>(() => Math.max(0, this.askMax() - this.totalAmount()));

  /** `Σ(segments) - askMax`, floored at 0 — renders extending past the track's cap. */
  protected readonly overshoot = computed<number>(() => Math.max(0, this.totalAmount() - this.askMax()));

  protected readonly hasOvershoot = computed<boolean>(() => this.overshoot() > 0);
  protected readonly hasShortfall = computed<boolean>(() => this.shortfall() > 0 && !this.hasOvershoot());

  protected readonly shortfallWidthPct = computed<number>(() => {
    const askMax = this.askMax();
    return askMax > 0 ? (this.shortfall() / askMax) * 100 : 0;
  });

  /** Unclamped — this is the piece that's meant to visibly spill past 100%. */
  protected readonly overshootWidthPct = computed<number>(() => {
    const askMax = this.askMax();
    return askMax > 0 ? (this.overshoot() / askMax) * 100 : 0;
  });

  protected segmentWidthPct(segment: IFundingStackSegment): number {
    return (segment.endFraction - segment.startFraction) * 100;
  }

  protected segmentLabel(segment: IFundingStackSegment): string {
    return `${segment.stop.title} — ${formatDollars(segment.amount)} expected`;
  }

  protected onHover(stopId: string | null): void {
    this.hoveredStopId.set(stopId);
  }

  protected isHovered(stop: IStop): boolean {
    return this.hoveredStopId() === stop.id;
  }
}
