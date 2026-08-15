import { FitTier, IOpportunity, IStartupProfile } from '../firestore';
import { PROGRAM_FIT_SCORES, SCORE_WEIGHTS, SCORING_DEFAULTS, VERTICAL_FIT_WEIGHTS } from './eligibility.constants';
import { EligibilityRulesHelper } from './eligibility.rules';
import { ICandidate, IExpansion, IScoreBreakdown } from './route.interfaces';
import { TieringHelper } from './tiering.helper';
import { RetrievalService } from './retrieval.service';

const MILLISECONDS_PER_DAY = 86400000;

export class ScoringHelper {
  public static score(
    profile: IStartupProfile,
    opportunity: IOpportunity,
    expansion: IExpansion,
    historicalDensity: number,
    now: Date = new Date(),
    tier?: FitTier,
  ): { score: number; breakdown: IScoreBreakdown } {
    const resolvedTier = tier ?? EligibilityRulesHelper.evaluate(profile, opportunity).tier;
    const breakdown: IScoreBreakdown = {
      verticalFit: ScoringHelper.verticalFit(opportunity, expansion),
      awardBandOverlap: ScoringHelper.awardBandOverlap(profile, opportunity),
      deadlineProximity: ScoringHelper.deadlineProximity(opportunity, now),
      historicalDensity: ScoringHelper.historicalDensity(historicalDensity),
      tierWeight: TieringHelper.weight(resolvedTier),
      programFit: ScoringHelper.programFit(profile, opportunity),
    };
    const weighted =
      breakdown.verticalFit * SCORE_WEIGHTS.verticalFit +
      breakdown.awardBandOverlap * SCORE_WEIGHTS.awardBandOverlap +
      breakdown.deadlineProximity * SCORE_WEIGHTS.deadlineProximity +
      breakdown.historicalDensity * SCORE_WEIGHTS.historicalDensity +
      breakdown.tierWeight * SCORE_WEIGHTS.tierWeight +
      breakdown.programFit * SCORE_WEIGHTS.programFit;

    return { score: ScoringHelper.round(weighted), breakdown };
  }

  public static verticalFit(opportunity: IOpportunity, expansion: IExpansion): number {
    const naicsPart = ScoringHelper.overlapRatio(expansion.naicsCodes, opportunity.naicsCodes ?? []);
    const haystack = [opportunity.title, opportunity.description, ...(opportunity.keywords ?? [])].join(' ').toLowerCase();
    const keywordPart =
      expansion.keywords.length === 0
        ? SCORING_DEFAULTS.neutralSubScore
        : ScoringHelper.clamp(
            expansion.keywords.filter((keyword) => RetrievalService.matchesKeyword(haystack, keyword)).length /
              Math.min(expansion.keywords.length, SCORING_DEFAULTS.keywordHitSaturation),
          );
    const agencyPart = ScoringHelper.agencyPrefixMatch(opportunity, expansion) ? 1 : 0;

    return ScoringHelper.round(
      naicsPart * VERTICAL_FIT_WEIGHTS.naics + keywordPart * VERTICAL_FIT_WEIGHTS.keywords + agencyPart * VERTICAL_FIT_WEIGHTS.agency,
    );
  }

  public static awardBandOverlap(profile: IStartupProfile, opportunity: IOpportunity): number {
    const opportunityFloor = EligibilityRulesHelper.readAmount(opportunity.minAward);
    const opportunityCeiling = EligibilityRulesHelper.readAmount(opportunity.maxAward);
    const askFloor = EligibilityRulesHelper.readAmount(profile.askMin);
    const askCeiling = EligibilityRulesHelper.readAmount(profile.askMax);

    if ((opportunityFloor === null && opportunityCeiling === null) || (askFloor === null && askCeiling === null)) {
      return SCORING_DEFAULTS.neutralSubScore;
    }

    const bandLow = opportunityFloor ?? 0;
    const bandHigh = opportunityCeiling ?? Number.MAX_SAFE_INTEGER;
    const askLow = askFloor ?? askCeiling ?? 0;
    const askHigh = askCeiling ?? askFloor ?? 0;
    const overlap = Math.min(bandHigh, askHigh) - Math.max(bandLow, askLow);

    if (askHigh === askLow) {
      return askLow >= bandLow && askLow <= bandHigh ? 1 : 0;
    }

    if (overlap > 0) {
      return ScoringHelper.round(ScoringHelper.clamp(overlap / (askHigh - askLow)));
    }

    if (opportunityCeiling !== null && bandHigh < askLow) {
      return ScoringHelper.round(ScoringHelper.clamp((bandHigh / askLow) * SCORING_DEFAULTS.partialBandCredit));
    }

    return 0;
  }

