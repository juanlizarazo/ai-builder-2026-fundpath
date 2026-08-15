import type { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { FitTier, IOpportunity, IStartupProfile } from '../firestore';
import { ICandidate } from './route.interfaces';
import { SequencingHelper } from './sequencing.helper';
import { StackingHelper } from './stacking.helper';

const stubTimestamp = { toDate: (): Date => new Date('2026-08-14T00:00:00Z'), toMillis: (): number => 1786060800000 } as unknown as Timestamp;

function buildProfile(overrides: Partial<IStartupProfile> = {}): IStartupProfile {
  return {
    uid: 'user-1',
    rawDescription: 'A Utah startup.',
    industry: 'aerospace',
    technologyKeywords: ['composites'],
    location: { state: 'UT' },
    employees: 35,
    hasRdCore: true,
    askMin: 2000000,
    askMax: 5000000,
    createdAt: stubTimestamp,
    updatedAt: stubTimestamp,
    ...overrides,
  };
}

function buildCandidate(sourceId: string, title: string, maxAward: number | undefined, tier: FitTier = 'likely', overrides: Partial<IOpportunity> = {}): ICandidate {
  return {
    opportunity: {
      source: 'sbir',
      sourceId,
      alnResolved: true,
      title,
      description: 'Research and development funding.',
      agency: 'Some Agency',
      status: 'posted',
      maxAward,
      lastSyncedAt: stubTimestamp,
      ...overrides,
    },
    tier,
    flags: [],
    score: 0.5,
    breakdown: { verticalFit: 0, awardBandOverlap: 0, deadlineProximity: 0, historicalDensity: 0, tierWeight: 0, programFit: 0 },
  };
}

describe('StackingHelper — Case 2, a $2-5M ask against SBIR ceilings', () => {
  const sequenced = SequencingHelper.sequence([
    buildCandidate('NASA-PII', 'NASA SBIR Phase II', 850000),
    buildCandidate('AFWERX-D2P2', 'AFWERX Direct to Phase II', 1250000, 'likely', { programPhase: 'D2P2' }),
    buildCandidate('STRATFI', 'AFWERX STRATFI Bridge', 3000000),
  ]);

  it('reports the cumulative ceiling across the mapped stops', () => {
    const plan = StackingHelper.plan(buildProfile(), sequenced);

    expect(plan.cumulativeCeiling).toBe(850000 + 1250000 + 3000000);
    expect(plan.askTarget).toBe(5000000);
  });

  it('marks the ask covered only by the combination, and says so', () => {
    const plan = StackingHelper.plan(buildProfile(), sequenced);

    expect(plan.askCovered).toBe(true);
    expect(plan.note).toMatch(/no single award covers/i);
  });

  it('does not claim stacking is needed when one award already covers the ask', () => {
    const plan = StackingHelper.plan(buildProfile({ askMin: 100000, askMax: 500000 }), sequenced);

    expect(plan.askCovered).toBe(true);
    expect(plan.note).not.toMatch(/no single award covers/i);
  });

  it('reports honestly when even the stack falls short', () => {
    const thin = SequencingHelper.sequence([buildCandidate('NSF-PI', 'NSF SBIR Phase I', 305000)]);
    const plan = StackingHelper.plan(buildProfile(), thin);

    expect(plan.askCovered).toBe(false);
    expect(plan.cumulativeCeiling).toBe(305000);
    expect(plan.note).toMatch(/no single award covers/i);
  });
});

describe('StackingHelper — missing data', () => {
  it('treats a zero maxAward as missing rather than a $0 ceiling', () => {
    const sequenced = SequencingHelper.sequence([buildCandidate('ZERO', 'Ceiling Unpublished Program', 0)]);
    const plan = StackingHelper.plan(buildProfile(), sequenced);

    expect(plan.cumulativeCeiling).toBe(0);
    expect(plan.askCovered).toBe(false);
  });

  it('does not claim coverage when the profile states no ask', () => {
    const sequenced = SequencingHelper.sequence([buildCandidate('NASA-PII', 'NASA SBIR Phase II', 850000)]);
    const plan = StackingHelper.plan(buildProfile({ askMin: undefined, askMax: undefined }), sequenced);

    expect(plan.askTarget).toBe(0);
    expect(plan.askCovered).toBe(false);
  });

  it('falls back to askMin when only a floor is stated', () => {
    expect(StackingHelper.askTarget(buildProfile({ askMin: 750000, askMax: undefined }))).toBe(750000);
    expect(StackingHelper.askTarget(buildProfile({ askMin: 0, askMax: 0 }))).toBe(0);
  });
});

describe('StackingHelper — scope', () => {
  it('only counts route stops, ignoring off-route and non-grant entries', () => {
    const sequenced = SequencingHelper.sequence([
      buildCandidate('PRIMARY', 'NSF SBIR Phase I', 305000),
      buildCandidate('OFF', 'A Program We Ruled Out', 9000000, 'probably-not'),
      buildCandidate('LOAN', 'SBA 7(a) Loan Guarantee', 5000000, 'likely', { source: 'utah' }),
    ]);
    const plan = StackingHelper.plan(buildProfile(), sequenced);

    expect(plan.cumulativeCeiling).toBe(305000);
  });

  it('is deterministic for identical input', () => {
    const sequenced = SequencingHelper.sequence([buildCandidate('A', 'Program A', 500000), buildCandidate('B', 'Program B', 800000)]);

    expect(StackingHelper.plan(buildProfile(), sequenced)).toEqual(StackingHelper.plan(buildProfile(), sequenced));
  });

  it('returns a plan with all frozen fields populated when there are no stops', () => {
    const plan = StackingHelper.plan(buildProfile(), []);

    expect(plan.askCovered).toBe(false);
    expect(plan.cumulativeCeiling).toBe(0);
    expect(plan.askTarget).toBe(5000000);
    expect(plan.note.length).toBeGreaterThan(0);
  });
});
