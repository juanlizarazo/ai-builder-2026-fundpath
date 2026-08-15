import { AdminHelper } from './admin.helper';
import { COVERAGE_TARGETS, ICoverageTarget } from './coverage-targets';

interface ICandidateRecord {
  id: string;
  title: string;
  agency: string;
}

interface ICoverageResult {
  target: ICoverageTarget;
  present: boolean;
  foundIn: string;
}

const GRANTS_SEARCH_URL = 'https://api.grants.gov/v1/api/search2';
const SBIR_SOLICITATIONS_URL = 'https://api.www.sbir.gov/public/api/solicitations';
const USASPENDING_SEARCH_URL = 'https://api.usaspending.gov/api/v2/search/spending_by_award/';
const CORPUS_COLLECTION = 'corpus';
const CONTRACT_AWARD_TYPE_CODES = ['A', 'B', 'C', 'D'];
const GRANT_AWARD_TYPE_CODES = ['02', '03', '04', '05'];
const REQUEST_TIMEOUT_MS = 25000;

export class CoverageChecker {
  private static _grantsCache = new Map<string, ICandidateRecord[]>();
  private static _sbirCache = new Map<string, ICandidateRecord[]>();
  private static _usaSpendingCache = new Map<string, ICandidateRecord[]>();
  private static _sbirReachable = true;

  private static _normalize(value: unknown): string {
    return typeof value === 'string' ? value.toLowerCase() : '';
  }

