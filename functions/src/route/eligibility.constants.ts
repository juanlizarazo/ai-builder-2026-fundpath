import { FitTier } from '../firestore';

export const FLAG_CODES = {
  REQUIRES_MUNICIPAL_PRIME: 'REQUIRES_MUNICIPAL_PRIME',
  APPLICANT_TYPE_INELIGIBLE: 'APPLICANT_TYPE_INELIGIBLE',
  APPLICANT_TYPE_UNKNOWN: 'APPLICANT_TYPE_UNKNOWN',
  APPLICANT_TYPE_OTHERS_SEE_TEXT: 'APPLICANT_TYPE_OTHERS_SEE_TEXT',
  SBIR_EMPLOYEE_LIMIT: 'SBIR_EMPLOYEE_LIMIT',
  SBIR_AFFILIATE_AGGREGATION: 'SBIR_AFFILIATE_AGGREGATION',
  US_OWNERSHIP_REQUIRED: 'US_OWNERSHIP_REQUIRED',
  MAJORITY_VC_RESTRICTED: 'MAJORITY_VC_RESTRICTED',
  STTR_RI_PARTNER_REQUIRED: 'STTR_RI_PARTNER_REQUIRED',
  SBIR_PI_EMPLOYMENT: 'SBIR_PI_EMPLOYMENT',
  NO_RD_CORE: 'NO_RD_CORE',
  ASK_ABOVE_SINGLE_AWARD_CEILING: 'ASK_ABOVE_SINGLE_AWARD_CEILING',
  COMMERCIAL_FRAMING_NEEDS_GOV_CUSTOMER: 'COMMERCIAL_FRAMING_NEEDS_GOV_CUSTOMER',
  REGISTRATION_LEAD_TIME: 'REGISTRATION_LEAD_TIME',
} as const;

export const TIER_CEILINGS = {
  LIKELY: 'likely',
  POTENTIAL: 'potential',
  ADJACENT: 'adjacent',
  PROBABLY_NOT: 'probably-not',
} as const;

export const TIER_ORDER: Record<FitTier, number> = {
  likely: 0,
  potential: 1,
  adjacent: 2,
  'probably-not': 3,
};

export const TIER_LABELS: Record<FitTier, string> = {
  likely: 'Likely Fit',
  potential: 'Potential Fit',
  adjacent: 'Adjacent — Needs a Prime Partner',
  'probably-not': 'Probably Not a Fit',
};

export const TIER_SCORE_WEIGHTS: Record<FitTier, number> = {
  likely: 1,
  potential: 0.7,
  adjacent: 0.4,
  'probably-not': 0.1,
};

export const TIER_DEFAULTS = {
  emptyReduction: 'potential' as FitTier,
};

export const STARTUP_ELIGIBLE_CODES = {
  codes: ['22', '23', '99'],
  othersSeeText: '25',
};

export const RESTRICTED_APPLICANT_CODES = {
  codes: ['00', '01', '02', '04', '05', '06', '07', '08', '11', '12', '13', '20', '21'],
};

export const APPLICANT_CODE_DESCRIPTIONS: Record<string, string> = {
  '00': 'State governments',
  '01': 'County governments',
  '02': 'City or township governments',
  '04': 'Special district governments',
  '05': 'Independent school districts',
  '06': 'Public and State-controlled institutions of higher education',
  '07': 'Federally recognized Native American tribal governments',
  '08': 'Public and Indian housing authorities',
  '11': 'Native American tribal organizations (other than Federally recognized)',
  '12': 'Nonprofits having 501(c)(3) status',
  '13': 'Nonprofits without 501(c)(3) status',
  '20': 'Private institutions of higher education',
  '21': 'Individuals',
  '22': 'For-profit organizations other than small businesses',
  '23': 'Small businesses',
  '25': 'Others (see the opportunity text field)',
  '99': 'Unrestricted',
};

export const APPLICANT_CODE_TIER_CEILINGS: Record<string, FitTier> = {
  '23': 'likely',
  '22': 'likely',
  '99': 'likely',
  '25': 'potential',
  '00': 'probably-not',
  '01': 'probably-not',
  '02': 'probably-not',
  '04': 'probably-not',
  '05': 'probably-not',
  '06': 'probably-not',
  '07': 'probably-not',
  '08': 'probably-not',
  '11': 'probably-not',
  '12': 'probably-not',
  '13': 'probably-not',
  '20': 'probably-not',
  '21': 'probably-not',
};

export const APPLICANT_CODE_FALLBACK_CEILINGS = {
  absent: 'potential' as FitTier,
  unrecognized: 'potential' as FitTier,
};

