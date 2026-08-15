import { Firestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';

import { IHistoricalProof, IOpportunity } from '../firestore';
import {
  AGENCY_STOPWORD_TOKENS,
  AWARD_SANITY_BAND,
  HISTORICAL_EVIDENCE_THRESHOLDS,
  HISTORICAL_QUERY,
  MEGAPRIME_RECIPIENT_BLOCKLIST,
  NON_COMPANY_RECIPIENT_MARKERS,
  RECIPIENT_NAME_ACRONYMS,
  RECIPIENT_NAME_LEGAL_SUFFIXES,
  RECIPIENT_NAME_SHORT_TOKEN_LENGTH,
  UTAH_SCOPED_AWARD_SOURCES,
} from './intelligence.constants';
import { IExpansion } from './route.interfaces';

interface IAwardCacheEntry {
  fetchedAtMs: number;
  awards: Promise<IOpportunity[]>;
}

interface IScopedAward {
  award: IOpportunity;
  verticalMatch: boolean;
  agencyMatch: boolean;
  amount: number;
}

const awardCache = new Map<string, IAwardCacheEntry>();

export class HistoricalHelper {
  public static async proofFor(
    db: Firestore,
    expansion: IExpansion,
    opportunity: IOpportunity,
  ): Promise<IHistoricalProof | undefined> {
    try {
      const awards = await HistoricalHelper._loadAwards(db);

      if (awards.length === 0) {
        return undefined;
      }

      const verticalCodes = new Set((expansion.naicsCodes ?? []).filter((code) => code.length > 0));
      const agencyTokens = HistoricalHelper._agencyTokens(opportunity.agency);

      if (verticalCodes.size === 0 && agencyTokens.length === 0) {
        return undefined;
      }

      const scoped: IScopedAward[] = [];

      for (const award of awards) {
        const amount = HistoricalHelper._amountOf(award);

        if (amount === null) {
          continue;
        }

        const recipientName = (award.recipientName ?? '').trim();

        if (recipientName.length === 0 || HistoricalHelper._isMegaprime(recipientName)) {
          continue;
        }

        const verticalMatch = (award.naicsCodes ?? []).some((code) => verticalCodes.has(code));
        const agencyMatch = HistoricalHelper._agencyMatches(agencyTokens, award.agency);

        if (!verticalMatch && !agencyMatch) {
          continue;
        }

        scoped.push({ award, verticalMatch, agencyMatch, amount });
      }

      if (scoped.length < HISTORICAL_EVIDENCE_THRESHOLDS.minimumScopedAwards) {
        return undefined;
      }

      const amounts = scoped.map((entry) => entry.amount);
      const proof: IHistoricalProof = {
        totalDollars: Math.round(amounts.reduce((sum, amount) => sum + amount, 0)),
        medianAward: HistoricalHelper._median(amounts),
        countTotal: scoped.length,
        countUtah: scoped.filter((entry) => HistoricalHelper._isUtahScoped(entry.award)).length,
        countVertical: scoped.filter((entry) => entry.verticalMatch).length,
        namedWinners: HistoricalHelper._namedWinners(scoped),
      };

      return proof;
    } catch (err) {
      logger.error('Historical proof failed', {
        error: (err as Error).message,
        opportunityId: opportunity.sourceId,
      });

      return undefined;
    }
  }

  public static resetCache(): void {
    awardCache.clear();
  }

  private static async _loadAwards(db: Firestore): Promise<IOpportunity[]> {
    const cacheKey = `${HISTORICAL_QUERY.source}:${HISTORICAL_QUERY.status}`;
    const cached = awardCache.get(cacheKey);
    const nowMs = Date.now();

    if (cached && nowMs - cached.fetchedAtMs < HISTORICAL_QUERY.cacheTtlMs) {
      return cached.awards;
    }

    const pending = HistoricalHelper._fetchAwards(db);

    awardCache.set(cacheKey, { fetchedAtMs: nowMs, awards: pending });

    const awards = await pending;

    if (awards.length === 0) {
      awardCache.delete(cacheKey);
    }

    return awards;
  }

  private static async _fetchAwards(db: Firestore): Promise<IOpportunity[]> {
    try {
      const snapshot = await db
        .collection(HISTORICAL_QUERY.collection)
        .where('source', '==', HISTORICAL_QUERY.source)
        .where('status', '==', HISTORICAL_QUERY.status)
        .limit(HISTORICAL_QUERY.scanLimit)
        .get();

      return snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as IOpportunity) }));
    } catch (err) {
      logger.error('Historical award query failed', { error: (err as Error).message });

      return [];
    }
  }

  private static _amountOf(award: IOpportunity): number | null {
    const raw = award.awardAmount ?? award.maxAward ?? award.minAward;

    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      return null;
    }

    if (raw < AWARD_SANITY_BAND.minimumAward || raw > AWARD_SANITY_BAND.maximumAward) {
      return null;
    }

    return raw;
  }

  private static _isUtahScoped(award: IOpportunity): boolean {
    return UTAH_SCOPED_AWARD_SOURCES.includes(award.source);
  }

  private static _isMegaprime(recipientName: string): boolean {
    const normalized = recipientName.toLowerCase();

    return MEGAPRIME_RECIPIENT_BLOCKLIST.some((entry) => normalized.includes(entry));
  }

  private static _isNonCompany(recipientName: string): boolean {
    const normalized = ` ${recipientName.toLowerCase()} `;

    return NON_COMPANY_RECIPIENT_MARKERS.some((marker) => normalized.includes(marker));
  }

  private static _namedWinners(scoped: IScopedAward[]): string[] {
    const ranked = [...scoped]
      .filter((entry) => !HistoricalHelper._isNonCompany(entry.award.recipientName ?? ''))
      .sort((first, second) => {
        const verticalDelta = Number(second.verticalMatch) - Number(first.verticalMatch);

        if (verticalDelta !== 0) {
          return verticalDelta;
        }

        const agencyDelta = Number(second.agencyMatch) - Number(first.agencyMatch);

        if (agencyDelta !== 0) {
          return agencyDelta;
        }

        const yearDelta = (second.award.awardYear ?? 0) - (first.award.awardYear ?? 0);

        if (yearDelta !== 0) {
          return yearDelta;
        }

        return second.amount - first.amount;
      });
    const seen = new Set<string>();
    const winners: string[] = [];

    for (const entry of ranked) {
      const recipientName = (entry.award.recipientName ?? '').trim();
      const key = recipientName.toLowerCase().replace(/[^a-z0-9]+/g, '');

      if (key.length === 0 || seen.has(key)) {
        continue;
      }

      seen.add(key);
      winners.push(HistoricalHelper._prettyName(recipientName));

      if (winners.length >= HISTORICAL_EVIDENCE_THRESHOLDS.maximumNamedWinners) {
        break;
      }
    }

    return winners;
  }

  private static _prettyName(recipientName: string): string {
    if (recipientName !== recipientName.toUpperCase()) {
      return recipientName;
    }

    return recipientName
      .toLowerCase()
      .split(' ')
      .map((word) => {
        if (word.length === 0) {
          return word;
        }

        const bare = word.replace(/[,.]+$/, '');

        if (RECIPIENT_NAME_LEGAL_SUFFIXES.includes(bare)) {
          return word.charAt(0).toUpperCase() + word.slice(1);
        }

        if (RECIPIENT_NAME_ACRONYMS.includes(bare) || bare.length <= RECIPIENT_NAME_SHORT_TOKEN_LENGTH) {
          return word.toUpperCase();
        }

        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(' ');
  }

  private static _agencyTokens(agency: string | undefined): string[] {
    if (!agency) {
      return [];
    }

    return agency
      .toLowerCase()
      .replace(/[^a-z0-9\s]+/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 2 && !AGENCY_STOPWORD_TOKENS.includes(token));
  }

  private static _agencyMatches(agencyTokens: string[], awardAgency: string | undefined): boolean {
    if (agencyTokens.length === 0) {
      return false;
    }

    const awardTokens = HistoricalHelper._agencyTokens(awardAgency);

    if (awardTokens.length === 0) {
      return false;
    }

    const awardTokenSet = new Set(awardTokens);

    return agencyTokens.some((token) => awardTokenSet.has(token));
  }

  private static _median(values: number[]): number {
    const sorted = [...values].sort((first, second) => first - second);
    const middle = Math.floor(sorted.length / 2);

    if (sorted.length === 0) {
      return 0;
    }

    if (sorted.length % 2 === 1) {
      return Math.round(sorted[middle]);
    }

    return Math.round((sorted[middle - 1] + sorted[middle]) / 2);
  }
}
