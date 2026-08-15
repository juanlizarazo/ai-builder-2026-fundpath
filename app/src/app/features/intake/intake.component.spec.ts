import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@angular/fire/firestore', () => ({
  Firestore: class {},
  doc: vi.fn(),
  docData: vi.fn(() => of(null))
}));

function mockMatchMedia(reducedMotion = false) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('prefers-reduced-motion') && reducedMotion,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  })) as unknown as typeof window.matchMedia;
}

import { Firestore } from '@angular/fire/firestore';

import { FundpathService } from '@app/core/services/fundpath.service';
import { FundPath } from '../../../types/firestore';

import { IntakeComponent } from './intake.component';

function createFixture(fundpathService: Partial<FundpathService> = {}) {
  TestBed.configureTestingModule({
    imports: [IntakeComponent],
    providers: [
      provideRouter([]),
      { provide: Firestore, useValue: {} },
      {
        provide: FundpathService,
        useValue: {
          currentRouteId: () => null,
          buildRoute: vi.fn(),
          ...fundpathService
        }
      }
    ]
  });

  const fixture = TestBed.createComponent(IntakeComponent);
  fixture.detectChanges();

  return fixture;
}

describe('IntakeComponent', () => {
  it('defaults to Guided mode', () => {
    const fixture = createFixture();

    expect(fixture.componentInstance.mode()).toBe('guided');
    expect(fixture.nativeElement.querySelector('.guided-panel').classList).toContain('is-active');
    expect(fixture.nativeElement.querySelector('.describe-panel').classList).not.toContain('is-active');
  });

  it('crossfades to Describe mode when its tab is clicked, and back', () => {
    const fixture = createFixture();
    const [guidedTab, describeTab] = Array.from(fixture.nativeElement.querySelectorAll('.mode-tab')) as HTMLButtonElement[];

    describeTab.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.mode()).toBe('describe');
    expect(fixture.nativeElement.querySelector('.describe-panel').classList).toContain('is-active');
    expect(fixture.nativeElement.querySelector('.guided-panel').classList).not.toContain('is-active');

    guidedTab.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.mode()).toBe('guided');
  });

  it('keeps only one token picker open at a time (activePicker exclusivity)', () => {
    const component = createFixture().componentInstance;

    component.togglePicker('industry');
    expect(component.activePicker()).toBe('industry');

    component.togglePicker('county');
    expect(component.activePicker()).toBe('county');

    // Toggling the currently-open picker again closes it.
    component.togglePicker('county');
    expect(component.activePicker()).toBeNull();
  });

  it('switching modes closes any open picker', () => {
    const component = createFixture().componentInstance;

    component.togglePicker('industry');
    expect(component.activePicker()).toBe('industry');

    component.setMode('describe');
    expect(component.activePicker()).toBeNull();
  });

  it('requires industry, county, team, and amount before Guided mode can submit', () => {
    const component = createFixture().componentInstance;

    expect(component.isGuidedComplete()).toBe(false);

    component.selectIndustry('health-it');
    component.selectCounty('Salt Lake');
    component.selectTeam('11–50');
    expect(component.isGuidedComplete()).toBe(false);

    component.selectAmount('$500K–$2M');
    expect(component.isGuidedComplete()).toBe(true);
  });

  it('tracks completion across all six counted fields for the progress counter', () => {
    const component = createFixture().componentInstance;

    expect(component.completionCount()).toBe(0);

    component.selectIndustry('health-it');
    component.selectCounty('Salt Lake');
    component.selectTeam('11–50');
    component.selectAmount('$500K–$2M');
    expect(component.completionCount()).toBe(4);

    component.selectRevenue('$500K–$2M');
    component.selectRaised('$1M–$5M');
    expect(component.completionCount()).toBe(6);
  });

  it('composes the Guided-mode description and calls the existing buildRoute on submit', async () => {
    const buildRoute = vi.fn().mockResolvedValue({ profileId: 'p1', routeId: 'r1', route: {} });
    const fixture = createFixture({ buildRoute });
    const component = fixture.componentInstance;

    component.selectIndustry('health-it');
    component.selectCounty('Salt Lake');
    component.selectTeam('11–50');
    component.selectAmount('$500K–$2M');

    await component.submit();

    expect(buildRoute).toHaveBeenCalledWith(
      'Utah Health IT company in Salt Lake County, 11–50 employees. Need $500K–$2M.',
      expect.objectContaining({ smsOptIn: false })
    );
  });

  it('types out the verbatim example description when a chip is clicked in Describe mode', () => {
    // Bounded advances rather than `vi.runAllTimers()` — the hero mounts a
    // deliberately-infinite terrain-field rAF loop, which trips vitest's
    // "aborting after 10000 timers" runaway-loop guard if fully flushed.
    vi.useFakeTimers();
    const component = createFixture().componentInstance;
    component.setMode('describe');

    component.fillExample(0);
    expect(component.description()).not.toBe('');
    expect(component.description().length).toBeLessThan(component.exampleDescriptions[0].length);

    vi.advanceTimersByTime(2000);

    expect(component.description()).toBe(component.exampleDescriptions[0]);
    vi.useRealTimers();
  });

  it('erases the current description before typing in a newly-picked example, in Describe mode', () => {
    vi.useFakeTimers();
    const component = createFixture().componentInstance;
    component.setMode('describe');

    component.fillExample(0);
    vi.advanceTimersByTime(2000);
    expect(component.description()).toBe(component.exampleDescriptions[0]);

    component.fillExample(1);
    vi.advanceTimersByTime(1);
    expect(component.description().length).toBeLessThan(component.exampleDescriptions[0].length);

    vi.advanceTimersByTime(3000);
    expect(component.description()).toBe(component.exampleDescriptions[1]);
    vi.useRealTimers();
  });

  it('collapses the notify/SMS block behind a one-line summary that expands on click', () => {
    mockMatchMedia();
    const fixture = createFixture();

    expect(fixture.componentInstance.notifyExpanded()).toBe(false);
    expect(fixture.nativeElement.querySelector('.notify-collapse').classList).not.toContain('is-open');

    const toggle = fixture.nativeElement.querySelector('.notify-toggle') as HTMLButtonElement;
    toggle.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.notifyExpanded()).toBe(true);
    expect(fixture.nativeElement.querySelector('.notify-collapse').classList).toContain('is-open');
  });

  it('wraps the submit button label in .fp-btn-content (spinner-under-text fix)', () => {
    mockMatchMedia();
    const fixture = createFixture();

    const label = fixture.nativeElement.querySelector('.submit-button .fp-btn-content');
    expect(label).not.toBeNull();
    expect(label.textContent.trim()).toBe('Build my path');
  });

  it('shows the full-screen surveying interstitial while buildRoute is in flight, and hides it once resolved', async () => {
    mockMatchMedia();
    let resolveBuildRoute!: (value: Awaited<ReturnType<FundpathService['buildRoute']>>) => void;
    const buildRoute = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<FundpathService['buildRoute']>>>((resolve) => {
          resolveBuildRoute = resolve;
        })
    );
    const fixture = createFixture({ buildRoute });
    const component = fixture.componentInstance;

    component.selectIndustry('health-it');
    component.selectCounty('Salt Lake');
    component.selectTeam('11–50');
    component.selectAmount('$500K–$2M');

    const submitPromise = component.submit();
    fixture.detectChanges();

    expect(component.isSubmitting()).toBe(true);
    expect(fixture.nativeElement.querySelector('ss-surveying-interstitial')).not.toBeNull();

    resolveBuildRoute({ profileId: 'p1', routeId: 'r1', route: {} as FundPath.Firestore.Routes.IRoute });
    await submitPromise;
    fixture.detectChanges();

    expect(component.isSubmitting()).toBe(false);
    expect(fixture.nativeElement.querySelector('ss-surveying-interstitial')).toBeNull();
  });

  it('animate-fills Guided tokens sequentially, ~140ms apart, when a chip is clicked in Guided mode', () => {
    vi.useFakeTimers();
    const component = createFixture().componentInstance;

    component.fillExample(0);
    expect(component.industry()).toBe('');

    vi.advanceTimersByTime(1);
    expect(component.industry()).toBe('health-it');
    expect(component.county()).toBe('');

    vi.advanceTimersByTime(140);
    expect(component.county()).toBe('Salt Lake');

    vi.advanceTimersByTime(140 * 5);
    expect(component.useOfFunds()).toBe('R&D');

    vi.useRealTimers();
  });
});
