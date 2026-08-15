import { INarrativeStarter } from '../firestore';

export type NarrativeSection = INarrativeStarter['section'];

/** Gating inputs for the deterministic documents-checklist resolver. */
export interface IDocumentResolverInput {
  isSbir?: boolean;
  isSttr?: boolean;
  programPhase?: 'I' | 'II' | 'D2P2';
}

export interface INarrativeProfilePayload {
  industry: string;
  technologyKeywords: string[];
  stage?: string;
  targetCustomer?: string;
  productMaturity?: string;
  useOfFunds?: string;
}

export interface INarrativeFlagPayload {
  code: string;
  severity: 'block' | 'warn' | 'info';
  message: string;
}

export interface INarrativeStopPayload {
  title: string;
  agency: string;
  whyFit?: string;
  isSbir: boolean;
  isSttr: boolean;
  eligibilityFlags: INarrativeFlagPayload[];
}

export interface INarrativeRequestPayload {
  profile: INarrativeProfilePayload;
  stop: INarrativeStopPayload;
  solicitationDescription?: string;
}