export const MUNICIPAL_PRIME_ALNS = {
  alns: ['15.507', '15.514', '15.517', '15.560', '66.458', '66.468', '17.258', '17.259', '17.278'],
  titleSignals: [
    'watersmart',
    'water and energy efficiency grant',
    'applied science grant',
    'water strategy grant',
    'small-scale water efficiency',
    'state revolving fund',
    'clean water srf',
    'drinking water srf',
    'wifia',
    'wioa',
    'workforce innovation and opportunity act',
    'workforce innovation & opportunity act',
  ],
  agencySignals: ['bureau of reclamation', 'environmental protection agency', 'employment and training administration'],
  exemptSignals: ['prize competition', 'prize', 'grand challenge', 'challenge', 'sbir', 'sttr', 'small business innovation research'],
};

export const VC_TOLERANT_ALN_PREFIXES = {
  prefixes: ['93', '47', '12'],
  agencySignals: ['national institutes of health', 'health and human services', 'national science foundation', 'department of defense'],
};

export const OWNERSHIP_SIGNAL_PATTERNS = {
  majorityVc: [
    'majority-vc',
    'majority vc',
    'vc-majority',
    'vc majority',
    'majority venture',
    'venture majority',
    'vc control',
    'vc-controlled',
    'majority private equity',
    'private equity majority',
    'majority-pe',
    'pe majority',
    'majority investor-controlled',
    'majority-owned by investors',
  ],
  foreign: ['foreign ownership', 'foreign-owned', 'majority foreign', 'foreign parent', 'foreign majority'],
  usMajority: ['us-majority', 'majority us', 'us citizen majority', 'majority us-citizen', 'founder-controlled', 'founder majority', 'us-owned', 'majority-owned by founders'],
  affiliateRisk: ['portfolio company', 'common control', 'affiliate', 'holding company'],
};

export const ELIGIBILITY_THRESHOLDS = {
  sbirMaxEmployees: 500,
  largeRaiseVerifyThreshold: 2000000,
  sttrMinResearchInstitutionShare: 0.3,
  sttrMinSmallBusinessShare: 0.4,
  sbirMinPrincipalInvestigatorShare: 0.5,
  registrationLeadTimeBusinessDays: 15,
  registrationLeadTimeWeeks: 4,
};

export const COMMERCIAL_FRAMING_SIGNALS = {
  commercial: ['smb', 'smbs', 'small business', 'small and medium', 'consumer', 'consumers', 'b2b', 'b2c', 'enterprise', 'commercial', 'retail', 'parents', 'families'],
  government: ['government', 'federal', 'dod', 'defense', 'agency', 'agencies', 'municipal', 'public sector', 'state and local', 'military', 'homeland', 'critical infrastructure'],
  governmentCustomerAgencyPrefixes: ['12', '97'],
  governmentCustomerAgencySignals: ['department of defense', 'air force', 'space force', 'navy', 'army', 'homeland security', 'defense advanced research'],
  governmentCustomerTextSignals: ['end-user', 'end user', 'customer memo', 'open topic', 'transition partner', 'government customer'],
};

export const NON_GRANT_SIGNALS = {
  sources: ['utah'],
  titleSignals: ['7(a)', 'microloan', 'micro-loan', 'ssbci', 'bridge loan', 'bridge-loan', 'loan guarantee', 'revolving loan', 'tax increment', 'edtif'],
};

export const SCORE_WEIGHTS = {
  verticalFit: 0.24,
  awardBandOverlap: 0.13,
  deadlineProximity: 0.1,
  historicalDensity: 0.07,
  tierWeight: 0.24,
  programFit: 0.22,
};

export const RESEARCH_INSTRUMENT_SIGNALS = {
  nonGrantSources: ['utah'],
  keywords: [
    'research',
    'clinical trial',
    'science',
    'scientific',
    'laboratory',
    'instrumentation',
    'investigator',
    'fellowship',
    'r01',
    'r21',
    'r43',
    'r44',
    'u54',
    'ug3',
    'uh3',
    'rm1',
    'study',
    'experimental',
    'discovery',
    'innovation research',
    'technology development',
    'prototype',
  ],
};

export const PROGRAM_FIT_SCORES = {
  sbirWithRdCore: 1,
  sbirWithoutRdCore: 0.15,
  curatedNonGrantWithoutRdCore: 0.8,
  neutral: 0.45,
};

export const VERTICAL_FIT_WEIGHTS = {
  naics: 0.45,
  keywords: 0.45,
  agency: 0.1,
};

export const SCORING_DEFAULTS = {
  neutralSubScore: 0.5,
  missingDeadlineScore: 0.4,
  minimumLeadDays: 21,
  tightLeadScore: 0.2,
  deadlineHorizonDays: 365,
  minimumDeadlineScore: 0.15,
  historicalDensitySaturation: 10,
  partialBandCredit: 0.5,
  keywordHitSaturation: 3,
  scorePrecision: 6,
};

export const SEQUENCING_DEFAULTS = {
  primaryMonths: [1, 4, 8],
  phaseTwoMonth: 10,
  horizonMonths: 12,
  maxPrimaryStops: 3,
  laterPhases: ['II', 'D2P2'],
};

export const STACKING_DEFAULTS = {
  maxStackedStops: 4,
  defaultEntryMonth: 1,
};