  public static deadlineProximity(opportunity: IOpportunity, now: Date = new Date()): number {
    const closeDate = opportunity.closeDate?.toDate();

    if (!closeDate) {
      return SCORING_DEFAULTS.missingDeadlineScore;
    }

    const daysRemaining = (closeDate.getTime() - now.getTime()) / MILLISECONDS_PER_DAY;

    if (daysRemaining < 0) {
      return 0;
    }

    if (daysRemaining < SCORING_DEFAULTS.minimumLeadDays) {
      return SCORING_DEFAULTS.tightLeadScore;
    }

    const decayed = 1 - (daysRemaining - SCORING_DEFAULTS.minimumLeadDays) / SCORING_DEFAULTS.deadlineHorizonDays;

    return ScoringHelper.round(Math.max(SCORING_DEFAULTS.minimumDeadlineScore, ScoringHelper.clamp(decayed)));
  }

  public static programFit(profile: IStartupProfile, opportunity: IOpportunity): number {
    const isSbirFamily = Boolean(opportunity.isSbir || opportunity.isSttr);

    if (isSbirFamily) {
      return profile.hasRdCore
        ? PROGRAM_FIT_SCORES.sbirWithRdCore
        : PROGRAM_FIT_SCORES.sbirWithoutRdCore;
    }

    const isNonGrantInstrument =
      opportunity.placement === 'non-grant' ||
      opportunity.fundingInstrument === 'loan' ||
      opportunity.fundingInstrument === 'other';

    if (!profile.hasRdCore && isNonGrantInstrument) {
      return PROGRAM_FIT_SCORES.curatedNonGrantWithoutRdCore;
    }

    return PROGRAM_FIT_SCORES.neutral;
  }

  public static historicalDensity(density: number): number {
    if (!Number.isFinite(density) || density <= 0) {
      return 0;
    }

    return ScoringHelper.round(ScoringHelper.clamp(density / SCORING_DEFAULTS.historicalDensitySaturation));
  }

  public static rank(candidates: ICandidate[]): ICandidate[] {
    return [...candidates].sort((first, second) => {
      if (second.score !== first.score) {
        return second.score - first.score;
      }

      const tierDelta = TieringHelper.compare(first.tier, second.tier);

      if (tierDelta !== 0) {
        return tierDelta;
      }

      return first.opportunity.sourceId.localeCompare(second.opportunity.sourceId);
    });
  }

  private static agencyPrefixMatch(opportunity: IOpportunity, expansion: IExpansion): boolean {
    if (expansion.agencyPrefixes.length === 0) {
      return false;
    }

    const alns = [...(opportunity.alnAll ?? []), opportunity.aln ?? '', opportunity.agencyCode ?? ''].filter((value) => value.length > 0);

    return alns.some((value) => expansion.agencyPrefixes.includes(value.slice(0, 2)));
  }

  private static overlapRatio(expected: string[], actual: string[]): number {
    if (expected.length === 0 || actual.length === 0) {
      return SCORING_DEFAULTS.neutralSubScore;
    }

    const actualSet = new Set(actual);
    const matched = expected.filter((value) => actualSet.has(value)).length;

    return ScoringHelper.clamp(matched / Math.min(expected.length, actual.length));
  }

  private static clamp(value: number): number {
    if (!Number.isFinite(value)) {
      return 0;
    }

    return Math.min(1, Math.max(0, value));
  }

  private static round(value: number): number {
    const factor = Math.pow(10, SCORING_DEFAULTS.scorePrecision);

    return Math.round(value * factor) / factor;
  }
}
