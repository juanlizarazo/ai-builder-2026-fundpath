import { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { RegistrationTimelineHelper } from './registration-timeline.helper';

const isWeekend = (date: Date): boolean => {
  const day = date.getDay();

  return day === 0 || day === 6;
};

/** Business-day-forward date helper for building test fixtures (mirrors the helper's own logic). */
const addBusinessDays = (date: Date, businessDays: number): Date => {
  const result = new Date(date.getTime());
  let remaining = businessDays;

  while (remaining > 0) {
    result.setDate(result.getDate() + 1);

    if (!isWeekend(result)) {
      remaining--;
    }
  }

  return result;
};

const businessDaysBetween = (start: Date, end: Date): number => {
  const cursor = new Date(start.getTime());
  let count = 0;

  while (cursor.getTime() !== end.getTime()) {
    cursor.setDate(cursor.getDate() + 1);

    if (!isWeekend(cursor)) {
      count++;
    }
  }

  return count;
};

// A fixed "now" — Monday, so business-day math in the tests is deterministic.
const NOW = new Date(2026, 7, 10); // 2026-08-10 is a Monday

describe('RegistrationTimelineHelper — deadline mode', () => {
  it('sums step durations to exactly the business days between the first startBy and submitBy', () => {
    // ~8 weeks out, SBIR opportunity with an ALN that resolves to an agency portal.
    const closeDate = Timestamp.fromDate(addBusinessDays(NOW, 40));
    const timeline = RegistrationTimelineHelper.build({
      closeDate,
      isSbir: true,
      aln: '93.859',
      now: NOW,
    });

    const totalDuration = timeline.steps.reduce((sum, step) => sum + step.durationBusinessDays, 0);
    const firstStep = timeline.steps[0];
    const spanned = businessDaysBetween(firstStep.startBy.toDate(), timeline.submitBy!.toDate());

    expect(spanned).toBe(totalDuration);
  });

  it('never lands a startBy or completeBy on a weekend', () => {
    const closeDate = Timestamp.fromDate(addBusinessDays(NOW, 40));
    const timeline = RegistrationTimelineHelper.build({
      closeDate,
      isSbir: true,
      aln: '93.859',
      now: NOW,
    });

    for (const step of timeline.steps) {
      expect(isWeekend(step.startBy.toDate())).toBe(false);
      expect(isWeekend(step.completeBy.toDate())).toBe(false);
    }

    expect(isWeekend(timeline.submitBy!.toDate())).toBe(false);
  });

  it('keeps submitBy on or before closeDate', () => {
    const closeDateDate = addBusinessDays(NOW, 40);
    const closeDate = Timestamp.fromDate(closeDateDate);
    const timeline = RegistrationTimelineHelper.build({
      closeDate,
      isSbir: true,
      aln: '12.910',
      now: NOW,
    });

    expect(timeline.submitBy!.toDate().getTime()).toBeLessThanOrEqual(closeDateDate.getTime());
    expect(timeline.mode).toBe('deadline');
  });

  it('flips feasible to false when the close date is inside the required lead time', () => {
    // Only 5 business days until close — nowhere near enough for the ~28-31 bd chain.
    const closeDate = Timestamp.fromDate(addBusinessDays(NOW, 5));
    const timeline = RegistrationTimelineHelper.build({
      closeDate,
      isSbir: true,
      aln: '93.859',
      now: NOW,
    });

    expect(timeline.feasible).toBe(false);
    expect(timeline.headline).toMatch(/cannot make this deadline/i);
  });

  it('stays feasible when there is ample runway before close', () => {
    const closeDate = Timestamp.fromDate(addBusinessDays(NOW, 60));
    const timeline = RegistrationTimelineHelper.build({
      closeDate,
      isSbir: false,
      now: NOW,
    });

    expect(timeline.feasible).toBe(true);
    expect(timeline.headline).toMatch(/Start SAM\.gov registration by/);
  });

  it('omits the SBA Company Registry step when neither isSbir nor isSttr is set', () => {
    const closeDate = Timestamp.fromDate(addBusinessDays(NOW, 40));
    const timeline = RegistrationTimelineHelper.build({ closeDate, now: NOW });

    expect(timeline.steps.some(step => step.key === 'sba-company-registry')).toBe(false);
  });

  it('includes the SBA Company Registry step when isSttr is set', () => {
    const closeDate = Timestamp.fromDate(addBusinessDays(NOW, 40));
    const timeline = RegistrationTimelineHelper.build({ closeDate, isSttr: true, now: NOW });

    expect(timeline.steps.some(step => step.key === 'sba-company-registry')).toBe(true);
  });

  it('resolves the agency portal from the ALN prefix and omits it for Grants.gov-only prefixes', () => {
    const closeDate = Timestamp.fromDate(addBusinessDays(NOW, 40));
    const withPortal = RegistrationTimelineHelper.build({ closeDate, aln: '47.050', now: NOW });
    const grantsGovOnly = RegistrationTimelineHelper.build({ closeDate, aln: '66.032', now: NOW });

    expect(withPortal.steps.find(step => step.key === 'agency-portal')?.system).toBe('Research.gov');
    expect(grantsGovOnly.steps.some(step => step.key === 'agency-portal')).toBe(false);
  });
});

describe('RegistrationTimelineHelper — earliest-ready mode', () => {
  it('computes forward from today when there is no close date', () => {
    const timeline = RegistrationTimelineHelper.build({ isSbir: true, aln: '93.859', now: NOW });

    expect(timeline.mode).toBe('earliest-ready');
    expect(timeline.feasible).toBe(true);
    expect(timeline.closeDate).toBeUndefined();
    expect(timeline.headline).toMatch(/You could be submission-ready by/);
  });

  it('never lands a startBy or completeBy on a weekend', () => {
    const timeline = RegistrationTimelineHelper.build({ isSbir: true, aln: '81.121', now: NOW });

    for (const step of timeline.steps) {
      expect(isWeekend(step.startBy.toDate())).toBe(false);
      expect(isWeekend(step.completeBy.toDate())).toBe(false);
    }
  });
});
