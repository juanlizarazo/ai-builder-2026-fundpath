import { Timestamp } from 'firebase-admin/firestore';
import { IOpportunity, IUtahResource } from '../firestore';

export class Normalizer {
  private static _parseDate(value: unknown): Timestamp | undefined {
    if (!value) {
      return undefined;
    }

    const date = new Date(String(value));

    if (isNaN(date.getTime())) {
      return undefined;
    }

    return Timestamp.fromDate(date);
  }

  private static _toStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) {
      return undefined;
    }

    return value.filter(v => typeof v === 'string') as string[];
  }

  private static _toNumber(value: unknown): number | undefined {
    const n = Number(value);

    if (isNaN(n)) {
      return undefined;
    }

    return n;
  }

  public static fromGrantsGov(raw: Record<string, unknown>): IOpportunity {
    const eligibilities = Array.isArray(raw['eligibilities'])
      ? (raw['eligibilities'] as Record<string, unknown>[]).map(
          e => String(e['eligibilityCode'] ?? e['code'] ?? '')
        ).filter(Boolean)
      : undefined;

    const aln = raw['aln'] ?? raw['cfdaList'];
    const alnStr = aln ? String(aln) : undefined;

    return {
      source: 'grants-gov',
      sourceId: String(raw['opportunityId'] ?? raw['id'] ?? ''),
      aln: alnStr,
      alnResolved: Boolean(alnStr),
      title: String(raw['opportunityTitle'] ?? raw['title'] ?? ''),
      description: String(raw['synopsis'] ?? raw['description'] ?? ''),
      agency: String(raw['agencyName'] ?? raw['agency'] ?? ''),
      agencyCode: raw['agencyCode'] ? String(raw['agencyCode']) : undefined,
      fundingInstrument: raw['fundingInstrumentTypes']
        ? String((raw['fundingInstrumentTypes'] as string[])[0] ?? '')
        : undefined,
      applicantTypeCodes: eligibilities,
      keywords: Normalizer._toStringArray(raw['keywords']),
      minAward: Normalizer._toNumber(raw['estimatedFundingMin'] ?? raw['awardCeiling']),
      maxAward: Normalizer._toNumber(raw['estimatedFundingMax'] ?? raw['estimatedFunding']),
      openDate: Normalizer._parseDate(raw['openDate'] ?? raw['postDate']),
      closeDate: Normalizer._parseDate(raw['closeDate'] ?? raw['applicationDeadline']),
      status: (raw['oppStatus'] as IOpportunity['status']) ?? 'posted',
      lastSyncedAt: Timestamp.now(),
    };
  }

  public static fromSbir(raw: Record<string, unknown>): IOpportunity {
    const phase = String(raw['phase'] ?? '');
    let programPhase: IOpportunity['programPhase'] | undefined;

    if (phase.includes('I') && !phase.includes('II')) {
      programPhase = 'I';
    } else if (phase.includes('II')) {
      programPhase = 'II';
    }

    return {
      source: 'sbir',
      sourceId: String(
        raw['agency_tracking_number'] ?? raw['contract'] ?? raw['solicitation_number'] ?? ''
      ),
      alnResolved: false,
      title: String(raw['award_title'] ?? raw['title'] ?? ''),
      description: String(raw['abstract'] ?? raw['description'] ?? ''),
      agency: String(raw['agency'] ?? ''),
      agencyCode: raw['branch'] ? String(raw['branch']) : undefined,
      isSbir: true,
      isSttr: String(raw['program'] ?? '').toUpperCase().includes('STTR'),
      programPhase,
      minAward: Normalizer._toNumber(raw['award_amount']),
      maxAward: Normalizer._toNumber(raw['award_amount']),
      openDate: Normalizer._parseDate(raw['open_date'] ?? raw['solicitation_open_date']),
      closeDate: Normalizer._parseDate(raw['contract_end_date'] ?? raw['close_date']),
      status: 'posted',
      lastSyncedAt: Timestamp.now(),
    };
  }

  public static fromAssistanceListing(raw: Record<string, unknown>): IOpportunity {
    const financialInfo = raw['financialInformation'] as Record<string, unknown> | undefined;
    const rangeAndAvg = Array.isArray(financialInfo?.['rangeAndAverageAssistance'])
      ? (financialInfo?.['rangeAndAverageAssistance'] as Record<string, unknown>[])[0]
      : undefined;

    const aln = raw['assistanceListingId'] ?? raw['cfda'];
    const alnStr = aln ? String(aln) : undefined;

    return {
      source: 'assistance-listing',
      sourceId: String(raw['assistanceListingId'] ?? raw['cfda'] ?? ''),
      aln: alnStr,
      alnResolved: Boolean(alnStr),
      title: String(raw['title'] ?? ''),
      description: String(
        (raw['overview'] as Record<string, unknown> | undefined)?.['objective'] ?? ''
      ),
      agency: String(
        (raw['federalOrganization'] as Record<string, unknown> | undefined)?.['name'] ?? ''
      ),
      agencyCode: String(
        (raw['federalOrganization'] as Record<string, unknown> | undefined)?.['code'] ?? ''
      ),
      minAward: Normalizer._toNumber(
        (rangeAndAvg as Record<string, unknown> | undefined)?.['min']
      ),
      maxAward: Normalizer._toNumber(
        (rangeAndAvg as Record<string, unknown> | undefined)?.['max']
      ),
      status: raw['status'] === 'Active' ? 'posted' : 'archived',
      lastSyncedAt: Timestamp.now(),
    };
  }

  public static fromUtahProgram(raw: Record<string, unknown>): IOpportunity {
    return {
      source: 'utah',
      sourceId: String(raw['sourceId'] ?? ''),
      alnResolved: Boolean(raw['alnResolved']),
      title: String(raw['title'] ?? ''),
      description: String(raw['description'] ?? ''),
      agency: String(raw['agency'] ?? ''),
      agencyCode: raw['agencyCode'] ? String(raw['agencyCode']) : undefined,
      fundingInstrument: raw['fundingInstrument'] ? String(raw['fundingInstrument']) : undefined,
      applicantTypeCodes: Normalizer._toStringArray(raw['applicantTypeCodes']),
      minAward: Normalizer._toNumber(raw['minAward']),
      maxAward: Normalizer._toNumber(raw['maxAward']),
      status: (raw['status'] as IOpportunity['status']) ?? 'posted',
      lastSyncedAt: Timestamp.now(),
    };
  }

  public static fromUsaSpending(raw: Record<string, unknown>): IOpportunity {
    const awardId = String(raw['Award ID'] ?? raw['award_id'] ?? '');

    return {
      source: 'usaspending',
      sourceId: `usaspending-${awardId}`,
      alnResolved: false,
      title: String(raw['Award ID'] ?? ''),
      description: String(raw['NAICS Description'] ?? ''),
      agency: String(raw['Awarding Agency'] ?? ''),
      naicsCodes: raw['NAICS Code'] ? [String(raw['NAICS Code'])] : undefined,
      minAward: Normalizer._toNumber(raw['Award Amount']),
      maxAward: Normalizer._toNumber(raw['Award Amount']),
      openDate: Normalizer._parseDate(raw['Start Date']),
      status: 'closed',
      lastSyncedAt: Timestamp.now(),
    };
  }

  public static fromUtahResource(raw: Record<string, unknown>): IUtahResource {
    return {
      title: String(raw['title'] ?? ''),
      description: String(raw['description'] ?? ''),
      link: String(raw['link'] ?? ''),
      email: raw['email'] ? String(raw['email']) : null,
      industries: Normalizer._toStringArray(raw['industries']) ?? [],
      counties: Normalizer._toStringArray(raw['locations']) ?? [],
      needs: Normalizer._toStringArray(raw['needs']) ?? [],
      stage: String(raw['stage'] ?? ''),
    };
  }
}
