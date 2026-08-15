import { TestBed } from '@angular/core/testing';
import { Timestamp } from '@angular/fire/firestore';
import { Observable, of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CorpusService } from '@app/core/services/corpus.service';

import { SurveyingInterstitialComponent, SURVEYING_MESSAGE_INTERVAL_MS } from './surveying-interstitial.component';

const FAKE_STATS = {
  lastSyncedAt: Timestamp.fromDate(new Date()),
  countGrantsGov: 1000,
  countGrantsGovHydrated: 800,
  countSeed: 100,
  countSbir: 200,
  countUtah: 300,
  countAssistanceListings: 400,
  countUSASpending: 143,
  totalCount: 2143
};

function mockMatchMedia(reducedMotion: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('prefers-reduced-motion') && reducedMotion,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  })) as unknown as typeof window.matchMedia;
}

function createFixture(stats$: Observable<unknown> = of(null)) {
  TestBed.configureTestingModule({
    imports: [SurveyingInterstitialComponent],
    providers: [{ provide: CorpusService, useValue: { stats$ } }]
  });

  const fixture = TestBed.createComponent(SurveyingInterstitialComponent);
  fixture.detectChanges();

  return fixture;
}

describe('SurveyingInterstitialComponent', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('rotates through the pipeline messages in order, ~5s apart, and loops', () => {
    mockMatchMedia(false);
    vi.useFakeTimers();
    const component = createFixture().componentInstance;

    expect(component.currentMessage).toBe('Reading your description…');

    vi.advanceTimersByTime(SURVEYING_MESSAGE_INTERVAL_MS);
    expect(component.currentMessage).toBe('Screening 2,143 programs…');

    vi.advanceTimersByTime(SURVEYING_MESSAGE_INTERVAL_MS);
    expect(component.currentMessage).toBe('Applying eligibility rules…');

    vi.advanceTimersByTime(SURVEYING_MESSAGE_INTERVAL_MS);
    expect(component.currentMessage).toBe("Checking who's won before…");

    vi.advanceTimersByTime(SURVEYING_MESSAGE_INTERVAL_MS);
    expect(component.currentMessage).toBe('Sequencing your path…');

    vi.advanceTimersByTime(SURVEYING_MESSAGE_INTERVAL_MS);
    expect(component.currentMessage).toBe('Writing your explanations…');

    // Loops back to the first message rather than stopping, since buildRoute can run ~300s.
    vi.advanceTimersByTime(SURVEYING_MESSAGE_INTERVAL_MS);
    expect(component.currentMessage).toBe('Reading your description…');
  });

  it('uses the live corpus program count once stats arrive, falling back to a placeholder until then', () => {
    mockMatchMedia(false);
    const component = createFixture(of(FAKE_STATS)).componentInstance;

    expect(component.messages()[1]).toBe('Screening 2,143 programs…');
  });

  it('falls back to a static placeholder count when stats have not loaded', () => {
    mockMatchMedia(false);
    const component = createFixture(of(null)).componentInstance;

    expect(component.messages()[1]).toBe('Screening 2,143 programs…');
  });

  it('clears the rotation timer on destroy', () => {
    mockMatchMedia(false);
    vi.useFakeTimers();
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval');
    const fixture = createFixture();

    fixture.destroy();

    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it('flags reduced motion so the template can skip animated entrances and the shimmer sweep', () => {
    mockMatchMedia(true);
    const fixture = createFixture();

    expect(fixture.componentInstance.reducedMotion).toBe(true);
    expect(fixture.nativeElement.querySelector('.surveying-letter.is-animated')).toBeNull();
    expect(fixture.nativeElement.querySelector('.surveying-bar.is-animated')).toBeNull();
    expect(fixture.nativeElement.querySelector('.surveying-bar-shimmer')).toBeNull();
  });

  it('applies animated entrance classes when motion is allowed', () => {
    mockMatchMedia(false);
    const fixture = createFixture();

    expect(fixture.componentInstance.reducedMotion).toBe(false);
    expect(fixture.nativeElement.querySelector('.surveying-letter.is-animated')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.surveying-bar.is-animated')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.surveying-bar-shimmer')).not.toBeNull();
  });
});
