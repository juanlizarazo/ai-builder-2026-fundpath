import { IEligibilityFlag, IOpportunity, IStartupProfile } from '../firestore';
import {
  RESEARCH_INSTRUMENT_SIGNALS,
  APPLICANT_CODE_DESCRIPTIONS,
  APPLICANT_CODE_FALLBACK_CEILINGS,
  APPLICANT_CODE_TIER_CEILINGS,
  COMMERCIAL_FRAMING_SIGNALS,
  ELIGIBILITY_THRESHOLDS,
  FLAG_CODES,
  MUNICIPAL_PRIME_ALNS,
  OWNERSHIP_SIGNAL_PATTERNS,
  RESTRICTED_APPLICANT_CODES,
  STARTUP_ELIGIBLE_CODES,
  TIER_CEILINGS,
  VC_TOLERANT_ALN_PREFIXES,
} from './eligibility.constants';
import { IEligibilityOutcome, IRuleResult } from './route.interfaces';
import { TieringHelper } from './tiering.helper';

export class EligibilityRulesHelper {
  public static evaluate(profile: IStartupProfile, opportunity: IOpportunity): IEligibilityOutcome {
    const results: (IRuleResult | null)[] = [
      EligibilityRulesHelper.applicantCodeRule(profile, opportunity),
      EligibilityRulesHelper.sbirSizeRule(profile, opportunity),
      EligibilityRulesHelper.usOwnershipRule(profile, opportunity),
      EligibilityRulesHelper.majorityVcRule(profile, opportunity),
      EligibilityRulesHelper.principalInvestigatorRule(profile, opportunity),
      EligibilityRulesHelper.researchCoreRule(profile, opportunity),
      EligibilityRulesHelper.municipalPrimeRule(profile, opportunity),
      EligibilityRulesHelper.awardCeilingRule(profile, opportunity),
      EligibilityRulesHelper.commercialFramingRule(profile, opportunity),
      EligibilityRulesHelper.registrationLeadTimeRule(profile, opportunity),
    ];

    const applied = results.filter((result): result is IRuleResult => result !== null);
    const ceilings = applied.map((result) => result.tierCeiling);
    const flags = EligibilityRulesHelper.dedupeFlags(applied.flatMap((result) => result.flags));

    return { tier: TieringHelper.reduceCeilings(ceilings), flags };
  }

  public static applicantCodeRule(profile: IStartupProfile, opportunity: IOpportunity): IRuleResult | null {
    if (EligibilityRulesHelper.isSbirFamily(opportunity) || EligibilityRulesHelper.requiresMunicipalPrime(opportunity)) {
      return null;
    }

    const codes = (opportunity.applicantTypeCodes ?? []).map((code) => code.trim()).filter((code) => code.length > 0);

    if (codes.length === 0) {
      return {
        tierCeiling: APPLICANT_CODE_FALLBACK_CEILINGS.absent,
        flags: [
          {
            severity: 'warn',
            code: FLAG_CODES.APPLICANT_TYPE_UNKNOWN,
            message:
              'This opportunity does not publish applicant eligibility codes, so we cannot confirm a for-profit startup may apply. We downgraded the fit rather than assume eligibility — read the eligibility section of the notice before investing time.',
          },
        ],
      };
    }

    const eligibleCodes = codes.filter((code) => STARTUP_ELIGIBLE_CODES.codes.includes(code));

    if (eligibleCodes.length > 0) {
      return { tierCeiling: TIER_CEILINGS.LIKELY, flags: [] };
    }

    if (codes.includes(STARTUP_ELIGIBLE_CODES.othersSeeText)) {
      return {
        tierCeiling: APPLICANT_CODE_TIER_CEILINGS[STARTUP_ELIGIBLE_CODES.othersSeeText],
        flags: [
          {
            severity: 'warn',
            code: FLAG_CODES.APPLICANT_TYPE_OTHERS_SEE_TEXT,
            message:
              'Eligibility is listed as "Others (see text field)", which means the real applicant list lives in the notice narrative rather than in a structured code. A for-profit startup may or may not qualify — confirm in the full announcement before applying.',
          },
        ],
      };
    }

    const restrictedCodes = codes.filter((code) => RESTRICTED_APPLICANT_CODES.codes.includes(code));

    if (restrictedCodes.length > 0) {
      const described = restrictedCodes.map((code) => APPLICANT_CODE_DESCRIPTIONS[code]).join(', ');

      return {
        tierCeiling: TIER_CEILINGS.PROBABLY_NOT,
        flags: [
          {
            severity: 'block',
            code: FLAG_CODES.APPLICANT_TYPE_INELIGIBLE,
            message: `This program is restricted to ${described} — a for-profit startup cannot be the applicant. Your realistic path here is to be a subrecipient or vendor to an eligible prime, not the awardee.`,
          },
        ],
      };
    }

    return {
      tierCeiling: APPLICANT_CODE_FALLBACK_CEILINGS.unrecognized,
      flags: [
        {
          severity: 'warn',
          code: FLAG_CODES.APPLICANT_TYPE_UNKNOWN,
          message:
            'We could not interpret the published applicant eligibility codes for this opportunity, so we degraded the fit rather than assume a for-profit startup qualifies. Confirm eligibility in the notice.',
        },
      ],
    };
  }

