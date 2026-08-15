import { DecimalPipe } from '@angular/common';
import { Component, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { formatDistanceToNowStrict } from 'date-fns';

import { CORPUS_SOURCE_COUNT, CorpusService } from '@app/core/services/corpus.service';

/** Duration of the count-up animation once real stats arrive. */
const COUNT_UP_DURATION_MS = 1400;
/** Number of animation-frame-ish steps the count-up interpolates across. */
const COUNT_UP_STEPS = 48;

/** Standard ease-out-cubic: fast start, settles gently into the final value. */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** A Firestore `Timestamp`, a `Date`, or anything `Timestamp`-shaped (has `.toDate()`). */
type TimestampLike = Date | { toDate: () => Date };

function toDate(value: TimestampLike): Date {
  return typeof (value as { toDate?: unknown }).toDate === 'function'
    ? (value as { toDate: () => Date }).toDate()
    : (value as Date);
}

/**
 * Live corpus stat strip: `2,143 PROGRAMS INDEXED · 6 SOURCES · SYNCED 4 HOURS AGO`,
 * reading real values from `CorpusService` (`corpusMeta/stats`). The program
 * count animates in with an ease-out-cubic count-up the first time real data
 * arrives; the numeric fields reserve a `ch`-based min-width so digits don't
 * jitter the layout as they animate.
 */
@Component({
  selector: 'ss-stat-strip',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './stat-strip.component.html',
  styleUrl: './stat-strip.component.scss'
})
export class StatStripComponent implements OnDestroy {
  private readonly _corpusService = inject(CorpusService);

  protected readonly sourceCount = CORPUS_SOURCE_COUNT;
  protected readonly displayedCount = signal(0);

  private readonly _stats = toSignal(this._corpusService.stats$, { initialValue: null });
  private _hasAnimated = false;
  private _countUpTimer?: ReturnType<typeof setInterval>;

  protected readonly syncedLabel = computed(() => {
    const stats = this._stats();

    return stats ? formatDistanceToNowStrict(toDate(stats.lastSyncedAt), { addSuffix: true }) : '';
  });

  protected readonly hasStats = computed(() => this._stats() !== null);

  constructor() {
    effect(() => {
      const stats = this._stats();

      if (stats && !this._hasAnimated) {
        this._hasAnimated = true;
        this._animateCountUp(stats.totalCount);
      }
    });
  }

  public ngOnDestroy(): void {
    if (this._countUpTimer) {
      clearInterval(this._countUpTimer);
    }
  }

  private _animateCountUp(target: number): void {
    const intervalMs = COUNT_UP_DURATION_MS / COUNT_UP_STEPS;
    let step = 0;

    this._countUpTimer = setInterval(() => {
      step++;
      const progress = Math.min(step / COUNT_UP_STEPS, 1);
      this.displayedCount.set(Math.round(easeOutCubic(progress) * target));

      if (step >= COUNT_UP_STEPS) {
        clearInterval(this._countUpTimer);
        this.displayedCount.set(target);
      }
    }, intervalMs);
  }
}
