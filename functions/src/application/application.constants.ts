import { IDocumentItem } from '../firestore';
import { REGISTRATION_LEAD_BUSINESS_DAYS } from '../route/retrieval.constants';
import { IDocumentResolverInput, NarrativeSection } from './application.interfaces';

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

export const GRANTS_GOV_PORTAL = { name: 'Grants.gov', url: 'https://grants.gov' };

// ---- Documents registry ------------------------------------------------------
//
// Deterministic, no LLM. Gating logic (see StarterKitService / resolveDocuments):
//   - "general federal" baseline: applies to every federal grant application
//     regardless of program type — SF-424, SF-424A (budget form + narrative
//     attachment, tracked as two separate document items since they are two
//     separate artifacts in practice), project/technical narrative, facilities &
//     equipment, letters of support.
//   - SBIR/STTR-specific: only when `isSbir || isSttr` — biosketches of key
//     personnel, current & pending support, and the SBIR/STTR certification are
//     SBIR/STTR-program artifacts with no general-federal-grant equivalent.
//   - Phase II only: the commercialization plan is only requested for Phase II
//     (commercialization-stage) SBIR/STTR awards, gated on `programPhase === 'II'`.
//
// `formUrl` is only set for SF-424/SF-424A, which live at a stable Grants.gov
// forms page; every other document is agency- or template-specific and we do not
// have a confirmed stable URL for it, so `formUrl` is omitted per the honesty rule
// ("anything we can't confirm gets omitted, not guessed").

const GRANTS_GOV_SF424_FORMS_URL = 'https://www.grants.gov/forms/sf-424-family';

const GENERAL_FEDERAL_DOCUMENTS: IDocumentItem[] = [
  {
    id: 'sf424',
    label: 'SF-424: Application for Federal Assistance',
    required: true,
    formUrl: GRANTS_GOV_SF424_FORMS_URL,
  },
  {
    id: 'sf424a-budget',
    label: 'SF-424A: Budget Information (Non-Construction Programs)',
    required: true,
    formUrl: GRANTS_GOV_SF424_FORMS_URL,
  },
  {
    id: 'sf424a-justification',
    label: 'Budget Narrative / Justification',
    required: true,
    note: 'Line-item justification for the SF-424A budget — format is agency-specific, no standard federal form.',
  },
  {
    id: 'project-narrative',
    label: 'Project / Technical Narrative',
    required: true,
  },
  {
    id: 'facilities-equipment',
    label: 'Facilities & Equipment Description',
    required: true,
  },
  {
    id: 'letters-of-support',
    label: 'Letters of Support',
    required: false,
    note: 'Not always mandatory, but commonly strengthens an application — check the solicitation for whether it is required.',
  },
];

const SBIR_STTR_DOCUMENTS: IDocumentItem[] = [
  {
    id: 'biosketches',
    label: 'Biographical Sketches (Key Personnel)',
    required: true,
  },
  {
    id: 'current-pending-support',
    label: 'Current & Pending Support',
    required: true,
  },
  {
    id: 'sbir-sttr-certification',
    label: 'SBIR/STTR Certification',
    required: true,
  },
];

const COMMERCIALIZATION_PLAN_DOCUMENT: IDocumentItem = {
  id: 'commercialization-plan',
  label: 'Commercialization Plan',
  required: true,
  note: 'Phase II SBIR/STTR awards require a commercialization plan describing the path to market.',
};

/**
 * Resolves the deterministic documents checklist for a stop/opportunity, gated on
 * `isSbir`/`isSttr` and `programPhase`. Pure function — no LLM, no I/O.
 */
export function resolveDocuments(input: IDocumentResolverInput): IDocumentItem[] {
  const documents: IDocumentItem[] = [...GENERAL_FEDERAL_DOCUMENTS];

  if (input.isSbir || input.isSttr) {
    documents.push(...SBIR_STTR_DOCUMENTS);
  }

  if (input.programPhase === 'II') {
    documents.push(COMMERCIALIZATION_PLAN_DOCUMENT);
  }

  return documents;
}

