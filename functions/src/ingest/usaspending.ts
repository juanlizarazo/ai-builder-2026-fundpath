import * as logger from 'firebase-functions/logger';

const SEARCH_URL = 'https://api.usaspending.gov/api/v2/search/spending_by_award/';

export class USASpendingHelper {
  public static async fetchAwardsByStateAndNaics(
    state: string,
    naicsCodes: string[],
    awardTypes: string[]
  ): Promise<Record<string, unknown>[]> {
    try {
      const body = {
        filters: {
          recipient_location_scope: 'place_of_performance',
          place_of_performance_locations: [{ country: 'USA', state }],
          naics_codes: naicsCodes,
          award_type_codes: awardTypes,
          time_period: [{ start_date: '2020-01-01', end_date: '2026-12-31' }],
        },
        fields: [
          'Award ID',
          'Recipient Name',
          'Recipient UEI',
          'Award Amount',
          'Start Date',
          'Awarding Agency',
          'NAICS Code',
          'NAICS Description',
        ],
        sort: 'Award Amount',
        order: 'desc',
        page: 1,
        limit: 200,
      };

      const response = await fetch(SEARCH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        logger.error('USAspending API error', { status: response.status });

        return [];
      }

      const json = (await response.json()) as Record<string, unknown>;

      return (json['results'] as Record<string, unknown>[]) ?? [];
    } catch (err) {
      logger.error('USAspending fetch error', { error: (err as Error).message });

      return [];
    }
  }
}
