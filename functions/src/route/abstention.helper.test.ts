import type { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { FitTier, IEligibilityFlag, IOpportunity } from '../firestore';
import { AbstentionHelper } from './abstention.helper';
import { FLAG_CODES } from './eligibility.constants';
import { ICandidate } from './route.interfaces';
import { SequencingHelper } from './sequencing.helper';

const stubTimestamp = { toDate: (): Date => new Date('2026-08-14T00:00:00Z'), toMillis: (): number => 1786060800000 } as unknown as Timestamp;

function buildCandidate(sourceId: string, tier: FitTier, flags: IEligibilityFlag[] = [], overrides: Partial<IOpportunity> = {}): ICandidate {
  return {
    opportunity: {
      source: 'sbir',
      sourceId,
      alnResolved: true,
      title: `${sourceId} Program`,
      description: 'Federal funding.',
      agency: 'Some Agency',
      status: 'posted',
      lastSyncedAt: stubTimestamp,
      ...overrides,
    },
    tier,
    flags,
    score: 0.5,
    breakdown: { verticalFit: 0, awardBandOverlap: 0, deadlineProximity: 0, historicalDensity: 0, tierWeight: 0, programFit: 0 },
  };
}

const noRdCoreFlag: IEligibilityFlag = { severity: 'block', code: FLAG_CODES.NO_RD_CORE, message: 'SBIR funds R&D.' };
const restrictedFlag: IEligibilityFlag = { severity: 'block', code: FLAG_CODES.APPLICANT_TYPE_INELIGIBLE, message: 'Restricted to states.' };

describe('AbstentionHelper — abstains when nothing survives to stops', () => {
  it('abstains on an empty candidate list', () => {
    const verdict = AbstentionHelper.decide([]);

    expect(verdict.abstain).toBe(true);
    expect(verdict.verdictLine).toMatch(/no strong federal grant match/i);
  });

  it('abstains when every candidate was ruled out (Case 5)', () => {
    const sequenced = SequencingHelper.sequence([
      buildCandidate('ED-IES-SBIR', 'probably-not', [noRdCoreFlag]),
      buildCandidate('DOL-WIOA', 'probably-not', [restrictedFlag]),
      buildCandidate('HHS-ACF', 'probably-not', [restrictedFlag]),
    ]);
    const verdict = AbstentionHelper.decide(sequenced);

    expect(SequencingHelper.stops(sequenced)).toHaveLength(0);
    expect(verdict.abstain).toBe(true);
    expect(verdict.verdictLine).toMatch(/no strong federal grant match/i);
    expect(verdict.reason.length).toBeGreaterThan(0);
  });

  it('abstains when only adjacent partner-required programs remain', () => {
    const sequenced = SequencingHelper.sequence([buildCandidate('WATERSMART', 'adjacent'), buildCandidate('WIOA', 'adjacent')]);
    const verdict = AbstentionHelper.decide(sequenced);

    expect(verdict.abstain).toBe(true);
    expect(verdict.verdictLine).toMatch(/no strong federal grant match/i);
  });

  it('cannot be talked out of abstaining by non-grant alternatives alone', () => {
    const sequenced = SequencingHelper.sequence([
      buildCandidate('SSBCI', 'likely', [], { source: 'utah', title: 'Utah SSBCI' }),
      buildCandidate('RULED-OUT', 'probably-not', [noRdCoreFlag]),
    ]);
    const verdict = AbstentionHelper.decide(sequenced);

    expect(verdict.abstain).toBe(true);
    expect(verdict.verdictLine).toMatch(/no strong federal grant match/i);
  });

  it('explains the dominant blocking reasons rather than a bare code', () => {
    const sequenced = SequencingHelper.sequence([
      buildCandidate('A', 'probably-not', [restrictedFlag]),
      buildCandidate('B', 'probably-not', [noRdCoreFlag]),
    ]);
    const verdict = AbstentionHelper.decide(sequenced);

    expect(verdict.reason).not.toContain(FLAG_CODES.NO_RD_CORE);
    expect(verdict.reason).not.toContain(FLAG_CODES.APPLICANT_TYPE_INELIGIBLE);
    expect(verdict.reason.length).toBeGreaterThan(80);
  });
});

describe('AbstentionHelper — commits when a route exists', () => {
  it('does not abstain when a primary stop survives', () => {
    const sequenced = SequencingHelper.sequence([buildCandidate('NIH-SBIR', 'likely'), buildCandidate('OUT', 'probably-not', [noRdCoreFlag])]);
    const verdict = AbstentionHelper.decide(sequenced);

    expect(verdict.abstain).toBe(false);
    expect(verdict.verdictLine).not.toMatch(/no strong federal grant match/i);
    expect(verdict.verdictLine).toContain('NIH-SBIR Program');
  });

  it('does not abstain when an adjacent stop rides alongside a real primary', () => {
    const sequenced = SequencingHelper.sequence([buildCandidate('NSF-SBIR', 'likely'), buildCandidate('WATERSMART', 'adjacent')]);
    const verdict = AbstentionHelper.decide(sequenced);

    expect(SequencingHelper.stops(sequenced)).toHaveLength(2);
    expect(verdict.abstain).toBe(false);
  });

  it('is deterministic for identical input', () => {
    const sequenced = SequencingHelper.sequence([buildCandidate('A', 'likely'), buildCandidate('B', 'potential')]);

    expect(AbstentionHelper.decide(sequenced)).toEqual(AbstentionHelper.decide(sequenced));
  });

  it('always returns every frozen verdict field', () => {
    const verdict = AbstentionHelper.decide(SequencingHelper.sequence([buildCandidate('A', 'likely')]));

    expect(typeof verdict.abstain).toBe('boolean');
    expect(verdict.verdictLine.length).toBeGreaterThan(0);
    expect(verdict.reason.length).toBeGreaterThan(0);
  });
});
