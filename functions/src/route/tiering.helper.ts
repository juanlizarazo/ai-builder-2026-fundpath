import { FitTier } from '../firestore';
import { TIER_DEFAULTS, TIER_LABELS, TIER_ORDER, TIER_SCORE_WEIGHTS } from './eligibility.constants';

export class TieringHelper {
  public static compare(first: FitTier, second: FitTier): number {
    return TIER_ORDER[first] - TIER_ORDER[second];
  }

  public static isBetterThan(first: FitTier, second: FitTier): boolean {
    return TieringHelper.compare(first, second) < 0;
  }

  public static isAtLeast(tier: FitTier, minimum: FitTier): boolean {
    return TieringHelper.compare(tier, minimum) <= 0;
  }

  public static worst(tiers: FitTier[]): FitTier {
    if (tiers.length === 0) {
      return TIER_DEFAULTS.emptyReduction;
    }

    return tiers.reduce((lowest, candidate) => (TieringHelper.compare(candidate, lowest) > 0 ? candidate : lowest), tiers[0]);
  }

  public static best(tiers: FitTier[]): FitTier {
    if (tiers.length === 0) {
      return TIER_DEFAULTS.emptyReduction;
    }

    return tiers.reduce((highest, candidate) => (TieringHelper.compare(candidate, highest) < 0 ? candidate : highest), tiers[0]);
  }

  public static reduceCeilings(ceilings: FitTier[]): FitTier {
    return TieringHelper.worst(ceilings);
  }

  public static label(tier: FitTier): string {
    return TIER_LABELS[tier];
  }

  public static weight(tier: FitTier): number {
    return TIER_SCORE_WEIGHTS[tier];
  }

  public static sortBestFirst(tiers: FitTier[]): FitTier[] {
    return [...tiers].sort(TieringHelper.compare);
  }
}
