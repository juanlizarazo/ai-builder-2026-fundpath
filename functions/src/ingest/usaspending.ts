import * as logger from 'firebase-functions/logger';

const SEARCH_URL = 'https://api.usaspending.gov/api/v2/search/spending_by_award/';

const CONTRACT_AWARD_TYPES = ['A', 'B', 'C', 'D'];
const ASSISTANCE_AWARD_TYPES = ['02', '03', '04', '05'];
const SMALL_AWARD_FLOOR = 50_000;
const SMALL_AWARD_CEILING = 5_000_000;
const CONTRACT_FIELDS = [
  'Award ID',
  'Recipient Name',
  'Recipient UEI',
  'Award Amount',
  'Start Date',
  'Awarding Agency',
  'NAICS Code',
  'NAICS Description',
];
const ASSISTANCE_FIELDS = [
  'Award ID',
  'Recipient Name',
  'Recipient UEI',
  'Award Amount',
  'Start Date',
  'Awarding Agency',
  'Description',
];

export class USASpendingHelper {
  private static async _search(
    awardTypeCodes: string[],
    fields: string[],
    state: string,
    naicsCodes?: string[]
  ): Promise<Record<string, unknown>[]> {
    try {
      const filters: Record<string, unknown> = {
        recipient_locations: [{ country: 'USA', state }],
        award_type_codes: awardTypeCodes,
        award_amounts: [{ lower_bound: SMALL_AWARD_FLOOR, upper_bound: SMALL_AWARD_CEILING }],
        time_period: [{ start_date: '2019-01-01', end_date: '2026-12-31' }],
      };

      if (naicsCodes && naicsCodes.length > 0) {
        filters['naics_codes'] = naicsCodes;
      }

      const response = await fetch(SEARCH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filters,
          fields,
          sort: 'Award Amount',
          order: 'desc',
          page: 1,
          limit: 100,
        }),
      });

      if (!response.ok) {
        logger.error('USAspending API error', {
          status: response.status,
          awardTypeCodes: awardTypeCodes.join(','),
        });

        return [];
      }

      const json = (await response.json()) as Record<string, unknown>;

      return (json['results'] as Record<string, unknown>[]) ?? [];
    } catch (err) {
      logger.error('USAspending fetch error', { error: (err as Error).message });

      return [];
    }
  }

  public static async fetchUtahAwards(
    state: string,
    naicsCodes: string[]
  ): Promise<Record<string, unknown>[]> {
    const [contracts, assistance] = await Promise.all([
      USASpendingHelper._search(CONTRACT_AWARD_TYPES, CONTRACT_FIELDS, state, naicsCodes),
      USASpendingHelper._search(ASSISTANCE_AWARD_TYPES, ASSISTANCE_FIELDS, state),
    ]);

    logger.info('USAspending fetched', {
      contracts: contracts.length,
      assistance: assistance.length,
    });

    return [...contracts, ...assistance];
  }
}
