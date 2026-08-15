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
    if (value === null || value === undefined) {
      return undefined;
    }

    if (typeof value === 'string' && (value.trim() === '' || value.trim().toLowerCase() === 'none')) {
      return undefined;
    }

    const parsed = Number(value);

    if (isNaN(parsed)) {
      return undefined;
    }

    return parsed;
  }

  private static _isSbirTitle(title: string): boolean {
    const haystack = title.toLowerCase();

    return (
      haystack.includes('small business innovation research') ||
      haystack.includes('small business technology transfer') ||
      /\bsbir\b/.test(haystack) ||
      /\bsttr\b/.test(haystack)
    );
  }

  private static _isSttrTitle(title: string): boolean {
    const haystack = title.toLowerCase();

    return haystack.includes('small business technology transfer') || /\bsttr\b/.test(haystack);
  }

  public static fromGrantsGov(
    hit: Record<string, unknown>,
    detail?: Record<string, unknown>
  ): IOpportunity {
    const synopsis = (detail?.['synopsis'] ?? {}) as Record<string, unknown>;
    const forecast = (detail?.['forecast'] ?? {}) as Record<string, unknown>;
    const detailBody = Object.keys(synopsis).length > 0 ? synopsis : forecast;

    const cfdas = Array.isArray(detail?.['cfdas'])
      ? (detail?.['cfdas'] as Record<string, unknown>[])
          .map(entry => (entry?.['cfdaNumber'] ? String(entry['cfdaNumber']) : ''))
          .filter(Boolean)
      : [];
    const cfdaListFallback = Normalizer._toStringArray(hit['cfdaList']) ?? [];
    const alnAll = cfdas.length > 0 ? cfdas : cfdaListFallback;

    const applicantTypeCodes = Array.isArray(detailBody['applicantTypes'])
      ? (detailBody['applicantTypes'] as Record<string, unknown>[])
          .map(entry => (entry?.['id'] ? String(entry['id']) : ''))
          .filter(Boolean)
      : undefined;

    const fundingInstruments = Array.isArray(detailBody['fundingInstruments'])
      ? (detailBody['fundingInstruments'] as Record<string, unknown>[])
      : [];

    const title = String(detail?.['opportunityTitle'] ?? hit['title'] ?? '');
    const description = String(detailBody['synopsisDesc'] ?? detailBody['forecastDesc'] ?? '');

    return {
      source: 'grants-gov',
      sourceId: String(hit['id'] ?? detail?.['id'] ?? ''),
      aln: alnAll[0],
      alnAll: alnAll.length > 0 ? alnAll : undefined,
      alnResolved: alnAll.length > 0,
      title,
      description,
      agency: String(
        (detail?.['agencyDetails'] as Record<string, unknown> | undefined)?.['agencyName'] ??
          hit['agency'] ??
          detailBody['agencyName'] ??
          ''
      ),
      agencyCode: String(detailBody['agencyCode'] ?? hit['agencyCode'] ?? '') || undefined,
      fundingInstrument: fundingInstruments[0]?.['id']
        ? String(fundingInstruments[0]['id'])
        : undefined,
      applicantTypeCodes,
      applicantEligibilityDesc: detailBody['applicantEligibilityDesc']
        ? String(detailBody['applicantEligibilityDesc'])
        : undefined,
      keywords: Normalizer._toStringArray(hit['keywords']),
      minAward: Normalizer._toNumber(detailBody['awardFloor']),
      maxAward: Normalizer._toNumber(detailBody['awardCeiling']),
      openDate: Normalizer._parseDate(
        detailBody['postingDate'] ?? detailBody['estSynopsisPostingDate'] ?? hit['openDate']
      ),
      closeDate: Normalizer._parseDate(
        detailBody['responseDate'] ?? detailBody['estApplicationResponseDate'] ?? hit['closeDate']
      ),
      isSbir: Normalizer._isSbirTitle(title) || undefined,
      isSttr: Normalizer._isSttrTitle(title) || undefined,
      status: (hit['oppStatus'] as IOpportunity['status']) ?? 'posted',
      programUrl: hit['id']
        ? `https://www.grants.gov/search-results-detail/${String(hit['id'])}`
        : undefined,
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
      placement: (raw['placement'] as IOpportunity['placement']) ?? undefined,
      programUrl: raw['programUrl'] ? String(raw['programUrl']) : undefined,
      curated: true,
      lastSyncedAt: Timestamp.now(),
    };
  }

  public static fromSeedProgram(raw: Record<string, unknown>): IOpportunity {
    const alnAll = Normalizer._toStringArray(raw['alnAll']);
    const aln = raw['aln'] ? String(raw['aln']) : alnAll?.[0];

    return {
      source: 'seed',
      sourceId: String(raw['sourceId'] ?? ''),
      aln,
      alnAll,
      alnResolved: Boolean(aln),
      title: String(raw['title'] ?? ''),
      description: String(raw['description'] ?? ''),
      agency: String(raw['agency'] ?? ''),
      agencyCode: raw['agencyCode'] ? String(raw['agencyCode']) : undefined,
      fundingInstrument: raw['fundingInstrument'] ? String(raw['fundingInstrument']) : undefined,
      applicantTypeCodes: Normalizer._toStringArray(raw['applicantTypeCodes']),
      applicantEligibilityDesc: raw['applicantEligibilityDesc']
        ? String(raw['applicantEligibilityDesc'])
        : undefined,
      naicsCodes: Normalizer._toStringArray(raw['naicsCodes']),
      keywords: Normalizer._toStringArray(raw['keywords']),
      minAward: Normalizer._toNumber(raw['minAward']),
      maxAward: Normalizer._toNumber(raw['maxAward']),
      openDate: Normalizer._parseDate(raw['openDate']),
      closeDate: Normalizer._parseDate(raw['closeDate']),
      programPhase: (raw['programPhase'] as IOpportunity['programPhase']) ?? undefined,
      isSbir: raw['isSbir'] === true ? true : undefined,
      isSttr: raw['isSttr'] === true ? true : undefined,
      status: (raw['status'] as IOpportunity['status']) ?? 'posted',
      placement: (raw['placement'] as IOpportunity['placement']) ?? undefined,
      programUrl: raw['programUrl'] ? String(raw['programUrl']) : undefined,
      curated: true,
      provenance: (raw['provenance'] as IOpportunity['provenance']) ?? undefined,
      lastSyncedAt: Timestamp.now(),
    };
  }

  public static fromUsaSpending(raw: Record<string, unknown>): IOpportunity {
    const awardId = String(raw['Award ID'] ?? raw['award_id'] ?? '');
    const recipientName = raw['Recipient Name'] ? String(raw['Recipient Name']) : undefined;
    const awardAmount = Normalizer._toNumber(raw['Award Amount']);
    const startDate = Normalizer._parseDate(raw['Start Date']);

    return {
      source: 'usaspending',
      sourceId: `usaspending-${awardId}`,
      alnResolved: false,
      title: recipientName ? `${recipientName} — ${awardId}` : awardId,
      description: String(raw['NAICS Description'] ?? raw['Description'] ?? ''),
      agency: String(raw['Awarding Agency'] ?? ''),
      naicsCodes: raw['NAICS Code'] ? [String(raw['NAICS Code'])] : undefined,
      minAward: awardAmount,
      maxAward: awardAmount,
      openDate: startDate,
      recipientName,
      awardAmount,
      awardYear: startDate ? startDate.toDate().getUTCFullYear() : undefined,
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