  public static sbirSizeRule(profile: IStartupProfile, opportunity: IOpportunity): IRuleResult | null {
    if (!EligibilityRulesHelper.isSbirFamily(opportunity)) {
      return null;
    }

    if (profile.employees > ELIGIBILITY_THRESHOLDS.sbirMaxEmployees) {
      return {
        tierCeiling: TIER_CEILINGS.PROBABLY_NOT,
        flags: [
          {
            severity: 'block',
            code: FLAG_CODES.SBIR_EMPLOYEE_LIMIT,
            message: `SBIR/STTR requires no more than ${ELIGIBILITY_THRESHOLDS.sbirMaxEmployees} employees including affiliates, and this company reports ${profile.employees}. That exceeds the SBA size standard for the program.`,
          },
        ],
      };
    }

    return {
      tierCeiling: TIER_CEILINGS.LIKELY,
      flags: [
        {
          severity: 'warn',
          code: FLAG_CODES.SBIR_AFFILIATE_AGGREGATION,
          message: `Headcount is under the ${ELIGIBILITY_THRESHOLDS.sbirMaxEmployees}-employee limit, but the count must include affiliates under 13 CFR 121.103. Portfolio companies under common control with a shared investor aggregate together and can push an otherwise small company over the limit — we cannot see your cap table, so verify this before certifying at award.`,
        },
      ],
    };
  }

  public static usOwnershipRule(profile: IStartupProfile, opportunity: IOpportunity): IRuleResult | null {
    if (!EligibilityRulesHelper.isSbirFamily(opportunity)) {
      return null;
    }

    const signals = EligibilityRulesHelper.normalizedOwnershipSignals(profile);

    if (EligibilityRulesHelper.matchesAny(signals, OWNERSHIP_SIGNAL_PATTERNS.foreign)) {
      return {
        tierCeiling: TIER_CEILINGS.PROBABLY_NOT,
        flags: [
          {
            severity: 'block',
            code: FLAG_CODES.US_OWNERSHIP_REQUIRED,
            message:
              'SBIR/STTR requires the company to be at least 51% owned and controlled by US citizens or permanent residents (or by another qualifying small business). The ownership signals on this profile indicate majority foreign ownership, which disqualifies the company unless it is restructured.',
          },
        ],
      };
    }

    if (EligibilityRulesHelper.matchesAny(signals, OWNERSHIP_SIGNAL_PATTERNS.usMajority)) {
      return { tierCeiling: TIER_CEILINGS.LIKELY, flags: [] };
    }

    return {
      tierCeiling: TIER_CEILINGS.LIKELY,
      flags: [
        {
          severity: 'warn',
          code: FLAG_CODES.US_OWNERSHIP_REQUIRED,
          message:
            'SBIR/STTR requires at least 51% ownership and control by US citizens or permanent residents. We have no ownership signal confirming that, so treat it as a verification item — eligibility is certified at time of award, not at application.',
        },
      ],
    };
  }

