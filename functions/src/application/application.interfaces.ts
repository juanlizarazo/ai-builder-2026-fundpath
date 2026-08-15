import { IApplicantDetails, INarrativeStarter } from '../firestore';

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

/**
 * Everything `SF424Helper.fill` draws onto the bundled SF-424 base PDF: the
 * founder-supplied applicant details (Stage 1's `IApplicantDetails`) plus the
 * fields that come from the opportunity/stop rather than the founder.
 *
 * Deliberately has no EIN/TIN (8b) or UEI (8c) — FundPath never collects them,
 * so those boxes stay blank on the generated form.
 */
export interface ISf424FillValues extends IApplicantDetails {
  /** Field 11 Assistance Listing Number (ALN/CFDA), e.g. `93.859`. */
  alnNumber?: string;
  /** Field 11 Assistance Listing Title. */
  alnTitle?: string;
  /** Field 12 Funding Opportunity Number. */
  fundingOpportunityNumber?: string;
  /** Field 12 Title. */
  fundingOpportunityTitle?: string;
  /** Field 9 Type of Applicant 1. Defaults to 'Small Business'. */
  applicantType?: string;
  /** Field 1. This product only ever produces a fresh application. */
  typeOfSubmission: 'Application';
  /** Field 2. Same reasoning — always a new application. */
  typeOfApplication: 'New';
}
