import type { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { FitTier, IOpportunity } from '../firestore';
import { ICandidate, ISequencedCandidate } from './route.interfaces';
import { SequencingHelper } from './sequencing.helper';

const stubTimestamp = { toDate: (): Date => new Date('2026-08-14T00:00:00Z'), toMillis: (): number => 1786060800000 } as unknown as Timestamp;

function buildOpportunity(overrides: Partial<IOpportunity> = {}): IOpportunity {
  return {
    source: 'sbir',
    sourceId: 'OPP-1',
    alnResolved: true,
    title: 'A Federal Program',
    description: 'Research and development funding.',
    agency: 'Some Agency',
    status: 'posted',
    lastSyncedAt: stubTimestamp,
    ...overrides,
  };
}

function buildCandidate(sourceId: string, tier: FitTier, opportunityOverrides: Partial<IOpportunity> = {}, score = 0.5): ICandidate {
  return {
    opportunity: buildOpportunity({ sourceId, ...opportunityOverrides }),
    tier,
    flags: [],
    score,
    breakdown: { verticalFit: 0, awardBandOverlap: 0, deadlineProximity: 0, historicalDensity: 0, tierWeight: 0, programFit: 0 },
  };
}

function placementOf(sequenced: ISequencedCandidate[], sourceId: string): string {
  const entry = sequenced.find((item) => item.candidate.opportunity.sourceId === sourceId);

  expect(entry, `expected ${sourceId} to be sequenced`).toBeDefined();

  return (entry as ISequencedCandidate).placement;
}

describe('SequencingHelper — placement', () => {
  it('routes probably-not candidates off-route, never primary', () => {
    const sequenced = SequencingHelper.sequence([
      buildCandidate('GOOD', 'likely'),
      buildCandidate('RULED-OUT', 'probably-not'),
    ]);

    expect(placementOf(sequenced, 'RULED-OUT')).toBe('off-route');
    expect(placementOf(sequenced, 'GOOD')).toBe('primary');
  });

  it('never makes an adjacent candidate a primary stop', () => {
    const sequenced = SequencingHelper.sequence([
      buildCandidate('WATERSMART', 'adjacent'),
      buildCandidate('NSF-SBIR', 'likely'),
    ]);

    expect(placementOf(sequenced, 'WATERSMART')).toBe('alongside');
    expect(placementOf(sequenced, 'NSF-SBIR')).toBe('primary');
  });

  it('caps the number of primary stops and puts the rest alongside', () => {
    const sequenced = SequencingHelper.sequence([
      buildCandidate('P1', 'likely'),
      buildCandidate('P2', 'likely'),
      buildCandidate('P3', 'likely'),
      buildCandidate('P4', 'likely'),
      buildCandidate('P5', 'potential'),
    ]);

    expect(sequenced.filter((entry) => entry.placement === 'primary')).toHaveLength(3);
    expect(placementOf(sequenced, 'P4')).toBe('alongside');
    expect(placementOf(sequenced, 'P5')).toBe('alongside');
  });

  it('separates non-grant alternatives from the route', () => {
    const sequenced = SequencingHelper.sequence([
      buildCandidate('SBIR', 'likely'),
      buildCandidate('SSBCI', 'likely', { source: 'utah', title: 'Utah SSBCI Loan Participation' }),
      buildCandidate('SBA-7A', 'likely', { title: 'SBA 7(a) Loan Guarantee', description: 'Working capital lending.' }),
    ]);

    expect(placementOf(sequenced, 'SSBCI')).toBe('non-grant');
    expect(placementOf(sequenced, 'SBA-7A')).toBe('non-grant');
    expect(SequencingHelper.stops(sequenced).map((entry) => entry.candidate.opportunity.sourceId)).toEqual(['SBIR']);
  });

  it('respects an explicit non-grant placement on the opportunity', () => {
    const sequenced = SequencingHelper.sequence([buildCandidate('X', 'likely', { placement: 'non-grant' })]);

    expect(placementOf(sequenced, 'X')).toBe('non-grant');
  });
});

describe('SequencingHelper — alongside stops must nest under a real primary month', () => {
  it('assigns every alongside a sequenceMonth that exactly equals some primary month', () => {
    const sequenced = SequencingHelper.sequence([
      buildCandidate('P1', 'likely'),
      buildCandidate('P2', 'likely'),
      buildCandidate('P3', 'likely'),
      buildCandidate('A1', 'adjacent'),
      buildCandidate('A2', 'potential'),
    ]);
    const primaryMonths = SequencingHelper.primaryMonths(sequenced);
    const alongsides = sequenced.filter((entry) => entry.placement === 'alongside');

    expect(alongsides.length).toBeGreaterThan(0);

    for (const alongside of alongsides) {
      expect(alongside.sequenceMonth).toBeDefined();
      expect(primaryMonths).toContain(alongside.sequenceMonth);
    }
  });

  it('corrects an orphaned alongside month rather than letting the stop vanish', () => {
    const orphaned: ISequencedCandidate[] = [
      { candidate: buildCandidate('P1', 'likely'), placement: 'primary', sequenceMonth: 1 },
      { candidate: buildCandidate('P2', 'likely'), placement: 'primary', sequenceMonth: 8 },
      { candidate: buildCandidate('ORPHAN', 'potential'), placement: 'alongside', sequenceMonth: 7 },
    ];
    const corrected = SequencingHelper.enforceAlongsideAlignment(orphaned);
    const alongside = corrected.find((entry) => entry.candidate.opportunity.sourceId === 'ORPHAN') as ISequencedCandidate;

    expect(alongside.sequenceMonth).toBe(8);
    expect(SequencingHelper.primaryMonths(corrected)).toContain(alongside.sequenceMonth);
  });

  it('clears the month when there is no primary to nest under', () => {
    const orphaned: ISequencedCandidate[] = [{ candidate: buildCandidate('ORPHAN', 'potential'), placement: 'alongside', sequenceMonth: 4 }];
    const corrected = SequencingHelper.enforceAlongsideAlignment(orphaned);

    expect(corrected[0].sequenceMonth).toBeUndefined();
  });

  it('demotes alongside stops to off-route when the route has no primary at all', () => {
    const sequenced = SequencingHelper.sequence([
      buildCandidate('WATERSMART', 'adjacent'),
      buildCandidate('WIOA', 'adjacent'),
      buildCandidate('SBIR-NO-RD', 'probably-not'),
    ]);

    expect(SequencingHelper.stops(sequenced)).toHaveLength(0);
    expect(placementOf(sequenced, 'WATERSMART')).toBe('off-route');
  });

  it('leaves primary and off-route entries untouched during alignment', () => {
    const input: ISequencedCandidate[] = [
      { candidate: buildCandidate('P1', 'likely'), placement: 'primary', sequenceMonth: 1 },
      { candidate: buildCandidate('OFF', 'probably-not'), placement: 'off-route' },
    ];

    expect(SequencingHelper.enforceAlongsideAlignment(input)).toEqual(input);
  });
});

describe('SequencingHelper — a 12 month story', () => {
  it('starts the first primary immediately and spaces the rest across the year', () => {
    const sequenced = SequencingHelper.sequence([
      buildCandidate('P1', 'likely'),
      buildCandidate('P2', 'likely'),
      buildCandidate('P3', 'likely'),
    ]);
    const months = SequencingHelper.primaryMonths(sequenced);

    expect(months[0]).toBe(1);
    expect(months).toEqual([...months].sort((first, second) => first - second));
    expect(new Set(months).size).toBe(months.length);
    expect(months[months.length - 1]).toBeLessThanOrEqual(12);
  });

  it('schedules a Phase II award later in the year than a Phase I', () => {
    const sequenced = SequencingHelper.sequence([
      buildCandidate('PHASE-I', 'likely', { programPhase: 'I' }),
      buildCandidate('PHASE-II', 'likely', { programPhase: 'II' }),
    ]);
    const phaseOne = sequenced.find((entry) => entry.candidate.opportunity.sourceId === 'PHASE-I') as ISequencedCandidate;
    const phaseTwo = sequenced.find((entry) => entry.candidate.opportunity.sourceId === 'PHASE-II') as ISequencedCandidate;

    expect(phaseTwo.sequenceMonth as number).toBeGreaterThan(phaseOne.sequenceMonth as number);
  });

  it('keeps every sequenced entry accounted for', () => {
    const input = [
      buildCandidate('A', 'likely'),
      buildCandidate('B', 'adjacent'),
      buildCandidate('C', 'probably-not'),
      buildCandidate('D', 'likely', { source: 'utah' }),
    ];
    const sequenced = SequencingHelper.sequence(input);

    expect(sequenced).toHaveLength(input.length);
    expect(new Set(sequenced.map((entry) => entry.candidate.opportunity.sourceId)).size).toBe(input.length);
  });

  it('is deterministic for identical input', () => {
    const input = [buildCandidate('A', 'likely'), buildCandidate('B', 'potential'), buildCandidate('C', 'adjacent')];

    expect(SequencingHelper.sequence(input)).toEqual(SequencingHelper.sequence(input));
  });
});
