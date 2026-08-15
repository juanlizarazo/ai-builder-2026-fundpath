import { REGISTRATION_LEAD_BUSINESS_DAYS } from '../route/retrieval.constants';

// Re-exported (not redefined) so callers in this module only need one import path.
export { REGISTRATION_LEAD_BUSINESS_DAYS };

export const SBA_REGISTRY_LEAD_BUSINESS_DAYS = 1;

export const GRANTS_GOV_LEAD_BUSINESS_DAYS = 3;

export const DRAFTING_BUFFER_BUSINESS_DAYS = 10;

export interface IAgencyPortalEntry {
  system: string;
  url?: string;
  durationBusinessDays: number;
}

/**
 * Agency portal resolved deterministically from the ALN prefix (the leading digits
 * before the first '.' or '-', e.g. "93.859" -> "93").
 *
 * '66' and '97' are Grants.gov-only ALNs — there is no separate agency-portal step
 * for them, so they intentionally have no entry here (absence, not a zero-duration
 * placeholder, is what signals "Grants.gov only" to the helper).
 *
 * Only URLs we're confident are real and stable are included; per the plan's honesty
 * rule ("Anything we can't confirm gets omitted, not guessed"), the rest omit `url`.
 */
export const AGENCY_PORTAL_BY_ALN_PREFIX: Record<string, IAgencyPortalEntry> = {
  '93': { system: 'eRA Commons', durationBusinessDays: 2, url: 'https://public.era.nih.gov/commons' },
  '12': { system: 'DoD DSIP', durationBusinessDays: 2 },
  '47': { system: 'Research.gov', durationBusinessDays: 2 },
  '43': { system: 'NSPIRES', durationBusinessDays: 2 },
  '81': { system: 'PAMS', durationBusinessDays: 2 },
};
