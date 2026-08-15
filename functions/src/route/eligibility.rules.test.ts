import type { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { FitTier, IEligibilityFlag, IOpportunity, IStartupProfile } from '../firestore';
import { FLAG_CODES } from './eligibility.constants';
import { EligibilityRulesHelper } from './eligibility.rules';

const stubTimestamp = { toDate: (): Date => new Date('2026-08-14T00:00:00Z'), toMillis: (): number => 1786060800000 } as unknown as Timestamp;

function buildProfile(overrides: Partial<IStartupProfile> = {}): IStartupProfile {
  return {
    uid: 'user-1',
    rawDescription: 'A Utah startup.',
    industry: 'software',
    technologyKeywords: ['ai'],
    location: { state: 'UT' },
    employees: 15,
    hasRdCore: true,
    createdAt: stubTimestamp,
    updatedAt: stubTimestamp,
    ...overrides,
  };
}

function buildOpportunity(overrides: Partial<IOpportunity> = {}): IOpportunity {
  return {
    source: 'grants-gov',
    sourceId: 'OPP-1',
    alnResolved: true,
    title: 'Generic Federal Grant Program',
    description: 'A federal funding opportunity.',
    agency: 'Some Agency',
    status: 'posted',
    lastSyncedAt: stubTimestamp,
    ...overrides,
  };
}

function findFlag(flags: IEligibilityFlag[], code: string): IEligibilityFlag {
  const found = flags.find((flag) => flag.code === code);

  expect(found, `expected flag ${code} to be present`).toBeDefined();

  return found as IEligibilityFlag;
}

const nihSbir = buildOpportunity({
  source: 'sbir',
  sourceId: 'NIH-SBIR-OMNIBUS',
  aln: '93.855',
  title: 'NIH SBIR Omnibus Solicitation',
  description: 'Small business innovation research for biomedical and health informatics R&D.',
  agency: 'National Institutes of Health',
  agencyCode: '93',
  isSbir: true,
  minAward: 100000,
  maxAward: 2153927,
});

const nasaSbir = buildOpportunity({
  source: 'sbir',
  sourceId: 'NASA-SBIR-2026',
  aln: '43.012',
  title: 'NASA SBIR Advanced Manufacturing Technologies',
  description: 'Composites, additive manufacturing and lightweight metals research.',
  agency: 'National Aeronautics and Space Administration',
  agencyCode: '43',
  isSbir: true,
  minAward: 150000,
  maxAward: 850000,
});

const dodSbir = buildOpportunity({
  source: 'sbir',
  sourceId: 'AFWERX-OPEN-TOPIC',
  aln: '12.800',
  title: 'AFWERX Open Topic SBIR',
  description: 'Dual-use open topic requiring a named government end-user memo.',
  agency: 'Department of Defense',
  agencyCode: '12',
  isSbir: true,
  minAward: 75000,
  maxAward: 1800000,
});

const waterSmart = buildOpportunity({
  sourceId: 'BOR-WEEG-2026',
  aln: '15.507',
  title: 'WaterSMART Water and Energy Efficiency Grants',
  description: 'Cost-shared grants for projects that conserve and use water more efficiently.',
  agency: 'Bureau of Reclamation',
  agencyCode: '15',
  applicantTypeCodes: ['00', '01', '02', '04', '07', '11', '12'],
  minAward: 100000,
  maxAward: 5000000,
});

const reclamationPrize = buildOpportunity({
  sourceId: 'BOR-PRIZE-CRACK-THE-CASE',
  title: 'Bureau of Reclamation Prize Competition: Crack the Case',
  description: 'An open prize competition for businesses and individuals to solve a water infrastructure problem.',
  agency: 'Bureau of Reclamation',
  agencyCode: '15',
  applicantTypeCodes: ['99'],
  maxAward: 30000,
});

const wioaGrant = buildOpportunity({
  sourceId: 'DOL-WIOA-YOUTH',
  aln: '17.259',
  title: 'WIOA Youth Workforce Innovation and Opportunity Act Formula Program',
  description: 'Workforce development funding administered through state and local workforce boards.',
  agency: 'Employment and Training Administration',
  agencyCode: '17',
  applicantTypeCodes: ['00', '01', '12'],
});

const waterProfile = buildProfile({
  industry: 'water',
  employees: 10,
  revenueArr: 500000,
  capitalRaised: 1500000,
  askMin: 500000,
  askMax: 3000000,
  technologyKeywords: ['sensors', 'leak detection'],
  targetCustomer: 'municipal water districts',
});

describe('EligibilityRulesHelper — municipal prime symmetry', () => {
  const tierOf = (opportunity: IOpportunity): FitTier => EligibilityRulesHelper.evaluate(waterProfile, opportunity).tier;

  it('caps WaterSMART at adjacent — never rejected, never approved', () => {
    expect(tierOf(waterSmart)).toBe('adjacent');
  });

  it('flags WaterSMART with a warn, not a block', () => {
    const outcome = EligibilityRulesHelper.evaluate(waterProfile, waterSmart);

    expect(findFlag(outcome.flags, FLAG_CODES.REQUIRES_MUNICIPAL_PRIME).severity).toBe('warn');
  });

  it('does not over-match a Bureau of Reclamation prize competition at the same agency', () => {
    expect(tierOf(reclamationPrize)).toBe('likely');
    expect(reclamationPrize.agency).toBe(waterSmart.agency);
  });

  it('exempts a prize competition even when it carries the WaterSMART ALN', () => {
    const prizeWithWaterSmartAln = { ...reclamationPrize, aln: '15.507' };

    expect(EligibilityRulesHelper.requiresMunicipalPrime(prizeWithWaterSmartAln)).toBe(false);
    expect(EligibilityRulesHelper.requiresMunicipalPrime(waterSmart)).toBe(true);
  });

  it('treats DOL WIOA formula funding as adjacent with the same warn flag', () => {
    const outcome = EligibilityRulesHelper.evaluate(waterProfile, wioaGrant);

    expect(outcome.tier).toBe('adjacent');
    expect(findFlag(outcome.flags, FLAG_CODES.REQUIRES_MUNICIPAL_PRIME).severity).toBe('warn');
  });

  it('does not catch an SBIR opportunity in the municipal prime net', () => {
    expect(EligibilityRulesHelper.requiresMunicipalPrime(nihSbir)).toBe(false);
  });
});

describe('EligibilityRulesHelper — Grants.gov applicant codes', () => {
  const table: [string[], FitTier][] = [
    [['23'], 'likely'],
    [['22'], 'likely'],
    [['99'], 'likely'],
    [['25'], 'potential'],
    [['00'], 'probably-not'],
    [['12'], 'probably-not'],
    [['20'], 'probably-not'],
    [['01'], 'probably-not'],
    [['02'], 'probably-not'],
    [['04'], 'probably-not'],
    [['05'], 'probably-not'],
    [['06'], 'probably-not'],
    [['07'], 'probably-not'],
    [['08'], 'probably-not'],
    [['11'], 'probably-not'],
    [['13'], 'probably-not'],
    [['21'], 'probably-not'],
    [[], 'potential'],
  ];

  it.each(table)('maps applicant codes %j to %s', (codes, expected) => {
    const outcome = EligibilityRulesHelper.evaluate(buildProfile(), buildOpportunity({ applicantTypeCodes: codes }));

    expect(outcome.tier).toBe(expected);
  });

  it('blocks with an explanatory flag when the program is restricted', () => {
    const outcome = EligibilityRulesHelper.evaluate(buildProfile(), buildOpportunity({ applicantTypeCodes: ['00', '12'] }));
    const flag = findFlag(outcome.flags, FLAG_CODES.APPLICANT_TYPE_INELIGIBLE);

    expect(flag.severity).toBe('block');
    expect(flag.message).not.toBe(FLAG_CODES.APPLICANT_TYPE_INELIGIBLE);
    expect(flag.message.length).toBeGreaterThan(60);
  });

  it('degrades rather than approves when applicant codes are absent', () => {
    const outcome = EligibilityRulesHelper.evaluate(buildProfile(), buildOpportunity({ applicantTypeCodes: undefined }));

    expect(outcome.tier).toBe('potential');
    expect(findFlag(outcome.flags, FLAG_CODES.APPLICANT_TYPE_UNKNOWN).severity).toBe('warn');
  });

  it('never gives code 25 a confident green', () => {
    const outcome = EligibilityRulesHelper.evaluate(buildProfile(), buildOpportunity({ applicantTypeCodes: ['25'] }));

    expect(outcome.tier).toBe('potential');
    expect(findFlag(outcome.flags, FLAG_CODES.APPLICANT_TYPE_OTHERS_SEE_TEXT).severity).toBe('warn');
  });

  it('accepts a small business code even when restricted codes are also listed', () => {
    const outcome = EligibilityRulesHelper.evaluate(buildProfile(), buildOpportunity({ applicantTypeCodes: ['00', '12', '23'] }));

    expect(outcome.tier).toBe('likely');
  });

  it('does not apply applicant codes to SBIR programs', () => {
    expect(EligibilityRulesHelper.applicantCodeRule(buildProfile(), nihSbir)).toBeNull();
  });
});

describe('EligibilityRulesHelper — SBIR baseline', () => {
  it('blocks over 500 employees including affiliates', () => {
    const outcome = EligibilityRulesHelper.evaluate(buildProfile({ employees: 600 }), nihSbir);

    expect(outcome.tier).toBe('probably-not');
    expect(findFlag(outcome.flags, FLAG_CODES.SBIR_EMPLOYEE_LIMIT).severity).toBe('block');
  });

  it('warns about 13 CFR 121.103 affiliate aggregation for a small company', () => {
    const outcome = EligibilityRulesHelper.evaluate(buildProfile({ employees: 15 }), nihSbir);

    expect(findFlag(outcome.flags, FLAG_CODES.SBIR_AFFILIATE_AGGREGATION).severity).toBe('warn');
    expect(outcome.tier).toBe('likely');
  });

  it('blocks majority foreign ownership on SBIR', () => {
    const outcome = EligibilityRulesHelper.evaluate(buildProfile({ ownershipSignals: ['majority foreign parent company'] }), nihSbir);

    expect(outcome.tier).toBe('probably-not');
    expect(findFlag(outcome.flags, FLAG_CODES.US_OWNERSHIP_REQUIRED).severity).toBe('block');
  });

  it('warns to verify 51% US ownership when unknown', () => {
    const outcome = EligibilityRulesHelper.evaluate(buildProfile(), nihSbir);

    expect(findFlag(outcome.flags, FLAG_CODES.US_OWNERSHIP_REQUIRED).severity).toBe('warn');
  });

  it('does not apply SBIR size rules to a plain grant', () => {
    expect(EligibilityRulesHelper.sbirSizeRule(buildProfile({ employees: 900 }), buildOpportunity())).toBeNull();
  });
});

describe('EligibilityRulesHelper — majority VC ownership', () => {
  const vcProfile = buildProfile({ ownershipSignals: ['majority vc ownership after series a'], capitalRaised: 8000000 });

  it('allows majority VC at an agency that opted into the §5107 authority', () => {
    const outcome = EligibilityRulesHelper.evaluate(vcProfile, nihSbir);

    expect(outcome.tier).toBe('likely');
    expect(findFlag(outcome.flags, FLAG_CODES.MAJORITY_VC_RESTRICTED).severity).toBe('info');
  });

  it('allows majority VC at DoD', () => {
    expect(EligibilityRulesHelper.isVcTolerantAgency(dodSbir)).toBe(true);
  });

  it('downgrades majority VC at a non-participating agency without blocking', () => {
    const outcome = EligibilityRulesHelper.evaluate(vcProfile, nasaSbir);

    expect(outcome.tier).toBe('adjacent');
    expect(findFlag(outcome.flags, FLAG_CODES.MAJORITY_VC_RESTRICTED).severity).toBe('warn');
  });

  it('never infers majority VC control from a large raise alone', () => {
    const outcome = EligibilityRulesHelper.evaluate(buildProfile({ capitalRaised: 8000000 }), nasaSbir);

    expect(outcome.tier).toBe('likely');
    expect(findFlag(outcome.flags, FLAG_CODES.MAJORITY_VC_RESTRICTED).severity).toBe('warn');
  });

  it('stays silent about VC control on a small raise with known US ownership', () => {
    const profile = buildProfile({ capitalRaised: 250000, ownershipSignals: ['founder-controlled, majority us citizens'] });
    const outcome = EligibilityRulesHelper.evaluate(profile, nasaSbir);

    expect(outcome.flags.some((flag) => flag.code === FLAG_CODES.MAJORITY_VC_RESTRICTED)).toBe(false);
    expect(outcome.tier).toBe('likely');
  });
});

describe('EligibilityRulesHelper — SBIR vs STTR principal investigator', () => {
  it('emits an info flag about SBIR PI primary employment', () => {
    const outcome = EligibilityRulesHelper.evaluate(buildProfile(), nihSbir);

    expect(findFlag(outcome.flags, FLAG_CODES.SBIR_PI_EMPLOYMENT).severity).toBe('info');
    expect(outcome.tier).toBe('likely');
  });

  it('emits a warn flag about the STTR research institution partner without blocking', () => {
    const sttr = buildOpportunity({
      source: 'sbir',
      sourceId: 'NASA-STTR',
      aln: '43.012',
      title: 'NASA STTR Solicitation',
      description: 'Cooperative research with a research institution partner.',
      agency: 'National Aeronautics and Space Administration',
      isSttr: true,
    });
    const outcome = EligibilityRulesHelper.evaluate(buildProfile(), sttr);

    expect(findFlag(outcome.flags, FLAG_CODES.STTR_RI_PARTNER_REQUIRED).severity).toBe('warn');
    expect(outcome.tier).toBe('likely');
  });
});

describe('EligibilityRulesHelper — R&D core', () => {
  const marketplaceProfile = buildProfile({
    industry: 'consumer marketplace',
    employees: 8,
    revenueArr: 750000,
    capitalRaised: 1000000,
    askMin: 250000,
    askMax: 1000000,
    hasRdCore: false,
    targetCustomer: 'parents booking youth activities',
  });

  it('drops an SBIR opportunity to probably-not when there is no R&D core', () => {
    const edSbir = buildOpportunity({
      source: 'sbir',
      sourceId: 'ED-IES-SBIR',
      aln: '84.305',
      title: 'ED/IES SBIR Education Technology Solicitation',
      description: 'Research and development of education technology with measurable learning outcomes.',
      agency: 'Department of Education',
      isSbir: true,
      maxAward: 1000000,
    });
    const outcome = EligibilityRulesHelper.evaluate(marketplaceProfile, edSbir);

    expect(outcome.tier).toBe('probably-not');
    expect(findFlag(outcome.flags, FLAG_CODES.NO_RD_CORE).severity).toBe('block');
  });

  it('caps a non-research federal grant at adjacent for a profile with no R&D core', () => {
    const result = EligibilityRulesHelper.researchCoreRule(marketplaceProfile, buildOpportunity());

    expect(result?.tierCeiling).toBe('adjacent');
    expect(result?.flags[0].code).toBe(FLAG_CODES.NO_RD_CORE);
    expect(result?.flags[0].severity).toBe('warn');
  });

  it('leaves the rule inert for a non-grant instrument such as a state loan', () => {
    expect(
      EligibilityRulesHelper.researchCoreRule(
        marketplaceProfile,
        buildOpportunity({ source: 'utah', placement: 'non-grant' })
      )
    ).toBeNull();
  });

  it('leaves the rule inert when the profile does have an R&D core', () => {
    expect(EligibilityRulesHelper.researchCoreRule(buildProfile({ hasRdCore: true }), nihSbir)).toBeNull();
  });
});

describe('EligibilityRulesHelper — award ceiling and commercial framing', () => {
  it('flags an ask above the single award ceiling without downgrading the tier', () => {
    const profile = buildProfile({ employees: 35, askMin: 2000000, askMax: 5000000, capitalRaised: 8000000 });
    const outcome = EligibilityRulesHelper.evaluate(profile, nasaSbir);

    expect(findFlag(outcome.flags, FLAG_CODES.ASK_ABOVE_SINGLE_AWARD_CEILING).severity).toBe('info');
    expect(outcome.tier).toBe('likely');
  });

  it('treats a zero maxAward as missing, not as a real ceiling', () => {
    const profile = buildProfile({ askMin: 500000, askMax: 2000000 });
    const zeroCeiling = buildOpportunity({ applicantTypeCodes: ['23'], minAward: 0, maxAward: 0 });
    const outcome = EligibilityRulesHelper.evaluate(profile, zeroCeiling);

    expect(outcome.flags.some((flag) => flag.code === FLAG_CODES.ASK_ABOVE_SINGLE_AWARD_CEILING)).toBe(false);
    expect(outcome.tier).toBe('likely');
  });

  it('caps a purely commercial framing at potential on a DoD program', () => {
    const cyberProfile = buildProfile({
      industry: 'cybersecurity',
      employees: 22,
      capitalRaised: 5000000,
      askMin: 1000000,
      askMax: 3000000,
      targetCustomer: 'SMBs buying managed threat detection',
    });
    const outcome = EligibilityRulesHelper.evaluate(cyberProfile, dodSbir);

    expect(outcome.tier).toBe('potential');
    expect(findFlag(outcome.flags, FLAG_CODES.COMMERCIAL_FRAMING_NEEDS_GOV_CUSTOMER).severity).toBe('warn');
  });

  it('does not flag commercial framing when the customer is already governmental', () => {
    const profile = buildProfile({ targetCustomer: 'federal agency security operations centers' });
    const outcome = EligibilityRulesHelper.evaluate(profile, dodSbir);

    expect(outcome.flags.some((flag) => flag.code === FLAG_CODES.COMMERCIAL_FRAMING_NEEDS_GOV_CUSTOMER)).toBe(false);
  });

  it('does not flag commercial framing on a program with no government end-user requirement', () => {
    const profile = buildProfile({ targetCustomer: 'SMBs' });

    expect(EligibilityRulesHelper.evaluate(profile, nasaSbir).flags.some((flag) => flag.code === FLAG_CODES.COMMERCIAL_FRAMING_NEEDS_GOV_CUSTOMER)).toBe(
      false,
    );
  });
});

describe('EligibilityRulesHelper — registration lead time', () => {
  it('always surfaces the SAM.gov lead time as info', () => {
    const outcome = EligibilityRulesHelper.evaluate(buildProfile(), buildOpportunity({ applicantTypeCodes: ['23'] }));

    expect(findFlag(outcome.flags, FLAG_CODES.REGISTRATION_LEAD_TIME).severity).toBe('info');
    expect(outcome.tier).toBe('likely');
  });
});

describe('EligibilityRulesHelper — the five reference cases', () => {
  it('Case 1: AI healthcare startup is a likely fit on NIH SBIR', () => {
    const profile = buildProfile({
      industry: 'health-it',
      employees: 15,
      revenueArr: 1000000,
      capitalRaised: 2500000,
      askMin: 500000,
      askMax: 2000000,
      targetCustomer: 'hospital nursing teams',
    });

    expect(EligibilityRulesHelper.evaluate(profile, nihSbir).tier).toBe('likely');
  });

  it('Case 2: aerospace hardware is a likely fit on NASA SBIR with a stacking flag', () => {
    const profile = buildProfile({
      industry: 'aerospace',
      employees: 35,
      revenueArr: 3000000,
      capitalRaised: 8000000,
      askMin: 2000000,
      askMax: 5000000,
    });
    const outcome = EligibilityRulesHelper.evaluate(profile, nasaSbir);

    expect(outcome.tier).toBe('likely');
    expect(findFlag(outcome.flags, FLAG_CODES.ASK_ABOVE_SINGLE_AWARD_CEILING).severity).toBe('info');
  });

  it('Case 4: cybersecurity startup lands at potential on DoD SBIR', () => {
    const profile = buildProfile({
      industry: 'cybersecurity',
      employees: 22,
      capitalRaised: 5000000,
      askMin: 1000000,
      askMax: 3000000,
      targetCustomer: 'SMBs',
    });

    expect(EligibilityRulesHelper.evaluate(profile, dodSbir).tier).toBe('potential');
  });

  it('Case 5: consumer marketplace is ruled out on SBIR and only adjacent on workforce grants', () => {
    const profile = buildProfile({ employees: 8, hasRdCore: false, askMin: 250000, askMax: 1000000 });

    expect(EligibilityRulesHelper.evaluate(profile, nihSbir).tier).toBe('probably-not');
    expect(EligibilityRulesHelper.evaluate(profile, wioaGrant).tier).toBe('adjacent');
  });
});

describe('EligibilityRulesHelper — determinism', () => {
  it('produces identical outcomes for identical inputs', () => {
    const first = EligibilityRulesHelper.evaluate(waterProfile, waterSmart);
    const second = EligibilityRulesHelper.evaluate(waterProfile, waterSmart);

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});
