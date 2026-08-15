import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';

import { CorpusService } from '@app/core/services/corpus.service';

import { TerrainFieldComponent } from '../terrain-field/terrain-field.component';

/** How long each rotating status line holds before the next one swaps in. */
export const SURVEYING_MESSAGE_INTERVAL_MS = 5000;

/** Static fallback shown in the "Screening…" line until real corpus stats arrive. */
const FALLBACK_PROGRAM_COUNT_LABEL = '2,143';

const WORDMARK = 'FundPath';

/**
 * Full-screen "Surveying" interstitial shown while `buildRoute` (a ~300s
 * callable) is in flight — replaces the old in-button spinner.
 *
 * Reuses `ss-terrain-field` as a continuing background, staggers the
 * wordmark in letter-by-letter with the shared `letterReveal` keyframe,
 * eases a progress bar to 85% (never completing, per the plan — the bar
 * sits inside an 85%-wide track so `barProgress`'s 0%→100% keyframe reads
 * as "eases to 85%" without needing a bespoke keyframe), and rotates status
 * copy every ~5s through the real pipeline steps.
 *
 * The rotating message reuses the sibling `startup-state` repo's
 * `@switch`-over-identical-templates trick (see
 * `briefing.component.html`/`.ts`'s `preparingMessageIndex`): switching over
 * an index that changes per message, even though every `@case` renders
 * identical markup, forces Angular to tear down and recreate the `<p>` so
 * its entrance animation re-fires on every rotation.
 *
 * Under `prefers-reduced-motion`: no letter blur/rise-in (letters render at
 * full opacity immediately), no shimmer sweep (not rendered at all), and the
 * progress bar sits statically at 85% — but the message still rotates via a
 * plain text swap, just without the fade-up entrance.
 */
@Component({
  selector: 'ss-surveying-interstitial',
  standalone: true,
  imports: [TerrainFieldComponent],
  templateUrl: './surveying-interstitial.component.html',
  styleUrl: './surveying-interstitial.component.scss'
})
export class SurveyingInterstitialComponent implements OnInit, OnDestroy {
  private readonly _corpusService = inject(CorpusService);
  private readonly _stats = toSignal(this._corpusService.stats$, { initialValue: null });
  private _rotationTimer?: ReturnType<typeof setInterval>;

  public readonly wordmarkLetters = WORDMARK.split('');
  public readonly reducedMotion = this._prefersReducedMotion();
  public readonly messageIndex = signal(0);

  /** Live program count from `corpus.service.ts` when available, otherwise a static placeholder. */
  public readonly messages = computed<string[]>(() => {
    const totalCount = this._stats()?.totalCount;
    const programsLabel = totalCount != null ? totalCount.toLocaleString('en-US') : FALLBACK_PROGRAM_COUNT_LABEL;

    return [
      'Reading your description…',
      `Screening ${programsLabel} programs…`,
      'Applying eligibility rules…',
      "Checking who's won before…",
      'Sequencing your route…',
      'Writing your explanations…'
    ];
  });

  public get currentMessage(): string {
    return this.messages()[this.messageIndex()];
  }

  public ngOnInit(): void {
    this._rotationTimer = setInterval(() => {
      this.messageIndex.update((index) => (index + 1) % this.messages().length);
    }, SURVEYING_MESSAGE_INTERVAL_MS);
  }

  public ngOnDestroy(): void {
    if (this._rotationTimer) {
      clearInterval(this._rotationTimer);
    }
  }

  private _prefersReducedMotion(): boolean {
    return typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  }
}
