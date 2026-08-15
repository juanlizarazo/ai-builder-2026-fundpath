import { describe, expect, it } from 'vitest';
import { FitTier } from '../firestore';
import { TieringHelper } from './tiering.helper';

const allTiers: FitTier[] = ['likely', 'potential', 'adjacent', 'probably-not'];

describe('TieringHelper — reduction', () => {
  it('reduces a list of ceilings to the worst one', () => {
    expect(TieringHelper.reduceCeilings(['likely', 'potential', 'adjacent'])).toBe('adjacent');
    expect(TieringHelper.reduceCeilings(['likely', 'likely'])).toBe('likely');
    expect(TieringHelper.reduceCeilings(['adjacent', 'probably-not', 'likely'])).toBe('probably-not');
    expect(TieringHelper.reduceCeilings(['potential', 'likely'])).toBe('potential');
  });

  it('is order independent', () => {
    expect(TieringHelper.reduceCeilings(['probably-not', 'likely', 'adjacent'])).toBe(
      TieringHelper.reduceCeilings(['adjacent', 'likely', 'probably-not']),
    );
  });

  it('degrades rather than approves when nothing was evaluated', () => {
    expect(TieringHelper.reduceCeilings([])).toBe('potential');
  });

  it('a single block ceiling wins over any number of green ceilings', () => {
    expect(TieringHelper.reduceCeilings(['likely', 'likely', 'likely', 'likely', 'probably-not'])).toBe('probably-not');
  });
});

describe('TieringHelper — comparison', () => {
  it('orders likely best and probably-not worst', () => {
    expect(TieringHelper.sortBestFirst(['probably-not', 'adjacent', 'likely', 'potential'])).toEqual([
      'likely',
      'potential',
      'adjacent',
      'probably-not',
    ]);
  });

  it('reports strictly better tiers', () => {
    expect(TieringHelper.isBetterThan('likely', 'potential')).toBe(true);
    expect(TieringHelper.isBetterThan('potential', 'likely')).toBe(false);
    expect(TieringHelper.isBetterThan('likely', 'likely')).toBe(false);
  });

  it('answers isAtLeast inclusively', () => {
    expect(TieringHelper.isAtLeast('potential', 'potential')).toBe(true);
    expect(TieringHelper.isAtLeast('likely', 'potential')).toBe(true);
    expect(TieringHelper.isAtLeast('adjacent', 'potential')).toBe(false);
  });

  it('selects the best tier from a list', () => {
    expect(TieringHelper.best(['adjacent', 'probably-not', 'potential'])).toBe('potential');
    expect(TieringHelper.best([])).toBe('potential');
  });
});

describe('TieringHelper — labels and weights', () => {
  it('has a founder-facing label for every tier', () => {
    for (const tier of allTiers) {
      expect(TieringHelper.label(tier).length).toBeGreaterThan(0);
    }
  });

  it('gives distinct labels per tier', () => {
    expect(new Set(allTiers.map((tier) => TieringHelper.label(tier))).size).toBe(allTiers.length);
  });

  it('weights tiers monotonically from likely down to probably-not', () => {
    const weights = allTiers.map((tier) => TieringHelper.weight(tier));

    for (let i = 1; i < weights.length; i += 1) {
      expect(weights[i]).toBeLessThan(weights[i - 1]);
    }

    expect(weights[0]).toBeLessThanOrEqual(1);
    expect(weights[weights.length - 1]).toBeGreaterThanOrEqual(0);
  });
});
