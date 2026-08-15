import * as logger from 'firebase-functions/logger';

const BASE_URL = 'https://api.sam.gov/assistance-listings/v1/search';
const PAGE_SIZE = 1000;

export class AssistanceListingsHelper {
  public static async fetchListings(
    apiKey: string | undefined
  ): Promise<Record<string, unknown>[]> {
    if (!apiKey) {
      logger.warn('SAM_API_KEY not set — skipping assistance listings fetch');

      return [];
    }

    const allListings: Record<string, unknown>[] = [];
    let page = 0;

    while (true) {
      try {
        const url = `${BASE_URL}?api_key=${apiKey}&pageSize=${PAGE_SIZE}&status=Active&pageNumber=${page}`;
        const response = await fetch(url);

        if (!response.ok) {
          logger.error('SAM.gov listings API error', { status: response.status, page });
          break;
        }

        const json = (await response.json()) as Record<string, unknown>;
        const hits =
          (json['assistanceListings'] as Record<string, unknown>[]) ??
          (json['_embedded'] as Record<string, unknown> | undefined)?.['assistanceListings'] ??
          [];

        if (!Array.isArray(hits) || hits.length === 0) {
          break;
        }

        allListings.push(...(hits as Record<string, unknown>[]));

        if ((hits as Record<string, unknown>[]).length < PAGE_SIZE) {
          break;
        }

        page++;
      } catch (err) {
        logger.error('SAM.gov listings fetch error', { error: (err as Error).message });
        break;
      }
    }

    logger.info('SAM.gov listings fetched', { count: allListings.length });

    return allListings;
  }
}