  private static _containsToken(haystack: string, fragment: string): boolean {
    const escaped = fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const bounded = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`);

    return bounded.test(haystack);
  }

  private static _matches(target: ICoverageTarget, record: ICandidateRecord): boolean {
    const title = CoverageChecker._normalize(record.title);
    const agency = CoverageChecker._normalize(record.agency);
    const titleHit = target.matchTitle.some(fragment =>
      CoverageChecker._containsToken(title, fragment)
    );

    if (!titleHit) {
      return false;
    }

    if (!target.matchAgency || target.matchAgency.length === 0) {
      return true;
    }

    return target.matchAgency.some(fragment => CoverageChecker._containsToken(agency, fragment));
  }

  private static async _postJson(url: string, body: unknown): Promise<unknown> {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  }

  private static async _fetchGrantsGov(keyword: string): Promise<ICandidateRecord[]> {
    const cached = CoverageChecker._grantsCache.get(keyword);

    if (cached) {
      return cached;
    }

    let records: ICandidateRecord[] = [];

    try {
      const payload = (await CoverageChecker._postJson(GRANTS_SEARCH_URL, {
        keyword,
        oppStatuses: 'posted|forecasted',
        rows: 200,
      })) as { data?: { oppHits?: Record<string, unknown>[] } };
      const hits = payload.data?.oppHits ?? [];

      records = hits.map(hit => ({
        id: String(hit['number'] ?? hit['id'] ?? ''),
        title: String(hit['title'] ?? hit['opportunityTitle'] ?? ''),
        agency: `${String(hit['agencyName'] ?? '')} ${String(hit['agencyCode'] ?? '')} ${String(hit['agency'] ?? '')}`,
      }));
    } catch (error) {
      console.log(`  grants.gov probe failed for "${keyword}": ${(error as Error).message}`);
    }

    CoverageChecker._grantsCache.set(keyword, records);

    return records;
  }

  private static async _fetchSbir(keyword: string): Promise<ICandidateRecord[]> {
    const cached = CoverageChecker._sbirCache.get(keyword);

    if (cached) {
      return cached;
    }

    let records: ICandidateRecord[] = [];

    try {
      const url = `${SBIR_SOLICITATIONS_URL}?keyword=${encodeURIComponent(keyword)}&rows=50&format=json`;
      const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = (await response.json()) as Record<string, unknown>[];

      records = (Array.isArray(payload) ? payload : []).map(entry => ({
        id: String(entry['solicitation_number'] ?? entry['solicitation_title'] ?? ''),
        title: String(entry['solicitation_title'] ?? ''),
        agency: `${String(entry['agency'] ?? '')} ${String(entry['branch'] ?? '')}`,
      }));
    } catch (error) {
      CoverageChecker._sbirReachable = false;
      console.log(`  sbir.gov probe failed for "${keyword}": ${(error as Error).message}`);
    }

    CoverageChecker._sbirCache.set(keyword, records);

    return records;
  }

  private static async _fetchUsaSpending(keyword: string): Promise<ICandidateRecord[]> {
    const cached = CoverageChecker._usaSpendingCache.get(keyword);

    if (cached) {
      return cached;
    }

    const records: ICandidateRecord[] = [];

    for (const awardTypeCodes of [CONTRACT_AWARD_TYPE_CODES, GRANT_AWARD_TYPE_CODES]) {
      try {
        const payload = (await CoverageChecker._postJson(USASPENDING_SEARCH_URL, {
          filters: { keywords: [keyword], award_type_codes: awardTypeCodes },
          fields: ['Award ID', 'Recipient Name', 'Awarding Agency', 'Description', 'Award Amount'],
          sort: 'Award Amount',
          order: 'desc',
          page: 1,
          limit: 50,
        })) as { results?: Record<string, unknown>[] };
        const results = payload.results ?? [];

        for (const result of results) {
          records.push({
            id: String(result['Award ID'] ?? ''),
            title: String(result['Description'] ?? ''),
            agency: String(result['Awarding Agency'] ?? ''),
          });
        }
      } catch (error) {
        console.log(`  usaspending probe failed for "${keyword}": ${(error as Error).message}`);
      }
    }

    CoverageChecker._usaSpendingCache.set(keyword, records);

    return records;
  }

  private static async _probeSources(target: ICoverageTarget): Promise<ICoverageResult> {
    for (const keyword of target.matchTitle) {
      const grantsHits = await CoverageChecker._fetchGrantsGov(keyword);
      const grantsMatch = grantsHits.find(record => CoverageChecker._matches(target, record));

      if (grantsMatch) {
        return { target, present: true, foundIn: `grants.gov ${grantsMatch.id}` };
      }

      const sbirHits = await CoverageChecker._fetchSbir(keyword);
      const sbirMatch = sbirHits.find(record => CoverageChecker._matches(target, record));

      if (sbirMatch) {
        return { target, present: true, foundIn: `sbir.gov ${sbirMatch.id}` };
      }

      const spendingHits = await CoverageChecker._fetchUsaSpending(keyword);
      const spendingMatch = spendingHits.find(record => CoverageChecker._matches(target, record));

      if (spendingMatch) {
        return { target, present: true, foundIn: `usaspending:awards ${spendingMatch.id}` };
      }
    }

    return { target, present: false, foundIn: '—' };
  }

  private static async _loadCorpus(): Promise<ICandidateRecord[]> {
    const snapshot = await AdminHelper.getDb().collection(CORPUS_COLLECTION).get();

    return snapshot.docs.map(doc => {
      const data = doc.data();

      return {
        id: doc.id,
        title: String(data['title'] ?? ''),
        agency: `${String(data['agency'] ?? '')} ${String(data['agencyCode'] ?? '')}`,
      };
    });
  }

  private static _renderTable(results: ICoverageResult[]): void {
    const header = ['TARGET', 'PRIORITY', 'PRESENT', 'FOUND IN', 'IMPACT IF MISSING'];
    const rows = results.map(result => [
      result.target.label,
      result.target.priority,
      result.present ? '✅' : '❌',
      result.foundIn,
      result.present
        ? 'ok'
        : `MISSING → breaks ${result.target.cases.map(caseNumber => `Case ${caseNumber}`).join(', ')}`,
    ]);
    const widths = header.map((column, index) =>
      Math.max(column.length, ...rows.map(row => row[index].length))
    );
    const renderRow = (cells: string[]): string =>
      cells.map((cell, index) => cell.padEnd(widths[index])).join('  ');

    console.log('');
    console.log(renderRow(header));
    console.log(widths.map(width => '-'.repeat(width)).join('  '));

    for (const row of rows) {
      console.log(renderRow(row));
    }
  }

  private static _summarize(mode: string, results: ICoverageResult[]): number {
    const missingMust = results.filter(
      result => !result.present && result.target.priority === 'must'
    );
    const missingShould = results.filter(
      result => !result.present && result.target.priority === 'should'
    );
    const brokenCases = new Set<number>();

    for (const result of missingMust) {
      for (const caseNumber of result.target.cases) {
        brokenCases.add(caseNumber);
      }
    }

    const presentCount = results.filter(result => result.present).length;

    console.log('');
    console.log(
      `[${mode}] ${presentCount}/${results.length} targets present · ${missingMust.length} must missing · ${missingShould.length} should missing`
    );

    if (brokenCases.size > 0) {
      const caseList = [...brokenCases]
        .sort((first, second) => first - second)
        .map(caseNumber => `Case ${caseNumber}`)
        .join(', ');

      console.log(`[${mode}] Cases at risk from missing MUST targets: ${caseList}`);
      console.log(
        `[${mode}] Fix next: ${missingMust.map(result => result.target.label).join(', ')}`
      );
    } else {
      console.log(`[${mode}] All must-have targets covered.`);
    }

    const awardHistoryOnly = results.filter(result => result.foundIn.startsWith('usaspending'));

    if (awardHistoryOnly.length > 0) {
      console.log(
        `[${mode}] Award-history only (no live solicitation, needs a curated seed record): ${awardHistoryOnly
          .map(result => result.target.label)
          .join(', ')}`
      );
    }

    if (mode === 'sources' && !CoverageChecker._sbirReachable) {
      console.log(
        '[sources] NOTE: sbir.gov was unreachable during this run — SBIR solicitations cannot be supplied live and must come from curated seed records.'
      );
    }

    return missingMust.length > 0 ? 1 : 0;
  }

  public static async runSources(): Promise<number> {
    console.log('Probing live sources (grants.gov · sbir.gov · usaspending) …');

    const results: ICoverageResult[] = [];

    for (const target of COVERAGE_TARGETS) {
      results.push(await CoverageChecker._probeSources(target));
    }

    CoverageChecker._renderTable(results);

    return CoverageChecker._summarize('sources', results);
  }

  public static async runCorpus(): Promise<number> {
    console.log(`Reading ${CORPUS_COLLECTION} from ${AdminHelper.getProjectId()} …`);

    let corpus: ICandidateRecord[] = [];

    try {
      corpus = await CoverageChecker._loadCorpus();
    } catch (error) {
      console.log(`[corpus] Could not read Firestore: ${(error as Error).message}`);
      console.log('[corpus] Run `firebase login` or set GOOGLE_APPLICATION_CREDENTIALS, then retry.');

      return 1;
    }

    console.log(`Loaded ${corpus.length} corpus documents.`);

    const results: ICoverageResult[] = COVERAGE_TARGETS.map(target => {
      const match = corpus.find(record => CoverageChecker._matches(target, record));

      return { target, present: Boolean(match), foundIn: match ? `corpus/${match.id}` : '—' };
    });

    CoverageChecker._renderTable(results);

    return CoverageChecker._summarize('corpus', results);
  }
}

async function main(): Promise<void> {
  const wantsCorpus = process.argv.includes('--corpus');
  const wantsSources = process.argv.includes('--sources') || !wantsCorpus;
  let exitCode = 0;

  if (wantsSources) {
    exitCode = Math.max(exitCode, await CoverageChecker.runSources());
  }

  if (wantsCorpus) {
    exitCode = Math.max(exitCode, await CoverageChecker.runCorpus());
  }

  process.exit(exitCode);
}

void main().catch((error: Error) => {
  console.log(`check-coverage failed: ${error.message}`);
  process.exit(1);
});
