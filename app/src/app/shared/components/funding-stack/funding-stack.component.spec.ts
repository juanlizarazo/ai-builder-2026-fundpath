import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { FundingStackComponent } from './funding-stack.component';
import { FundPath } from '../../../../types/firestore';

type IStop = FundPath.Firestore.Routes.IStop;

function makeStop(overrides: Partial<IStop> & Pick<IStop, 'id' | 'title'>): IStop {
  return {
    agency: 'Test Agency',
    fitTier: 'likely',
    fitTierLabel: 'Likely Fit',
    placement: 'primary',
    eligibilityFlags: [],
    tasks: [],
    ...overrides
  };
}

function createFixture(stops: IStop[], askMax: number) {
  TestBed.configureTestingModule({ imports: [FundingStackComponent] });

  const fixture = TestBed.createComponent(FundingStackComponent);
  fixture.componentRef.setInput('stops', stops);
  fixture.componentRef.setInput('askMax', askMax);
  fixture.detectChanges();

  return fixture;
}

/**
 * Test-only surface for `FundingStackComponent`'s protected computeds —
 * exercises the correctness math the task explicitly calls out: segments
 * summing against `askMax`, the shortfall gap, and overshoot rendering
 * rather than clipping.
 */
interface IFundingStackTestSurface {
  segments(): { stop: IStop; amount: number; cumulativeEnd: number }[];
  totalAmount(): number;
  shortfall(): number;
  overshoot(): number;
  hasOvershoot(): boolean;
  hasShortfall(): boolean;
  shortfallWidthPct(): number;
  overshootWidthPct(): number;
  hoveredStopId(): string | null;
}

function asTestSurface(fixture: ReturnType<typeof createFixture>): IFundingStackTestSurface {
  return fixture.componentInstance as unknown as IFundingStackTestSurface;
}