  public static majorityVcRule(profile: IStartupProfile, opportunity: IOpportunity): IRuleResult | null {
    if (!EligibilityRulesHelper.isSbirFamily(opportunity)) {
      return null;
    }

    const signals = EligibilityRulesHelper.normalizedOwnershipSignals(profile);
    const hasMajorityVcSignal = EligibilityRulesHelper.matchesAny(signals, OWNERSHIP_SIGNAL_PATTERNS.majorityVc);

    if (!hasMajorityVcSignal) {
      const raise = profile.capitalRaised ?? 0;
      const ownershipIsKnown = EligibilityRulesHelper.matchesAny(signals, OWNERSHIP_SIGNAL_PATTERNS.usMajority);

      if (raise >= ELIGIBILITY_THRESHOLDS.largeRaiseVerifyThreshold && !ownershipIsKnown) {
        return {
          tierCeiling: TIER_CEILINGS.LIKELY,
          flags: [
            {
              severity: 'warn',
              code: FLAG_CODES.MAJORITY_VC_RESTRICTED,
              message:
                'The raise on this profile is large enough that a single investor could hold majority control, which would restrict SBIR to the agencies that opted into the majority-VC authority. Raise size and revenue do not themselves affect SBIR eligibility — only the ownership percentage does — so verify control rather than assume a problem.',
            },
          ],
        };
      }

      return null;
    }

    if (EligibilityRulesHelper.isVcTolerantAgency(opportunity)) {
      return {
        tierCeiling: TIER_CEILINGS.LIKELY,
        flags: [
          {
            severity: 'info',
            code: FLAG_CODES.MAJORITY_VC_RESTRICTED,
            message:
              'This company appears to be majority owned by venture or private-equity investors. This agency opted into the majority-VC authority under §5107, so the company can still compete here — confirm the specific solicitation restates that allowance.',
          },
        ],
      };
    }

    return {
      tierCeiling: TIER_CEILINGS.ADJACENT,
      flags: [
        {
          severity: 'warn',
          code: FLAG_CODES.MAJORITY_VC_RESTRICTED,
          message:
            'This company appears to be majority owned by venture or private-equity investors. Only the agencies that opted into the §5107 majority-VC authority — in practice NIH/HHS, NSF, and DoD — reliably award to majority-VC-owned firms, so we downgraded this non-participating agency rather than promise a fit.',
        },
      ],
    };
  }

  public static principalInvestigatorRule(profile: IStartupProfile, opportunity: IOpportunity): IRuleResult | null {
    if (opportunity.isSttr === true) {
      return {
        tierCeiling: TIER_CEILINGS.LIKELY,
        flags: [
          {
            severity: 'warn',
            code: FLAG_CODES.STTR_RI_PARTNER_REQUIRED,
            message: `STTR requires a formal research-institution partner, with at least ${Math.round(
              ELIGIBILITY_THRESHOLDS.sttrMinResearchInstitutionShare * 100,
            )}% of the work performed by the research institution and at least ${Math.round(
              ELIGIBILITY_THRESHOLDS.sttrMinSmallBusinessShare * 100,
            )}% by the small business. The principal investigator may be employed by the research institution. Line up a university partner before the deadline.`,
          },
        ],
      };
    }

    if (opportunity.isSbir === true) {
      return {
        tierCeiling: TIER_CEILINGS.LIKELY,
        flags: [
          {
            severity: 'info',
            code: FLAG_CODES.SBIR_PI_EMPLOYMENT,
            message: `SBIR requires the principal investigator to be primarily employed by the small business — more than ${Math.round(
              ELIGIBILITY_THRESHOLDS.sbirMinPrincipalInvestigatorShare * 100,
            )}% of their time. A university-based PI is an STTR arrangement, not an SBIR one.`,
          },
        ],
      };
    }

    return null;
  }

  public static researchCoreRule(profile: IStartupProfile, opportunity: IOpportunity): IRuleResult | null {
    if (profile.hasRdCore !== false) {
      return null;
    }

    const isSbirFamily = EligibilityRulesHelper.isSbirFamily(opportunity);

    if (isSbirFamily) {
      return {
        tierCeiling: TIER_CEILINGS.PROBABLY_NOT,
        flags: [
          {
            severity: 'block',
            code: FLAG_CODES.NO_RD_CORE,
            message:
              'SBIR/STTR funds research and development, not commercialization of an existing product. This profile shows no technical R&D core — a booking or marketplace product typically lacks the technical innovation and research risk reviewers score on, so a submission here would almost certainly be non-responsive.',
          },
        ],
      };
    }

    if (EligibilityRulesHelper.isNonGrantInstrument(opportunity)) {
      return null;
    }

    if (EligibilityRulesHelper.isResearchInstrument(opportunity)) {
      return {
        tierCeiling: TIER_CEILINGS.PROBABLY_NOT,
        flags: [
          {
            severity: 'block',
            code: FLAG_CODES.NO_RD_CORE,
            message:
              'This is a federal research award: reviewers fund scientific or technical investigation with an uncertain outcome. This profile describes a commercial product without a research core, so there is no research question for a panel to score. Non-dilutive capital is still available, but through loans and state programs rather than research grants.',
          },
        ],
      };
    }

    return {
      tierCeiling: TIER_CEILINGS.ADJACENT,
      flags: [
        {
          severity: 'warn',
          code: FLAG_CODES.NO_RD_CORE,
          message:
            'Federal grant programs fund research, public services, or work carried out on behalf of government — they are not designed to capitalise a for-profit commercial product. Without a research core, the realistic role here is as a subcontractor or vendor to an eligible applicant, not as the awardee. Loans and state programs are the honest path to this kind of growth capital.',
        },
      ],
    };
  }

