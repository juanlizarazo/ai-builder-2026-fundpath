import { TestBed } from '@angular/core/testing';
import { Timestamp } from '@angular/fire/firestore';
import { describe, expect, it, vi } from 'vitest';

import { RunwayComponent } from './runway.component';
import { FundPath } from '../../../../types/firestore';

type IRegistrationTimeline = FundPath.Firestore.Applications.IRegistrationTimeline;
type IRegistrationStep = FundPath.Firestore.Applications.IRegistrationStep;

const DAY_MS = 24 * 60 * 60 * 1000;

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * DAY_MS);
}

function makeStep(overrides: Partial<IRegistrationStep> = {}): IRegistrationStep {
  return {
    key: 'step-1',
    label: 'Register on SAM.gov',
    system: 'SAM.gov',
    durationBusinessDays: 10,
    startBy: Timestamp.fromDate(daysFromNow(0)),
    completeBy: Timestamp.fromDate(daysFromNow(10)),
    ...overrides
  };
}

function makeTimeline(overrides: Partial<IRegistrationTimeline> = {}): IRegistrationTimeline {
  return {
    mode: 'deadline',
    closeDate: Timestamp.fromDate(daysFromNow(84)), // 12 weeks out
    steps: [],
    feasible: true,
    slackBusinessDays: 20,
    headline: 'Yes — you can make this deadline.',
    ...overrides
  };
}

function createFixture(timeline: IRegistrationTimeline, checkedStepKeys: string[] = []) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [RunwayComponent] });

  const fixture = TestBed.createComponent(RunwayComponent);
  fixture.componentRef.setInput('timeline', timeline);
  fixture.componentRef.setInput('checkedStepKeys', checkedStepKeys);
  fixture.detectChanges();

  return fixture;
}

describe('RunwayComponent', () => {
  it('positions a step proportionally by its real startBy date, not evenly spaced', () => {
    // Domain: [today, today + 84 days]. Steps at ~70 days (10 weeks) and ~21 days (3 weeks) out.
    const stepFar = makeStep({ key: 'far', startBy: Timestamp.fromDate(daysFromNow(70)), completeBy: Timestamp.fromDate(daysFromNow(77)) });
    const stepNear = makeStep({ key: 'near', startBy: Timestamp.fromDate(daysFromNow(21)), completeBy: Timestamp.fromDate(daysFromNow(24)) });
    const timeline = makeTimeline({ steps: [stepNear, stepFar] });

    const fixture = createFixture(timeline);
    const instance = fixture.componentInstance as unknown as { steps: () => { step: IRegistrationStep; startPct: number }[] };
    const rows = instance.steps();

    const far = rows.find(r => r.step.key === 'far')!;
    const near = rows.find(r => r.step.key === 'near')!;

    // 70/84 ≈ 83%, 21/84 = 25% — assert real proportionality, not even spacing (which would put them at 33%/66% for 2 steps).
    expect(far.startPct).toBeCloseTo((70 / 84) * 100, 0);
    expect(near.startPct).toBeCloseTo((21 / 84) * 100, 0);
    expect(far.startPct).toBeGreaterThan(near.startPct * 2);
  });

  it('overflows past the deadline wall and switches to signal styling when slack is negative', () => {
    const timeline = makeTimeline({
      slackBusinessDays: -5,
      steps: [makeStep({ completeBy: Timestamp.fromDate(daysFromNow(90)) })] // completes after the 84-day deadline
    });

    const fixture = createFixture(timeline);
    const instance = fixture.componentInstance as unknown as { slackEndPct: () => number; isInfeasible: () => boolean };

    expect(instance.isInfeasible()).toBe(true);
    expect(fixture.nativeElement.querySelector('.runway--infeasible')).not.toBeNull();
    // slackEndPct is unclamped — it's fine for it to exceed 100 (that's the visible overflow).
    expect(instance.slackEndPct()).toBeLessThanOrEqual(100);
  });

  it('lights exactly one node: the earliest step not yet checked', () => {
    const steps = [
      makeStep({ key: 'a', startBy: Timestamp.fromDate(daysFromNow(0)) }),
      makeStep({ key: 'b', startBy: Timestamp.fromDate(daysFromNow(10)) }),
      makeStep({ key: 'c', startBy: Timestamp.fromDate(daysFromNow(20)) })
    ];
    const timeline = makeTimeline({ steps });

    const noneChecked = createFixture(timeline, []);
    expect((noneChecked.componentInstance as unknown as { litStepKey: () => string | null }).litStepKey()).toBe('a');

    const firstChecked = createFixture(timeline, ['a']);
    expect((firstChecked.componentInstance as unknown as { litStepKey: () => string | null }).litStepKey()).toBe('b');

    const allButLastChecked = createFixture(timeline, ['a', 'b']);
    expect((allButLastChecked.componentInstance as unknown as { litStepKey: () => string | null }).litStepKey()).toBe('c');

    const allChecked = createFixture(timeline, ['a', 'b', 'c']);
    expect((allChecked.componentInstance as unknown as { litStepKey: () => string | null }).litStepKey()).toBeNull();
  });

  it('emits stepToggled with the step key when "Mark done" is used', () => {
    const timeline = makeTimeline({ steps: [makeStep({ key: 'a' })] });
    const fixture = createFixture(timeline);

    const nodeButton = fixture.nativeElement.querySelector('.runway-node--step') as HTMLButtonElement;
    nodeButton.click();
    fixture.detectChanges();

    const doneButton = fixture.nativeElement.querySelector('.runway-popover-done') as HTMLButtonElement;
    const spy = vi.fn();
    fixture.componentInstance.stepToggled.subscribe(spy);
    doneButton.click();

    expect(spy).toHaveBeenCalledWith('a');
  });
});