describe('FundingStackComponent', () => {
  describe('segment sums vs. askMax', () => {
    it('sums segment midpoints (min+max)/2 and orders them by sequenceMonth', () => {
      const stops = [
        makeStop({ id: 'b', title: 'UTIF', sequenceMonth: 6, minAward: 25_000, maxAward: 75_000 }), // mid 50K
        makeStop({ id: 'a', title: 'SBIR I', sequenceMonth: 0, minAward: 150_000, maxAward: 350_000 }), // mid 250K
        makeStop({ id: 'c', title: 'SBIR II', sequenceMonth: 12, minAward: 1_000_000, maxAward: 2_000_000 }) // mid 1.5M
      ];

      const fixture = createFixture(stops, 2_000_000);
      const component = asTestSurface(fixture);
      const segments = component.segments();

      expect(segments.map(s => s.stop.id)).toEqual(['a', 'b', 'c']);
      expect(segments[0].amount).toBe(250_000);
      expect(segments[1].amount).toBe(50_000);
      expect(segments[2].amount).toBe(1_500_000);

      const total = segments.reduce((sum, s) => sum + s.amount, 0);
      expect(total).toBe(1_800_000);
      expect(component.totalAmount()).toBe(total);
    });

    it('falls back to the single available bound when only one of min/maxAward is present', () => {
      const stops = [
        makeStop({ id: 'a', title: 'Max only', sequenceMonth: 0, maxAward: 400_000 }),
        makeStop({ id: 'b', title: 'Min only', sequenceMonth: 1, minAward: 100_000 })
      ];

      const fixture = createFixture(stops, 1_000_000);
      const component = asTestSurface(fixture);

      expect(component.segments().map(s => s.amount)).toEqual([400_000, 100_000]);
    });

    it('excludes stops with no award data at all from the segment list', () => {
      const stops = [
        makeStop({ id: 'a', title: 'Has award', sequenceMonth: 0, minAward: 100_000, maxAward: 100_000 }),
        makeStop({ id: 'b', title: 'No award data' })
      ];

      const fixture = createFixture(stops, 1_000_000);
      const component = asTestSurface(fixture);

      expect(component.segments().map(s => s.stop.id)).toEqual(['a']);
    });
  });

  describe('shortfall', () => {
    it('renders shortfall = askMax − Σ(segments) when segments fall short of the ask', () => {
      const stops = [
        makeStop({ id: 'a', title: 'SBIR I', sequenceMonth: 0, minAward: 250_000, maxAward: 250_000 }),
        makeStop({ id: 'b', title: 'UTIF', sequenceMonth: 1, minAward: 50_000, maxAward: 50_000 }),
        makeStop({ id: 'c', title: 'SBIR II', sequenceMonth: 12, minAward: 1_500_000, maxAward: 1_500_000 })
      ];

      // 250K + 50K + 1.5M = 1.8M against a 2M ask -> 200K short, matching the brief's worked example.
      const fixture = createFixture(stops, 2_000_000);
      const component = asTestSurface(fixture);

      expect(component.totalAmount()).toBe(1_800_000);
      expect(component.shortfall()).toBe(200_000);
      expect(component.hasShortfall()).toBe(true);
      expect(component.overshoot()).toBe(0);
      expect(component.hasOvershoot()).toBe(false);
      expect(component.shortfallWidthPct()).toBeCloseTo(10, 5); // 200K / 2M = 10%

      fixture.detectChanges();
      const gap = fixture.nativeElement.querySelector('.funding-stack-gap');
      expect(gap).not.toBeNull();
      expect(fixture.nativeElement.textContent).toContain('200K short');
    });

    it('has no shortfall when segments exactly meet askMax', () => {
      const stops = [makeStop({ id: 'a', title: 'Exact', sequenceMonth: 0, minAward: 500_000, maxAward: 500_000 })];
      const fixture = createFixture(stops, 500_000);
      const component = asTestSurface(fixture);

      expect(component.shortfall()).toBe(0);
      expect(component.hasShortfall()).toBe(false);
    });
  });

  describe('overshoot renders rather than clips', () => {
    it('computes overshoot = Σ(segments) − askMax when segments exceed the ask', () => {
      const stops = [
        makeStop({ id: 'a', title: 'Big award', sequenceMonth: 0, minAward: 1_500_000, maxAward: 1_500_000 }),
        makeStop({ id: 'b', title: 'Another', sequenceMonth: 6, minAward: 1_000_000, maxAward: 1_000_000 })
      ];

      // 2.5M in expected awards against a 2M ask -> 500K overshoot.
      const fixture = createFixture(stops, 2_000_000);
      const component = asTestSurface(fixture);

      expect(component.totalAmount()).toBe(2_500_000);
      expect(component.overshoot()).toBe(500_000);
      expect(component.hasOvershoot()).toBe(true);
      expect(component.shortfall()).toBe(0);
      expect(component.hasShortfall()).toBe(false); // overshoot and shortfall are mutually exclusive
      expect(component.overshootWidthPct()).toBeCloseTo(25, 5); // 500K / 2M = 25%
    });

    it('renders every segment (none dropped) and a visible overshoot element instead of clipping silently', () => {
      const stops = [
        makeStop({ id: 'a', title: 'Big award', sequenceMonth: 0, minAward: 1_500_000, maxAward: 1_500_000 }),
        makeStop({ id: 'b', title: 'Another', sequenceMonth: 6, minAward: 1_000_000, maxAward: 1_000_000 })
      ];

      const fixture = createFixture(stops, 2_000_000);
      fixture.detectChanges();

      // Both segments are still present in the DOM — overshoot doesn't drop data, it renders past the cap.
      const segmentEls = fixture.nativeElement.querySelectorAll('.funding-stack-segment');
      expect(segmentEls.length).toBe(2);

      const overshootEl = fixture.nativeElement.querySelector('.funding-stack-overshoot') as HTMLElement;
      expect(overshootEl).not.toBeNull();
      expect(overshootEl.style.width).toBe('25%');

      // No hatched shortfall gap should render alongside an overshoot.
      expect(fixture.nativeElement.querySelector('.funding-stack-gap')).toBeNull();

      // The segments' own widths sum to at most 100% of the track (clamped) — the overshoot
      // piece is a separate, additional element rather than the segments themselves overflowing.
      const segmentWidths = Array.from(segmentEls).map((el) =>
        parseFloat((el as HTMLElement).style.width || '0')
      );
      const segmentWidthSum = segmentWidths.reduce((sum, w) => sum + w, 0);
      expect(segmentWidthSum).toBeLessThanOrEqual(100.001);
    });
  });

  describe('hover/focus coupling', () => {
    it('sets hoveredStopId on mouseenter/focus and clears it on mouseleave/blur', () => {
      const stops = [makeStop({ id: 'a', title: 'A', sequenceMonth: 0, minAward: 100_000, maxAward: 100_000 })];
      const fixture = createFixture(stops, 500_000);
      const component = asTestSurface(fixture);
      fixture.detectChanges();

      expect(component.hoveredStopId()).toBeNull();

      const segmentEl = fixture.nativeElement.querySelector('.funding-stack-segment') as HTMLElement;
      segmentEl.dispatchEvent(new Event('mouseenter'));
      expect(component.hoveredStopId()).toBe('a');

      segmentEl.dispatchEvent(new Event('mouseleave'));
      expect(component.hoveredStopId()).toBeNull();

      segmentEl.dispatchEvent(new Event('focus'));
      expect(component.hoveredStopId()).toBe('a');

      segmentEl.dispatchEvent(new Event('blur'));
      expect(component.hoveredStopId()).toBeNull();
    });
  });
});