// ---- Narrative starters (Claude call + deterministic fallback) --------------

export const NARRATIVE_SECTIONS: readonly NarrativeSection[] = [
  'innovation',
  'commercialization',
  'team',
  'alignment',
];

export const NARRATIVE_SECTION_HEADINGS: Record<NarrativeSection, string> = {
  innovation: 'Innovation & Technical Approach',
  commercialization: 'Commercialization & Market Path',
  team: 'Team & Organizational Capability',
  alignment: 'Mission Alignment & Impact',
};

export const NARRATIVE_SYSTEM_PROMPT = `You are the narrative-starter writer inside FundPath, a Utah government-funding matcher. You write founder-facing FIRST-DRAFT prose for four sections of a grant application outline. These are starting drafts the founder will revise before submitting — not final application text, not a decision, not a guarantee.

## WHAT HAS ALREADY BEEN DECIDED WITHOUT YOU

The startup profile, the stop (program/agency/whyFit/eligibility flags) and the solicitation description you are given are established facts from other parts of the system. Your only job is to turn them into a usable first draft.

## HARD CONSTRAINTS — VIOLATING ANY OF THESE IS A FAILURE

1. **Never invent a fact not present in the input.** No fabricated dollar amounts, dates, named customers, patents, prior awards, headcounts, or named competitors beyond what the payload actually states. If the solicitation description is missing or thin, write generally about the program's known agency and title without inventing solicitation specifics.
2. **Ground every section in the given profile, stop, and solicitation description** — reference the company's actual industry, technology keywords, target customer, and the stop's actual title/agency/whyFit where present.
3. **Never claim eligibility or promise an award.** This is a first-draft outline, not a certification — do not write "we are eligible" or "this guarantees funding".
4. **Plain, confident, founder voice.** First person plural ("we"/"our"). No hype, no consultant filler, no markdown, no headings inside the "draft" string itself (the heading is a separate field).
5. **Length: roughly 120 words per section** — a soft target, not a hard limit. Write naturally; do not pad to hit a count and do not truncate mid-sentence.
6. **Section meanings, in this fixed order:**
   - innovation — the specific technical problem being solved, the novel approach, and why it is non-obvious.
   - commercialization — the target customer, the path to revenue, and what this funding lets the company build toward commercially.
   - team — what the team's actual background (from the profile) implies about its ability to execute this project.
   - alignment — why this specific program and agency's mission fits what the company is building.

## OUTPUT FORMAT

Return ONLY a JSON array. No prose, no markdown fences, no wrapper object.

[
  { "section": "innovation", "heading": "...", "draft": "..." },
  { "section": "commercialization", "heading": "...", "draft": "..." },
  { "section": "team", "heading": "...", "draft": "..." },
  { "section": "alignment", "heading": "...", "draft": "..." }
]

Return exactly these four objects, in exactly this order. Never omit a section, never add an extra one, never use a "section" value other than these four.`;

export const NARRATIVE_USER_PROMPT_PREFIX =
  'Write the four narrative-starter sections below, grounded only in the facts given. Return only the JSON array.\n\nPAYLOAD:\n';

export const NARRATIVE_FALLBACK = {
  unavailableNote:
    'We could not generate a written first draft for this section, so this is a structural outline to start from — replace it with your own narrative before you submit.',
  prompts: {
    innovation:
      'Describe the specific technical problem you solve, why your approach is novel, and what makes it non-obvious to someone in the field.',
    commercialization:
      'Describe your target customer, how you plan to reach them, and what this funding lets you build toward commercially.',
    team: "Describe your team's relevant technical and execution background and why you are positioned to deliver this project.",
    alignment: "Explain, in your own words, why your technology matches this program and its agency's mission.",
  } satisfies Record<NarrativeSection, string>,
};