  public static municipalPrimeRule(profile: IStartupProfile, opportunity: IOpportunity): IRuleResult | null {
    if (!EligibilityRulesHelper.requiresMunicipalPrime(opportunity)) {
      return null;
    }

    return {
      tierCeiling: TIER_CEILINGS.ADJACENT,
      flags: [
        {
          severity: 'warn',
          code: FLAG_CODES.REQUIRES_MUNICIPAL_PRIME,
          message:
            'This program requires an applicant with water-delivery or workforce authority — a water district, municipality, utility, state agency, or university must be the prime applicant. You are not disqualified from the work: a startup participates as a subcontractor or technology provider on the prime\'s application. Find a Utah water district or municipal partner rather than applying directly.',
        },
      ],
    };
  }

  public static awardCeilingRule(profile: IStartupProfile, opportunity: IOpportunity): IRuleResult | null {
    const ceiling = EligibilityRulesHelper.readAmount(opportunity.maxAward);
    const askTarget = EligibilityRulesHelper.readAmount(profile.askMax) ?? EligibilityRulesHelper.readAmount(profile.askMin);

    if (ceiling === null || askTarget === null || askTarget <= ceiling) {
      return null;
    }

    return {
      tierCeiling: TIER_CEILINGS.LIKELY,
      flags: [
        {
          severity: 'info',
          code: FLAG_CODES.ASK_ABOVE_SINGLE_AWARD_CEILING,
          message: `Your funding need runs above this program's single-award ceiling of $${ceiling.toLocaleString(
            'en-US',
          )}. That does not make you ineligible — it means one award will not cover the ask and this stop belongs in a stacked plan alongside other awards.`,
        },
      ],
    };
  }

  public static commercialFramingRule(profile: IStartupProfile, opportunity: IOpportunity): IRuleResult | null {
    if (!EligibilityRulesHelper.requiresNamedGovernmentCustomer(opportunity)) {
      return null;
    }

    if (!EligibilityRulesHelper.isPurelyCommercialFraming(profile)) {
      return null;
    }

    return {
      tierCeiling: TIER_CEILINGS.POTENTIAL,
      flags: [
        {
          severity: 'warn',
          code: FLAG_CODES.COMMERCIAL_FRAMING_NEEDS_GOV_CUSTOMER,
          message:
            'Your stated customer is a commercial market, but this program expects a named government end-user and a transition path into a federal mission. The technology fit is real; the customer framing is the gap. Reframe toward a federal network or critical-infrastructure use case and secure an end-user memo before submitting.',
        },
      ],
    };
  }

  public static registrationLeadTimeRule(profile: IStartupProfile, opportunity: IOpportunity): IRuleResult | null {
    return {
      tierCeiling: TIER_CEILINGS.LIKELY,
      flags: [
        {
          severity: 'info',
          code: FLAG_CODES.REGISTRATION_LEAD_TIME,
          message: `A SAM.gov UEI takes ${ELIGIBILITY_THRESHOLDS.registrationLeadTimeBusinessDays} business days in the good case — budget ${ELIGIBILITY_THRESHOLDS.registrationLeadTimeWeeks} weeks. Registration order is SAM.gov, then the SBA Company Registry, then Grants.gov, then the agency system. Missing this lead time is the most common reason a startup misses a deadline it was otherwise ready for.`,
        },
      ],
    };
  }

  public static requiresMunicipalPrime(opportunity: IOpportunity): boolean {
    const haystack = EligibilityRulesHelper.opportunityText(opportunity);

    if (EligibilityRulesHelper.containsAny(haystack, MUNICIPAL_PRIME_ALNS.exemptSignals)) {
      return false;
    }

    if (opportunity.isSbir === true || opportunity.isSttr === true) {
      return false;
    }

    const alns = EligibilityRulesHelper.opportunityAlns(opportunity);
    const alnMatches = alns.some((aln) => MUNICIPAL_PRIME_ALNS.alns.includes(aln));

    return alnMatches || EligibilityRulesHelper.containsAny(haystack, MUNICIPAL_PRIME_ALNS.titleSignals);
  }

  public static isVcTolerantAgency(opportunity: IOpportunity): boolean {
    const alns = EligibilityRulesHelper.opportunityAlns(opportunity);
    const prefixMatches = alns.some((aln) => VC_TOLERANT_ALN_PREFIXES.prefixes.includes(aln.slice(0, 2)));

    if (prefixMatches) {
      return true;
    }

    const agencyCodePrefix = (opportunity.agencyCode ?? '').slice(0, 2);

    if (agencyCodePrefix.length === 2 && VC_TOLERANT_ALN_PREFIXES.prefixes.includes(agencyCodePrefix)) {
      return true;
    }

    return EligibilityRulesHelper.containsAny((opportunity.agency ?? '').toLowerCase(), VC_TOLERANT_ALN_PREFIXES.agencySignals);
  }

