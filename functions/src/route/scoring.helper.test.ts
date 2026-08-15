import type { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { IOpportunity, IStartupProfile } from '../firestore';
import { ICandidate, IExpansion, IScoreBreakdown } from './route.interfaces';
import { ScoringHelper } from './scoring.helper';

const NOW = new Date('2026-08-14T00:00:00Z');

function timestampOf(date: Date): Timestamp {
  return { toDate: (): Date => date, toMillis: (): number => date.getTime() } as unknown as Timestamp;
}

function daysFromNow(days: number): Timestamp {
  return timestampOf(new Date(NOW.getTime() + days * 86400000));
}

function buildProfile(overrides: Partial<IStartupProfile> = {}): IStartupProfile {
  return {
    uid: 'user-1',
    rawDescription: 'A Utah startup.',
    industry: 'health-it',
    technologyKeywords: ['ai'],
    location: { state: 'UT' },
    employees: 15,
    hasRdCore: true,
    askMin: 500000,
    askMax: 2000000,
    createdAt: timestampOf(NOW),
    updatedAt: timestampOf(NOW),
    ...overrides,
  };
}

function buildOpportunity(overrides: Partial<IOpportunity> = {}): IOpportunity {
  return {
    source: 'sbir',
    sourceId: 'OPP-1',
    aln: '93.855',
    alnResolved: true,
    title: 'NIH SBIR Omnibus Solicitation',
    description: 'Small business innovation research in health informatics and clinical workflow.',
    agency: 'National Institutes of Health',
    agencyCode: '93',
    isSbir: true,
    naicsCodes: ['541511', '541512'],
    minAward: 500000,
    maxAward: 2000000,
    closeDate: daysFromNow(60),
    status: 'posted',
    lastSyncedAt: timestampOf(NOW),
    ...overrides,
  };
}

const expansion: IExpansion = {
  verticalSlug: 'health-it',
  naicsCodes: ['541511', '541512', '513210', '334510'],
  agencyPrefixes: ['93', '47'],
  keywords: ['health informatics', 'clinical workflow', 'nurse'],
};

function buildCandidate(sourceId: string, score: number, overrides: Partial<ICandidate> = {}): ICandidate {
  const breakdown: IScoreBreakdown = { verticalFit: 0, awardBandOverlap: 0, deadlineProximity: 0, historicalDensity: 0, tierWeight: 0, programFit: 0 };

  return {
    opportunity: buildOpportunity({ sourceId }),
    tier: 'likely',
    flags: [],
    score,
    breakdown,
    ...overrides,
  };
}

describe('ScoringHelper — breakdown shape', () => {
  it('returns every frozen breakdown field normalized to 0..1', () => {
    const result = ScoringHelper.score(buildProfile(), buildOpportunity(), expansion, 4, NOW);
    const keys: (keyof IScoreBreakdown)[] = ['verticalFit', 'awardBandOverlap', 'deadlineProximity', 'historicalDensity', 'tierWeight', 'programFit'];

    for (const key of keys) {
      expect(result.breakdown[key], key).toBeGreaterThanOrEqual(0);
      expect(result.breakdown[key], key).toBeLessThanOrEqual(1);
    }

    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it('is deterministic for identical inputs', () => {
    const first = ScoringHelper.score(buildProfile(), buildOpportunity(), expansion, 4, NOW);
    const second = ScoringHelper.score(buildProfile(), buildOpportunity(), expansion, 4, NOW);

    expect(first).toEqual(second);
  });

  it('scores a worse tier below a better tier, all else equal', () => {
    const strong = ScoringHelper.score(buildProfile(), buildOpportunity(), expansion, 4, NOW, 'likely');
    const weak = ScoringHelper.score(buildProfile(), buildOpportunity(), expansion, 4, NOW, 'probably-not');

    expect(strong.score).toBeGreaterThan(weak.score);
  });
});

describe('ScoringHelper — vertical fit', () => {
  it('rewards NAICS and keyword overlap', () => {
    const aligned = ScoringHelper.verticalFit(buildOpportunity(), expansion);
    const unrelated = ScoringHelper.verticalFit(
      buildOpportunity({ naicsCodes: ['111110'], title: 'Rural Irrigation Formula Grant', description: 'Water delivery to farms.', aln: '10.001', agencyCode: '10' }),
      expansion,
    );

    expect(aligned).toBeGreaterThan(unrelated);
  });

  it('returns a neutral naics component when the opportunity lists no NAICS codes', () => {
    const withoutNaics = ScoringHelper.verticalFit(buildOpportunity({ naicsCodes: [] }), expansion);

    expect(withoutNaics).toBeGreaterThan(0);
    expect(withoutNaics).toBeLessThanOrEqual(1);
  });

  it('adds credit for a matching agency prefix', () => {
    const matching = ScoringHelper.verticalFit(buildOpportunity(), expansion);
    const nonMatching = ScoringHelper.verticalFit(buildOpportunity({ aln: '81.049', agencyCode: '81' }), expansion);

    expect(matching).toBeGreaterThan(nonMatching);
  });
});

describe('ScoringHelper — award band overlap', () => {
  it('scores a perfectly matched band at 1', () => {
    expect(ScoringHelper.awardBandOverlap(buildProfile({ askMin: 500000, askMax: 2000000 }), buildOpportunity())).toBe(1);
  });

  it('scores a partial overlap between 0 and 1', () => {
    const value = ScoringHelper.awardBandOverlap(buildProfile({ askMin: 1000000, askMax: 3000000 }), buildOpportunity());

    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(1);
  });

  it('treats a zero maxAward as missing rather than a $0 ceiling', () => {
    const zeroed = ScoringHelper.awardBandOverlap(buildProfile(), buildOpportunity({ minAward: 0, maxAward: 0 }));
    const absent = ScoringHelper.awardBandOverlap(buildProfile(), buildOpportunity({ minAward: undefined, maxAward: undefined }));

    expect(zeroed).toBe(absent);
    expect(zeroed).toBe(0.5);
  });

  it('gives partial credit when the ceiling sits below the ask, because awards stack', () => {
    const value = ScoringHelper.awardBandOverlap(
      buildProfile({ askMin: 2000000, askMax: 5000000 }),
      buildOpportunity({ minAward: 150000, maxAward: 1000000 }),
    );

    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(0.5);
  });

  it('returns neutral when the profile states no ask', () => {
    expect(ScoringHelper.awardBandOverlap(buildProfile({ askMin: undefined, askMax: undefined }), buildOpportunity())).toBe(0.5);
  });
});

describe('ScoringHelper — deadline proximity', () => {
  it('scores a closed opportunity at zero', () => {
    expect(ScoringHelper.deadlineProximity(buildOpportunity({ closeDate: daysFromNow(-1) }), NOW)).toBe(0);
  });

  it('penalizes a deadline inside the registration lead time', () => {
    const tight = ScoringHelper.deadlineProximity(buildOpportunity({ closeDate: daysFromNow(10) }), NOW);
    const comfortable = ScoringHelper.deadlineProximity(buildOpportunity({ closeDate: daysFromNow(60) }), NOW);

    expect(tight).toBeLessThan(comfortable);
  });

  it('prefers a nearer usable deadline over a distant one', () => {
    const near = ScoringHelper.deadlineProximity(buildOpportunity({ closeDate: daysFromNow(45) }), NOW);
    const far = ScoringHelper.deadlineProximity(buildOpportunity({ closeDate: daysFromNow(300) }), NOW);

    expect(near).toBeGreaterThan(far);
  });

  it('takes now as an explicit parameter so results are pinnable', () => {
    const opportunity = buildOpportunity({ closeDate: daysFromNow(60) });
    const later = new Date(NOW.getTime() + 30 * 86400000);

    expect(ScoringHelper.deadlineProximity(opportunity, NOW)).not.toBe(ScoringHelper.deadlineProximity(opportunity, later));
  });

  it('falls back to a neutral-low score when there is no close date', () => {
    expect(ScoringHelper.deadlineProximity(buildOpportunity({ closeDate: undefined }), NOW)).toBe(0.4);
  });
});

describe('ScoringHelper — historical density', () => {
  it('saturates at 1', () => {
    expect(ScoringHelper.historicalDensity(500)).toBe(1);
  });

  it('scores no history at zero and rises monotonically', () => {
    expect(ScoringHelper.historicalDensity(0)).toBe(0);
    expect(ScoringHelper.historicalDensity(2)).toBeLessThan(ScoringHelper.historicalDensity(6));
  });
});

describe('ScoringHelper — ranking', () => {
  it('orders by score descending', () => {
    const ranked = ScoringHelper.rank([buildCandidate('B', 0.4), buildCandidate('A', 0.9), buildCandidate('C', 0.6)]);

    expect(ranked.map((candidate) => candidate.opportunity.sourceId)).toEqual(['A', 'C', 'B']);
  });

  it('breaks ties on a stable key so ordering is reproducible', () => {
    const ranked = ScoringHelper.rank([buildCandidate('ZZZ', 0.5), buildCandidate('AAA', 0.5), buildCandidate('MMM', 0.5)]);

    expect(ranked.map((candidate) => candidate.opportunity.sourceId)).toEqual(['AAA', 'MMM', 'ZZZ']);
  });

  it('prefers the better tier before falling back to the stable key', () => {
    const ranked = ScoringHelper.rank([buildCandidate('ZZZ', 0.5, { tier: 'likely' }), buildCandidate('AAA', 0.5, { tier: 'adjacent' })]);

    expect(ranked.map((candidate) => candidate.opportunity.sourceId)).toEqual(['ZZZ', 'AAA']);
  });

  it('does not mutate the input array', () => {
    const input = [buildCandidate('B', 0.1), buildCandidate('A', 0.9)];

    ScoringHelper.rank(input);

    expect(input.map((candidate) => candidate.opportunity.sourceId)).toEqual(['B', 'A']);
  });

  it('produces the same ordering across repeated runs of shuffled input', () => {
    const first = ScoringHelper.rank([buildCandidate('A', 0.5), buildCandidate('B', 0.5), buildCandidate('C', 0.5)]);
    const second = ScoringHelper.rank([buildCandidate('C', 0.5), buildCandidate('B', 0.5), buildCandidate('A', 0.5)]);

    expect(first.map((candidate) => candidate.opportunity.sourceId)).toEqual(second.map((candidate) => candidate.opportunity.sourceId));
  });
});
