import * as logger from 'firebase-functions/logger';

const BASE_URL = 'https://api.www.sbir.gov/public/api';
const PAGE_SIZE = 400;

export class SbirHelper {
  public static async fetchAwardsByState(
    state: string,
    yearFrom: number,
    yearTo: number
  ): Promise<Record<string, unknown>[]> {
    const allRecords: Record<string, unknown>[] = [];
    let offset = 0;

    while (true) {
      try {
        const url = `${BASE_URL}/awards?state=${state}&start=${offset}&rows=${PAGE_SIZE}`;
        const response = await fetch(url);

        if (!response.ok) {
          logger.error('SBIR awards API error', { status: response.status, state });
          break;
        }

        const data = (await response.json()) as Record<string, unknown>[];

        if (!Array.isArray(data) || data.length === 0) {
          break;
        }

        const filtered = data.filter(record => {
          const year = Number(record['award_year']);

          return year >= yearFrom && year <= yearTo;
        });

        allRecords.push(...filtered);

        if (data.length < PAGE_SIZE) {
          break;
        }

        offset += PAGE_SIZE;
      } catch (err) {
        logger.error('SBIR awards fetch error', { error: (err as Error).message, state });
        break;
      }
    }

    return allRecords;
  }

  public static async fetchOpenSolicitations(): Promise<Record<string, unknown>[]> {
    const allRecords: Record<string, unknown>[] = [];
    let offset = 0;

    while (true) {
      try {
        const url = `${BASE_URL}/solicitations?keyword=&rows=${PAGE_SIZE}&start=${offset}`;
        const response = await fetch(url);

        if (!response.ok) {
          logger.error('SBIR solicitations API error', { status: response.status });
          break;
        }

        const data = (await response.json()) as Record<string, unknown>[];

        if (!Array.isArray(data) || data.length === 0) {
          break;
        }

        allRecords.push(...data);

        if (data.length < PAGE_SIZE) {
          break;
        }

        offset += PAGE_SIZE;
      } catch (err) {
        logger.error('SBIR solicitations fetch error', { error: (err as Error).message });
        break;
      }
    }

    return allRecords;
  }
}