  public static isResearchInstrument(opportunity: IOpportunity): boolean {
    if (EligibilityRulesHelper.isNonGrantInstrument(opportunity)) {
      return false;
    }

    const haystack = `${opportunity.title} ${opportunity.description}`.toLowerCase();

    return RESEARCH_INSTRUMENT_SIGNALS.keywords.some(keyword => haystack.includes(keyword));
  }

  public static isNonGrantInstrument(opportunity: IOpportunity): boolean {
    if (opportunity.placement === 'non-grant') {
      return true;
    }

    return RESEARCH_INSTRUMENT_SIGNALS.nonGrantSources.includes(opportunity.source);
  }

  public static isSbirFamily(opportunity: IOpportunity): boolean {
    return opportunity.isSbir === true || opportunity.isSttr === true || opportunity.source === 'sbir';
  }

  public static readAmount(amount: number | undefined): number | null {
    if (amount === undefined || amount === null || !Number.isFinite(amount) || amount <= 0) {
      return null;
    }

    return amount;
  }

  private static requiresNamedGovernmentCustomer(opportunity: IOpportunity): boolean {
    const alns = EligibilityRulesHelper.opportunityAlns(opportunity);
    const agency = (opportunity.agency ?? '').toLowerCase();
    const agencyCodePrefix = (opportunity.agencyCode ?? '').slice(0, 2);
    const isDefenceOrHomeland =
      alns.some((aln) => COMMERCIAL_FRAMING_SIGNALS.governmentCustomerAgencyPrefixes.includes(aln.slice(0, 2))) ||
      COMMERCIAL_FRAMING_SIGNALS.governmentCustomerAgencyPrefixes.includes(agencyCodePrefix) ||
      EligibilityRulesHelper.containsAny(agency, COMMERCIAL_FRAMING_SIGNALS.governmentCustomerAgencySignals);

    if (!isDefenceOrHomeland) {
      return false;
    }

    const haystack = EligibilityRulesHelper.opportunityText(opportunity);

    return (
      EligibilityRulesHelper.isSbirFamily(opportunity) ||
      EligibilityRulesHelper.containsAny(haystack, COMMERCIAL_FRAMING_SIGNALS.governmentCustomerTextSignals)
    );
  }

  private static isPurelyCommercialFraming(profile: IStartupProfile): boolean {
    const target = (profile.targetCustomer ?? '').toLowerCase();

    if (target.length === 0) {
      return false;
    }

    if (EligibilityRulesHelper.containsAny(target, COMMERCIAL_FRAMING_SIGNALS.government)) {
      return false;
    }

    return EligibilityRulesHelper.containsAny(target, COMMERCIAL_FRAMING_SIGNALS.commercial);
  }

  private static opportunityAlns(opportunity: IOpportunity): string[] {
    const alns = [...(opportunity.alnAll ?? [])];

    if (opportunity.aln) {
      alns.push(opportunity.aln);
    }

    return alns.map((aln) => aln.trim()).filter((aln) => aln.length > 0);
  }

  private static opportunityText(opportunity: IOpportunity): string {
    return [opportunity.title, opportunity.description, ...(opportunity.keywords ?? [])].join(' ').toLowerCase();
  }

  private static normalizedOwnershipSignals(profile: IStartupProfile): string {
    return (profile.ownershipSignals ?? []).join(' | ').toLowerCase();
  }

  private static matchesAny(haystack: string, patterns: string[]): boolean {
    return EligibilityRulesHelper.containsAny(haystack, patterns);
  }

  private static containsAny(haystack: string, patterns: string[]): boolean {
    return patterns.some((pattern) => haystack.includes(pattern));
  }

  private static dedupeFlags(flags: IEligibilityFlag[]): IEligibilityFlag[] {
    const bySeverity: Record<IEligibilityFlag['severity'], number> = { block: 0, warn: 1, info: 2 };
    const byCode = new Map<string, IEligibilityFlag>();

    for (const flag of flags) {
      const existing = byCode.get(flag.code);

      if (!existing || bySeverity[flag.severity] < bySeverity[existing.severity]) {
        byCode.set(flag.code, flag);
      }
    }

    return [...byCode.values()].sort((first, second) => bySeverity[first.severity] - bySeverity[second.severity]);
  }
}
