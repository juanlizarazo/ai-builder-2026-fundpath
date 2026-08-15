import { AfterViewInit, Component, ElementRef, Input, NgZone, OnDestroy, inject } from '@angular/core';

/** How quickly the (damped) parallax layers chase the pointer target — lower is laggier. */
const PARALLAX_SMOOTHING = 0.08;

/**
 * Full-bleed, layered contour-map background used behind the landing hero
 * (and reused, per the plan, by the loading interstitial in a later task).
 *
 * Writes normalized pointer offset (`-0.5..0.5`) into CSS custom properties
 * every animation frame:
 *  - `--mx` / `--my`: raw pointer position, for the survey light, which should
 *    track the cursor directly.
 *  - `--px` / `--py`: damped/lagging pointer position, for the three contour
 *    layers, which should feel like they're settling into place a beat behind
 *    the cursor (the actual "parallax" feel).
 *
 * The pointer listener is passive and the whole loop runs outside Angular's
 * zone so tracking the mouse never triggers change detection. Under
 * `prefers-reduced-motion` or a coarse (touch) pointer, the light parks at
 * center, there is no parallax, and no rAF loop is ever started.
 */
@Component({
  selector: 'ss-terrain-field',
  standalone: true,
  templateUrl: './terrain-field.component.html',
  styleUrl: './terrain-field.component.scss'
})
export class TerrainFieldComponent implements AfterViewInit, OnDestroy {
  /** Multiplier applied to the (damped) parallax offset — lets callers dial the effect up or down. */
  @Input() public intensity = 1;

  private readonly _elementRef = inject(ElementRef<HTMLElement>);
  private readonly _ngZone = inject(NgZone);

  private _targetX = 0;
  private _targetY = 0;
  private _currentX = 0;
  private _currentY = 0;
  private _rafId: number | null = null;
  private _pointerListener?: (event: PointerEvent) => void;

  private readonly _tick = (): void => {
    this._currentX += (this._targetX - this._currentX) * PARALLAX_SMOOTHING;
    this._currentY += (this._targetY - this._currentY) * PARALLAX_SMOOTHING;

    const style = this._elementRef.nativeElement.style;

    style.setProperty('--mx', `${this._targetX}`);
    style.setProperty('--my', `${this._targetY}`);
    style.setProperty('--px', `${this._currentX * this.intensity}`);
    style.setProperty('--py', `${this._currentY * this.intensity}`);

    this._rafId = requestAnimationFrame(this._tick);
  };

  public ngAfterViewInit(): void {
    if (!this._canAnimate()) {
      return;
    }

    this._ngZone.runOutsideAngular(() => {
      this._pointerListener = (event: PointerEvent) => this._onPointerMove(event);
      window.addEventListener('pointermove', this._pointerListener, { passive: true });
      this._rafId = requestAnimationFrame(this._tick);
    });
  }

  public ngOnDestroy(): void {
    if (this._pointerListener) {
      window.removeEventListener('pointermove', this._pointerListener);
    }

    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
    }
  }

  /** No parallax/tracking under reduced motion or a coarse (touch) pointer — the light just parks at center. */
  private _canAnimate(): boolean {
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;

    return !prefersReducedMotion && !coarsePointer;
  }

  private _onPointerMove(event: PointerEvent): void {
    const width = window.innerWidth || 1;
    const height = window.innerHeight || 1;

    this._targetX = event.clientX / width - 0.5;
    this._targetY = event.clientY / height - 0.5;
  }
}
