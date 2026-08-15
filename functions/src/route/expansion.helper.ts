import { IStartupProfile } from '../firestore';
import { IExpansion } from './route.interfaces';
import { VERTICAL_NAICS_MAP, AGENCY_ALN_PREFIXES } from './expansion.constants';
import { INDUSTRY_SLUG_ALIASES, VERTICAL_AGENCY_PREFIXES, STOPWORDS } from './expansion.aliases';

export class ExpansionHelper {
  private static _normalize(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  public static slugIndustry(industry: string, technologyKeywords: string[] = []): string {
    const slug = ExpansionHelper._normalize(industry);

    if (VERTICAL_NAICS_MAP[slug]) {
      return slug;
    }

    if (INDUSTRY_SLUG_ALIASES[slug]) {
      return INDUSTRY_SLUG_ALIASES[slug];
    }

    const haystack = `${slug} ${technologyKeywords.map(ExpansionHelper._normalize).join(' ')}`;

    for (const [alias, target] of Object.entries(INDUSTRY_SLUG_ALIASES)) {
      if (haystack.includes(alias)) {
        return target;
      }
    }

    for (const key of Object.keys(VERTICAL_NAICS_MAP)) {
      if (key !== 'other' && haystack.includes(key)) {
        return key;
      }
    }

    return 'other';
  }

  public static keywordsFor(profile: IStartupProfile): string[] {
    const raw = [
      ...profile.technologyKeywords,
      ...(profile.useOfFunds ? profile.useOfFunds.split(/\s+/) : []),
      ...(profile.targetCustomer ? profile.targetCustomer.split(/\s+/) : []),
      profile.industry,
    ];

    const cleaned = raw
      .map(token => token.toLowerCase().replace(/[^a-z0-9+#.-]/g, ''))
      .filter(token => token.length > 2 && !STOPWORDS.has(token));

    return [...new Set(cleaned)];
  }

  public static expand(profile: IStartupProfile): IExpansion {
    const verticalSlug = ExpansionHelper.slugIndustry(profile.industry, profile.technologyKeywords);
    const agencyPrefixes = VERTICAL_AGENCY_PREFIXES[verticalSlug] ?? Object.values(AGENCY_ALN_PREFIXES);

    return {
      verticalSlug,
      naicsCodes: VERTICAL_NAICS_MAP[verticalSlug] ?? VERTICAL_NAICS_MAP['other'],
      agencyPrefixes,
      keywords: ExpansionHelper.keywordsFor(profile),
    };
  }
}
