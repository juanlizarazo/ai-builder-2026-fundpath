import { FitTier } from '../firestore';

export interface IStopExplanation {
  stopId: string;
  whyFit: string;
  whyIneligible: string;
  whatToVerify: string;
  whatToDoNext: string;
}

export interface IExplanationFlagPayload {
  code: string;
  severity: 'block' | 'warn' | 'info';
  message: string;
}

export interface IExplanationStopPayload {
  stopId: string;
  title: string;
  agency: string;
  aln?: string;
  minAward?: number;
  maxAward?: number;
  fitTier: FitTier;
  fitTierLabel: string;
  isSbir: boolean;
  isSttr: boolean;
  isFederalProgram: boolean;
  needsSamRegistrationTip: boolean;
  eligibilityFlags: IExplanationFlagPayload[];
}

export interface IExplanationProfilePayload {
  industry: string;
  technologyKeywords: string[];
  location: { state: string; county?: string; city?: string };
  employees: number;
  revenueArr?: number;
  stage?: string;
  capitalRaised?: number;
  askMin?: number;
  askMax?: number;
  useOfFunds?: string;
  hasRdCore: boolean;
  targetCustomer?: string;
  productMaturity?: string;
  ownershipSignals: string[];
  hasExistingFederalRegistration: boolean;
}

export interface IExplanationRequestPayload {
  profile: IExplanationProfilePayload;
  stops: IExplanationStopPayload[];
}
