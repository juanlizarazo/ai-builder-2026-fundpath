import { Firestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { IOpportunity } from '../firestore';
import { IExpansion, IPipelineDrop } from './route.interfaces';
import { RETRIEVAL_LIMITS } from './retrieval.constants';

export class RetrievalService {
  private _cache: IOpportunity[] | null = null;

  private static _sanitizeAwards(opportunity: IOpportunity): IOpportunity {
    const minAward = opportunity.minAward && opportunity.minAward > 0 ? opportunity.minAward : undefined;
    const maxAward = opportunity.maxAward && opportunity.maxAward > 0 ? opportunity.maxAward : undefined;

    return { ...opportunity, minAward, maxAward };
  }

  public static matchesKeyword(haystack: string, keyword: string): boolean {
    const needle = keyword.trim().toLowerCase();

    if (needle.length < 3) {
      return false;
    }

    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(haystack);
  }

  private static _relevance(opportunity: IOpportunity, expansion: IExpansion): number {
    const haystack = `${opportunity.title} ${opportunity.description}`.toLowerCase();
    let keywordHits = 0;

    for (const keyword of expansion.keywords) {
      if (RetrievalService.matchesKeyword(haystack, keyword)) {
        keywordHits++;
      }
    }

    const alns = opportunity.alnAll ?? (opportunity.aln ? [opportunity.aln] : []);
    const agencyMatch =
      alns.some(aln => expansion.agencyPrefixes.includes(aln.split('.')[0])) ||
      (opportunity.agencyCode
        ? expansion.agencyPrefixes.includes(opportunity.agencyCode.substring(0, 2))
        : false);
    const naicsCodes = opportunity.naicsCodes ?? [];
    const naicsOverlap = naicsCodes.some(code => expansion.naicsCodes.includes(code));

    if (naicsCodes.length > 0 && !naicsOverlap && !agencyMatch) {
      return 0;
    }

    const verticallyRelevant = keywordHits > 0 || agencyMatch || naicsOverlap;

    if (!verticallyRelevant) {
      return 0;
    }

    let score = keywordHits;

    if (agencyMatch) {
      score += RETRIEVAL_LIMITS.agencyMatchBonus;
    }

    if (naicsOverlap) {
      score += RETRIEVAL_LIMITS.naicsMatchBonus;
    }

    if (opportunity.isSbir || opportunity.isSttr) {
      score += RETRIEVAL_LIMITS.sbirBonus;
    }

    if (opportunity.source === 'seed' || opportunity.source === 'utah') {
      score += RETRIEVAL_LIMITS.curatedBonus;
    }

    return score;
  }

  public async loadOpenOpportunities(db: Firestore): Promise<IOpportunity[]> {
    if (this._cache) {
      return this._cache;
    }

    const snapshot = await db.collection('corpus').get();
    const opportunities: IOpportunity[] = [];

    for (const doc of snapshot.docs) {
      const data = doc.data() as IOpportunity;

      if (!data.source || !data.title) {
        continue;
      }

      if (data.source === 'usaspending') {
        continue;
      }

      if (data.status !== 'posted' && data.status !== 'forecasted') {
        continue;
      }

      opportunities.push(RetrievalService._sanitizeAwards({ ...data, id: doc.id }));
    }

    logger.info('Corpus loaded', { total: snapshot.size, open: opportunities.length });
    this._cache = opportunities;

    return opportunities;
  }

  public async retrieve(
    db: Firestore,
    expansion: IExpansion,
    drops: IPipelineDrop[],
    deep = false
  ): Promise<IOpportunity[]> {
    const minRelevance = deep ? RETRIEVAL_LIMITS.deepMinRelevance : RETRIEVAL_LIMITS.minRelevance;
    const maxCandidates = deep
      ? RETRIEVAL_LIMITS.deepMaxCandidates
      : RETRIEVAL_LIMITS.maxCandidates;
    const all = await this.loadOpenOpportunities(db);
    const scored = all
      .map(opportunity => ({
        opportunity,
        relevance: RetrievalService._relevance(opportunity, expansion),
      }))
      .sort((left, right) => {
        if (right.relevance !== left.relevance) {
          return right.relevance - left.relevance;
        }

        return left.opportunity.sourceId.localeCompare(right.opportunity.sourceId);
      });

    const isAlwaysAvailable = (opportunity: IOpportunity): boolean =>
      opportunity.placement === 'non-grant' || opportunity.source === 'utah';

    const kept = scored.filter(
      entry =>
        entry.relevance >= minRelevance || isAlwaysAvailable(entry.opportunity)
    );

    for (const entry of scored) {
      if (entry.relevance < minRelevance && !isAlwaysAvailable(entry.opportunity)) {
        drops.push({
          sourceId: entry.opportunity.sourceId,
          title: entry.opportunity.title,
          stage: 'retrieve',
          reason: `relevance ${entry.relevance} below minimum ${minRelevance}`,
        });
      }
    }

    const ranked = kept.filter(entry => !isAlwaysAvailable(entry.opportunity));
    const alwaysAvailable = kept.filter(entry => isAlwaysAvailable(entry.opportunity));
    const limited = [...ranked.slice(0, maxCandidates), ...alwaysAvailable];

    for (const entry of ranked.slice(maxCandidates)) {
      drops.push({
        sourceId: entry.opportunity.sourceId,
        title: entry.opportunity.title,
        stage: 'retrieve',
        reason: `beyond candidate cap of ${maxCandidates}`,
      });
    }

    logger.info('Retrieval complete', {
      considered: all.length,
      kept: kept.length,
      returned: limited.length,
    });

    return limited.map(entry => entry.opportunity);
  }
}
