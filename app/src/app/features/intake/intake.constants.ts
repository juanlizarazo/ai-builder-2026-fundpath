/**
 * Verbatim copy of `EXTRACTION_INDUSTRY_SLUGS` from
 * `functions/src/route/extraction.constants.ts` (read-only reference —
 * `functions/` is a separate deployable and not importable from `app/`).
 * Keep in sync manually if that list ever changes.
 */
const EXTRACTION_INDUSTRY_SLUGS: string[] = [
  'health-it',
  'healthcare',
  'aerospace',
  'manufacturing',
  'water',
  'climate',
  'environmental',
  'cybersecurity',
  'software',
  'saas',
  'ai',
  'education',
  'edtech',
  'other'
];

/**
 * Friendly labels for the extraction schema's industry slugs
 * (`functions/src/route/extraction.constants.ts`, read-only). Guided mode
 * stores the slug so `industry` maps 1:1 onto the extraction schema; the
 * label is what renders in the sentence and the picker chips.
 */
const INTAKE_INDUSTRY_LABELS: Record<string, string> = {
  'health-it': 'Health IT',
  healthcare: 'Healthcare',
  aerospace: 'Aerospace',
  manufacturing: 'Manufacturing',
  water: 'Water Tech',
  climate: 'Climate',
  environmental: 'Environmental',
  cybersecurity: 'Cybersecurity',
  software: 'Software',
  saas: 'SaaS',
  ai: 'AI',
  education: 'Education',
  edtech: 'EdTech',
  other: 'Other'
};

export interface IntakeOption {
  value: string;
  label: string;
}

export const INTAKE_INDUSTRY_OPTIONS: IntakeOption[] = EXTRACTION_INDUSTRY_SLUGS.map((slug) => ({
  value: slug,
  label: INTAKE_INDUSTRY_LABELS[slug] ?? slug
}));

export function industryLabel(slug: string): string {
  return INTAKE_INDUSTRY_LABELS[slug] ?? slug;
}

/**
 * No canonical Utah county list exists elsewhere in `app/src`; the closest
 * reference is `functions/src/route/intelligence.constants.ts`'s
 * `RURAL_UTAH_COUNTIES` (23 of 29). Per the task brief, using the full
 * 29-county list here.
 */
export const INTAKE_COUNTY_OPTIONS: string[] = [
  'Beaver',
  'Box Elder',
  'Cache',
  'Carbon',
  'Daggett',
  'Davis',
  'Duchesne',
  'Emery',
  'Garfield',
  'Grand',
  'Iron',
  'Juab',
  'Kane',
  'Millard',
  'Morgan',
  'Piute',
  'Rich',
  'Salt Lake',
  'San Juan',
  'Sanpete',
  'Sevier',
  'Summit',
  'Tooele',
  'Uintah',
  'Utah',
  'Wasatch',
  'Washington',
  'Wayne',
  'Weber'
];

export const INTAKE_TEAM_BANDS: string[] = ['1–10', '11–50', '51–200', '200+'];

export const INTAKE_REVENUE_BANDS: string[] = [
  'pre-revenue',
  'under $500K',
  '$500K–$2M',
  '$2M–$10M',
  '$10M+'
];

export const INTAKE_RAISED_BANDS: string[] = ['bootstrapped', 'under $1M', '$1M–$5M', '$5M–$20M'];

export const INTAKE_NEED_BANDS: string[] = ['$100K–$500K', '$500K–$2M', '$2M–$5M', '$5M+'];

export const INTAKE_USE_OF_FUNDS_OPTIONS: string[] = [
  'R&D',
  'prototype to product',
  'manufacturing scale-up',
  'clinical validation',
  'engineering hires',
  'federal market entry',
  'working capital'
];

/** All Guided-mode token values captured for a single example chip. */
export interface GuidedExampleTokens {
  industry: string;
  county: string;
  team: string;
  revenue: string;
  raised: string;
  amount: string;
  useOfFunds: string;
}

export const EXAMPLE_LABELS: string[] = [
  'Nurse-AI SaaS',
  'Composite aerospace parts',
  'Water-leak sensors',
  'SMB threat detection',
  'Youth sports marketplace'
];

/**
 * Guided-mode token sets for the example chips, thematically consistent
 * with the five `EXAMPLE_DESCRIPTIONS` strings in intake.component.ts
 * (not required to match verbatim — those five remain the Describe-mode
 * fallback paste).
 */
export const EXAMPLE_GUIDED_TOKENS: GuidedExampleTokens[] = [
  {
    industry: 'health-it',
    county: 'Salt Lake',
    team: '11–50',
    revenue: '$500K–$2M',
    raised: '$1M–$5M',
    amount: '$500K–$2M',
    useOfFunds: 'R&D'
  },
  {
    industry: 'aerospace',
    county: 'Utah',
    team: '11–50',
    revenue: '$2M–$10M',
    raised: '$5M–$20M',
    amount: '$2M–$5M',
    useOfFunds: 'manufacturing scale-up'
  },
  {
    industry: 'water',
    county: 'Cache',
    team: '1–10',
    revenue: 'under $500K',
    raised: '$1M–$5M',
    amount: '$500K–$2M',
    useOfFunds: 'prototype to product'
  },
  {
    industry: 'cybersecurity',
    county: 'Salt Lake',
    team: '11–50',
    revenue: '$500K–$2M',
    raised: '$1M–$5M',
    amount: '$100K–$500K',
    useOfFunds: 'federal market entry'
  },
  {
    industry: 'software',
    county: 'Utah',
    team: '1–10',
    revenue: 'under $500K',
    raised: 'under $1M',
    amount: '$100K–$500K',
    useOfFunds: 'working capital'
  }
];

/** Order the example animate-fill runs through, ~140ms apart between tokens. */
export const GUIDED_EXAMPLE_TOKEN_ORDER: (keyof GuidedExampleTokens)[] = [
  'industry',
  'county',
  'team',
  'revenue',
  'raised',
  'amount',
  'useOfFunds'
];

export const GUIDED_EXAMPLE_FILL_STEP_MS = 140;

export interface GuidedDescriptionInput {
  companyName: string;
  industry: string;
  county: string;
  team: string;
  revenue: string;
  raised: string;
  amount: string;
  useOfFunds: string;
}

/**
 * Composes the client-side description string sent to the existing
 * `buildRoute` call, preserving the extraction-schema field order:
 * industry, county, team size, revenue, raised, amount, use of funds.
 * Company name and every field but industry/county/team/amount are
 * optional; omitting them must never leave a dangling separator.
 */
export function composeGuidedDescription(input: GuidedDescriptionInput): string {
  const company = input.companyName.trim();
  const label = industryLabel(input.industry);

  const opening = company ? `${company} — Utah ${label} company` : `Utah ${label} company`;

  let sentence = `${opening} in ${input.county} County, ${input.team} employees`;
  if (input.revenue) {
    sentence += `, ${input.revenue}`;
  }
  sentence += '.';

  if (input.raised) {
    sentence += ` ${input.raised} raised.`;
  }

  sentence += ` Need ${input.amount}`;
  if (input.useOfFunds) {
    sentence += ` for ${input.useOfFunds}`;
  }
  sentence += '.';

  return sentence;
}
