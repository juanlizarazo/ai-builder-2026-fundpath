import { Firestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';

import { IStartupProfile, IUtahResource, IUtahResourceMatch } from '../firestore';
import {
  DIRECTORY_INDUSTRY_TO_VERTICAL_SLUGS,
  DIRECTORY_NEED_VOCABULARY,
  PROFILE_NEED_TRIGGERS,
  RESOURCE_MATCH_LIMITS,
  RESOURCE_RELEVANCE_KEYWORDS,
  RESOURCE_TITLE_EXCLUSIONS,
  RURAL_UTAH_COUNTIES,
  UTAH_CITY_TO_COUNTY,
  VERTICAL_SLUG_LABELS,
  VERTICAL_SLUG_TO_DIRECTORY_INDUSTRIES,
} from './intelligence.constants';

interface IResourceCandidate {
  id: string;
  resource: IUtahResource;
  score: number;
  reason: string;
  category: string;
  countyMatched: boolean;
  industryMatched: boolean;
  needMatched: boolean;
}

interface IResourceRelevance {
  weight: number;
  reason: string;
  category: string;
}

const RESOURCES_COLLECTION = 'utahResources';

export class ResourcesHelper {
  public static async match(db: Firestore, profile: IStartupProfile): Promise<IUtahResourceMatch[]> {
    try {
      const snapshot = await db.collection(RESOURCES_COLLECTION).get();

      if (snapshot.empty) {
        return [];
      }

      const county = ResourcesHelper._resolveCounty(profile);
      const verticalSlug = ResourcesHelper._resolveVerticalSlug(profile);
      const wantedIndustries = ResourcesHelper._wantedIndustries(verticalSlug);
      const wantedNeeds = ResourcesHelper._wantedNeeds(profile);
      const ownershipSignals = (profile.ownershipSignals ?? []).map((signal) => signal.toLowerCase());
      const candidates: IResourceCandidate[] = [];

      for (const doc of snapshot.docs) {
        const resource = doc.data() as IUtahResource;
        const candidate = ResourcesHelper._evaluate(
          doc.id,
          resource,
          county,
          verticalSlug,
          wantedIndustries,
          wantedNeeds,
          ownershipSignals,
          profile.hasRdCore === true,
        );

        if (candidate) {
          candidates.push(candidate);
        }
      }

      return ResourcesHelper._selectDiverse(candidates).map((candidate) =>
        ResourcesHelper._toMatch(candidate, county, verticalSlug, profile),
      );
    } catch (err) {
      logger.error('Utah resource match failed', { error: (err as Error).message, uid: profile.uid });

      return [];
    }
  }

  private static _selectDiverse(candidates: IResourceCandidate[]): IResourceCandidate[] {
    const ranked = [...candidates].sort((first, second) => {
      if (second.score !== first.score) {
        return second.score - first.score;
      }

      return first.resource.title.localeCompare(second.resource.title);
    });
    const perCategory = new Map<string, number>();
    const selected: IResourceCandidate[] = [];

    for (const candidate of ranked) {
      const used = perCategory.get(candidate.category) ?? 0;

      if (used >= RESOURCE_MATCH_LIMITS.maximumPerCategory) {
        continue;
      }

      perCategory.set(candidate.category, used + 1);
      selected.push(candidate);

      if (selected.length >= RESOURCE_MATCH_LIMITS.maximumResults) {
        break;
      }
    }

    return selected;
  }

  private static _evaluate(
    id: string,
    resource: IUtahResource,
    county: string | null,
    verticalSlug: string,
    wantedIndustries: Set<string>,
    wantedNeeds: string[],
    ownershipSignals: string[],
    hasRdCore: boolean,
  ): IResourceCandidate | null {
    const title = (resource.title ?? '').trim();

    if (title.length === 0 || (resource.link ?? '').length === 0) {
      return null;
    }

    if (ResourcesHelper._isExcludedTitle(title)) {
      return null;
    }

    const relevance = ResourcesHelper._relevance(title, verticalSlug, ownershipSignals, hasRdCore);

    if (!relevance) {
      return null;
    }

    const counties = resource.counties ?? [];
    const servesStatewide = counties.length === 0;
    const countyMatched = county !== null && counties.some((entry) => ResourcesHelper._sameCounty(entry, county));

    if (county !== null && !servesStatewide && !countyMatched) {
      return null;
    }

    const industries = resource.industries ?? [];
    const industryMatched = industries.some((entry) => wantedIndustries.has(ResourcesHelper._normalize(entry)));

    if (industries.length > 0 && !industryMatched) {
      return null;
    }

    const needs = resource.needs ?? [];
    const needMatched = needs.some((entry) => wantedNeeds.includes(entry.toLowerCase()));
    const isRural = county !== null && RURAL_UTAH_COUNTIES.some((entry) => ResourcesHelper._sameCounty(entry, county));
    const score =
      relevance.weight +
      (countyMatched ? RESOURCE_MATCH_LIMITS.countyScore : RESOURCE_MATCH_LIMITS.statewideScore) +
      (industryMatched ? RESOURCE_MATCH_LIMITS.industryScore : 0) +
      (needMatched ? RESOURCE_MATCH_LIMITS.needScore : 0) +
      (isRural && counties.length > 0 && counties.length < RURAL_UTAH_COUNTIES.length ? RESOURCE_MATCH_LIMITS.ruralBonus : 0);

    if (score < RESOURCE_MATCH_LIMITS.minimumRelevanceScore) {
      return null;
    }

    return {
      id,
      resource,
      score,
      reason: relevance.reason,
      category: relevance.category,
      countyMatched,
      industryMatched,
      needMatched,
    };
  }

  private static _relevance(
    title: string,
    verticalSlug: string,
    ownershipSignals: string[],
    hasRdCore: boolean,
  ): IResourceRelevance | null {
    const normalizedTitle = ResourcesHelper._normalize(title);
    let best: IResourceRelevance | null = null;

    for (const [keyword, entry] of Object.entries(RESOURCE_RELEVANCE_KEYWORDS)) {
      if (!normalizedTitle.includes(ResourcesHelper._normalize(keyword))) {
        continue;
      }

      if (entry.verticalSlugs && !entry.verticalSlugs.includes(verticalSlug)) {
        continue;
      }

      if (entry.ownershipSignals && !ResourcesHelper._hasOwnershipSignal(entry.ownershipSignals, ownershipSignals)) {
        continue;
      }

      const weight =
        entry.weight +
        (entry.verticalSlugs ? RESOURCE_MATCH_LIMITS.verticalBonus : 0) -
        (entry.requiresRdCore && !hasRdCore ? RESOURCE_MATCH_LIMITS.missingRdCorePenalty : 0);

      if (!best || weight > best.weight) {
        best = { weight, reason: entry.reason, category: entry.category };
      }
    }

    return best;
  }

  private static _isExcludedTitle(title: string): boolean {
    const normalized = ` ${ResourcesHelper._normalize(title)} `;

    return RESOURCE_TITLE_EXCLUSIONS.some((entry) => normalized.includes(` ${ResourcesHelper._normalize(entry)} `));
  }

  private static _hasOwnershipSignal(expected: string[], actual: string[]): boolean {
    return actual.some((signal) => expected.some((candidate) => signal.includes(candidate) || candidate.includes(signal)));
  }

  private static _toMatch(
    candidate: IResourceCandidate,
    county: string | null,
    verticalSlug: string,
    profile: IStartupProfile,
  ): IUtahResourceMatch {
    return {
      id: candidate.id,
      title: candidate.resource.title,
      description: candidate.resource.description ?? '',
      link: candidate.resource.link,
      matchReason: `${candidate.reason} — ${ResourcesHelper._contextClause(candidate, county, verticalSlug, profile)}`,
    };
  }

  private static _contextClause(
    candidate: IResourceCandidate,
    county: string | null,
    verticalSlug: string,
    profile: IStartupProfile,
  ): string {
    const industryLabel = VERTICAL_SLUG_LABELS[verticalSlug] ?? 'early-stage';
    const sizeClause = profile.employees > 0 ? `${profile.employees}-person ` : '';
    const placeClause = candidate.countyMatched && county ? ` in ${county} County` : ' in Utah';
    const subject = `${sizeClause}${industryLabel}`;
    const article = /^[aeiou8]/i.test(subject) ? 'an' : 'a';

    return `you are ${article} ${subject} company${placeClause}`;
  }

  private static _wantedIndustries(verticalSlug: string): Set<string> {
    const mapped = VERTICAL_SLUG_TO_DIRECTORY_INDUSTRIES[verticalSlug] ?? [];
    const wanted = new Set<string>(mapped.map((entry) => ResourcesHelper._normalize(entry)));

    for (const [directoryIndustry, slugs] of Object.entries(DIRECTORY_INDUSTRY_TO_VERTICAL_SLUGS)) {
      if (slugs.includes(verticalSlug)) {
        wanted.add(ResourcesHelper._normalize(directoryIndustry));
      }
    }

    if (wanted.size === 0) {
      wanted.add(ResourcesHelper._normalize('Other'));
    }

    return wanted;
  }

  private static _wantedNeeds(profile: IStartupProfile): string[] {
    const haystack = [
      profile.rawDescription ?? '',
      profile.useOfFunds ?? '',
      ...(profile.technologyKeywords ?? []),
    ]
      .join(' ')
      .toLowerCase();
    const needs: string[] = ['capital'];

    for (const [need, triggers] of Object.entries(PROFILE_NEED_TRIGGERS)) {
      if (triggers.some((trigger) => haystack.includes(trigger))) {
        needs.push(need);
      }
    }

    return [...new Set(needs)].filter((need) => DIRECTORY_NEED_VOCABULARY.includes(need));
  }

  private static _resolveVerticalSlug(profile: IStartupProfile): string {
    const slug = ResourcesHelper._slugify(profile.industry ?? '');

    if (slug.length === 0) {
      return 'other';
    }

    if (VERTICAL_SLUG_TO_DIRECTORY_INDUSTRIES[slug]) {
      return slug;
    }

    return 'other';
  }

  private static _resolveCounty(profile: IStartupProfile): string | null {
    const rawCounty = (profile.location?.county ?? '').trim();

    if (rawCounty.length > 0) {
      return ResourcesHelper._cleanCounty(rawCounty);
    }

    const rawCity = ResourcesHelper._normalize(profile.location?.city ?? '');
    const mapped = UTAH_CITY_TO_COUNTY[rawCity];

    if (mapped) {
      return mapped;
    }

    return null;
  }

  private static _cleanCounty(value: string): string {
    return value
      .replace(/county/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private static _sameCounty(first: string, second: string): boolean {
    return ResourcesHelper._normalize(ResourcesHelper._cleanCounty(first)) === ResourcesHelper._normalize(ResourcesHelper._cleanCounty(second));
  }

  private static _normalize(value: string): string {
    return value
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private static _slugify(value: string): string {
    return value
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
