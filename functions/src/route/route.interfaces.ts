import { FitTier, IEligibilityFlag, IOpportunity, IStartupProfile } from '../firestore';

export interface IRuleResult {
  flags: IEligibilityFlag[];
  tierCeiling: FitTier;
}

export interface IEligibilityRule {
  code: string;
  evaluate(profile: IStartupProfile, opportunity: IOpportunity): IRuleResult | null;
}

export interface IEligibilityOutcome {
  tier: FitTier;
  flags: IEligibilityFlag[];
}

export interface IScoreBreakdown {
  verticalFit: number;
  awardBandOverlap: number;
  deadlineProximity: number;
  historicalDensity: number;
  tierWeight: number;
  programFit: number;
}

export interface ICandidate {
  opportunity: IOpportunity;
  tier: FitTier;
  flags: IEligibilityFlag[];
  score: number;
  breakdown: IScoreBreakdown;
}

export interface ISequencedCandidate {
  candidate: ICandidate;
  placement: 'primary' | 'alongside' | 'off-route' | 'non-grant';
  sequenceMonth?: number;
}

export interface IStackingPlan {
  askCovered: boolean;
  cumulativeCeiling: number;
  askTarget: number;
  note: string;
}

export interface IAbstentionVerdict {
  abstain: boolean;
  verdictLine: string;
  reason: string;
}

export interface IPipelineDrop {
  sourceId: string;
  title: string;
  stage: 'retrieve' | 'rules' | 'rank' | 'sequence' | 'explain';
  reason: string;
}

export interface IExpansion {
  verticalSlug: string;
  naicsCodes: string[];
  agencyPrefixes: string[];
  keywords: string[];
}
