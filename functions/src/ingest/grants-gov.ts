import * as logger from 'firebase-functions/logger';

const SEARCH_URL = 'https://api.grants.gov/v1/api/search2';
const DETAIL_URL = 'https://api.grants.gov/v1/api/fetchOpportunity';
const PAGE_SIZE = 1000;

export class GrantsGovHelper {
  public static async fetchPostedOpportunities(
    categories: string[],
    maxRows: number
  ): Promise<Record<string, unknown>[]> {
    const allHits: Record<string, unknown>[] = [];

    for (const category of categories) {
      let startRecord = 0;
      let totalForCategory = 0;

      while (allHits.length < maxRows) {
        try {
          const body = {
            fundingCategories: category,
            oppStatuses: 'posted|forecasted',
            rows: PAGE_SIZE,
            startRecordNum: startRecord,
          };

          const response = await fetch(SEARCH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });

          if (!response.ok) {
            logger.error('Grants.gov search error', { status: response.status, category });
            break;
          }

          const json = (await response.json()) as Record<string, unknown>;
          const data = json['data'] as Record<string, unknown> | undefined;
          const hits = (data?.['oppHits'] as Record<string, unknown>[]) ?? [];

          if (hits.length === 0) {
            break;
          }

          allHits.push(...hits);
          totalForCategory += hits.length;

          if (hits.length < PAGE_SIZE) {
            break;
          }

          startRecord += PAGE_SIZE;
        } catch (err) {
          logger.error('Grants.gov fetch error', { error: (err as Error).message, category });
          break;
        }
      }

      logger.info('Grants.gov category sweep complete', { category, count: totalForCategory });
    }

    return allHits.slice(0, maxRows);
  }

  public static async fetchOpportunityDetail(
    opportunityId: string
  ): Promise<Record<string, unknown>> {
    const response = await fetch(DETAIL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opportunityId }),
    });

    if (!response.ok) {
      throw new Error(`Grants.gov detail fetch failed: ${response.status}`);
    }

    const json = (await response.json()) as Record<string, unknown>;

    return (json['data'] as Record<string, unknown>) ?? json;
  }
}
