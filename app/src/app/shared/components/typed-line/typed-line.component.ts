import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';

/** Lead-in delay before the first character types, letting the static headline text land first. */
export const TYPED_LINE_LEAD_IN_MS = 700;
/** Per-character typing speed. */
export const TYPED_LINE_TYPE_SPEED_MS = 58;
/** Per-character deleting speed — faster than typing. */
export const TYPED_LINE_DELETE_SPEED_MS = 38;
/** How long a fully-typed phrase holds on screen before it starts deleting. */
export const TYPED_LINE_HOLD_MS = 2400;

/**
 * Typed/cycling headline: types out each phrase in `phrases` one character at
 * a time, holds, deletes, then moves to the next phrase, looping forever.
 *
 * Ported from the sibling `startup-state` repo's landing component
 * (`features/landing/landing.component.ts`'s `_tick` state machine) and
 * re-skinned to this project's tokens/caret styling.
 *
 * Under `prefers-reduced-motion`, settles immediately to the first phrase,
 * fully typed, with no timers running and no caret blink loop.
 */
@Component({
  selector: 'ss-typed-line',
  standalone: true,
  templateUrl: './typed-line.component.html',
  styleUrl: './typed-line.component.scss'
})
export class TypedLineComponent implements OnInit, OnChanges, OnDestroy {
  @Input() public phrases: string[] = [];

  /** Publicly readable (bound to in the template, and read directly in tests) rather than hidden behind a getter. */
  public typedText = '';
  public isSettled = false;

  private _phraseIndex = 0;
  private _charIndex = 0;
  private _isDeleting = false;
  private _timer?: ReturnType<typeof setTimeout>;
  private _started = false;

  public ngOnInit(): void {
    this._start();
  }

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['phrases'] && !changes['phrases'].firstChange) {
      this._reset();
      this._start();
    }
  }

  public ngOnDestroy(): void {
    this._clearTimer();
  }

  private _start(): void {
    if (this._started || !this.phrases.length) {
      return;
    }

    this._started = true;

    if (this._prefersReducedMotion()) {
      this.typedText = this.phrases[0];
      this.isSettled = true;

      return;
    }

    this._timer = setTimeout(() => this._tick(), TYPED_LINE_LEAD_IN_MS);
  }

  private _reset(): void {
    this._clearTimer();
    this._started = false;
    this._phraseIndex = 0;
    this._charIndex = 0;
    this._isDeleting = false;
    this.typedText = '';
    this.isSettled = false;
  }

  private _clearTimer(): void {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = undefined;
    }
  }

  private _prefersReducedMotion(): boolean {
    return typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  }

  private _tick(): void {
    const phrase = this.phrases[this._phraseIndex];

    if (!this._isDeleting) {
      this._charIndex++;
      this.typedText = phrase.substring(0, this._charIndex);

      if (this._charIndex === phrase.length) {
        this._timer = setTimeout(() => {
          this._isDeleting = true;
          this._tick();
        }, TYPED_LINE_HOLD_MS);

        return;
      }
    } else {
      this._charIndex--;
      this.typedText = phrase.substring(0, this._charIndex);

      if (this._charIndex === 0) {
        this._isDeleting = false;
        this._phraseIndex = (this._phraseIndex + 1) % this.phrases.length;
      }
    }

    const speed = this._isDeleting ? TYPED_LINE_DELETE_SPEED_MS : TYPED_LINE_TYPE_SPEED_MS;

    this._timer = setTimeout(() => this._tick(), speed);
  }
}
