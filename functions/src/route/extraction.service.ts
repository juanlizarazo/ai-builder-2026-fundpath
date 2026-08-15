import { Timestamp } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { ClaudeService } from '../ai/claude.service';
import { IStartupProfile } from '../firestore';
import { VERTICAL_NAICS_MAP } from './expansion.constants';
import {
  EXTRACTION_DEFAULTS,
  EXTRACTION_STAGE_VALUES,
  EXTRACTION_SYSTEM_PROMPT,
  EXTRACTION_USER_PROMPT_PREFIX,
  MONEY_MULTIPLIERS,
} from './extraction.constants';

export class ExtractionService {
  private readonly _claude = new ClaudeService();

  public async extract(uid: string, description: string): Promise<IStartupProfile> {
    const trimmedDescription = (description ?? '').trim();

    if (!uid || uid.trim().length === 0) {
      throw new Error('Cannot extract a startup profile without a uid.');
    }

    if (trimmedDescription.length === 0) {
      throw new Error('Cannot extract a startup profile from an empty description.');
    }

    const boundedDescription = trimmedDescription.substring(0, EXTRACTION_DEFAULTS.maxDescriptionLength);
    const raw = await this._claude.completeJson<unknown>(
      `${EXTRACTION_USER_PROMPT_PREFIX}${boundedDescription}`,
      EXTRACTION_SYSTEM_PROMPT,
    );

    return this._buildProfile(uid, trimmedDescription, raw);
  }

  private _buildProfile(uid: string, rawDescription: string, raw: unknown): IStartupProfile {
    const extracted = this._asRecord(raw);

    if (!extracted) {
      throw new Error('Profile extraction failed: the model did not return a JSON object.');
    }

    const now = Timestamp.now();
    const industry = this._normalizeIndustry(extracted['industry']);
    const technologyKeywords = this._asStringArray(extracted['technologyKeywords']);
    const ask = this._resolveAsk(extracted);
    const profile: IStartupProfile = {
      uid,
      rawDescription,
      industry,
      technologyKeywords,
      location: this._normalizeLocation(extracted['location']),
      employees: this._asInteger(extracted['employees']) ?? EXTRACTION_DEFAULTS.employees,
      hasRdCore: this._asBoolean(extracted['hasRdCore']) ?? EXTRACTION_DEFAULTS.hasRdCore,
      createdAt: now,
      updatedAt: now,
    };
    const revenueArr = this._parseMoneyValue(extracted['revenueArr']);
    const capitalRaised = this._parseMoneyValue(extracted['capitalRaised']);
    const stage = this._normalizeStage(extracted['stage']);
    const useOfFunds = this._asText(extracted['useOfFunds']);
    const targetCustomer = this._asText(extracted['targetCustomer']);
    const productMaturity = this._asText(extracted['productMaturity']);
    const ownershipSignals = this._asStringArray(extracted['ownershipSignals']);

    if (revenueArr !== undefined) {
      profile.revenueArr = revenueArr;
    }

    if (capitalRaised !== undefined) {
      profile.capitalRaised = capitalRaised;
    }

    if (stage !== undefined) {
      profile.stage = stage;
    }

    if (ask.askMin !== undefined) {
      profile.askMin = ask.askMin;
    }

    if (ask.askMax !== undefined) {
      profile.askMax = ask.askMax;
    }

    if (useOfFunds !== undefined) {
      profile.useOfFunds = useOfFunds;
    }

    if (targetCustomer !== undefined) {
      profile.targetCustomer = targetCustomer;
    }

    if (productMaturity !== undefined) {
      profile.productMaturity = productMaturity;
    }

    if (ownershipSignals.length > 0) {
      profile.ownershipSignals = ownershipSignals;
    }

    logger.info('Extracted startup profile', {
      uid,
      industry: profile.industry,
      employees: profile.employees,
      hasRdCore: profile.hasRdCore,
      hasRdCoreReason: this._asText(extracted['hasRdCoreReason']) ?? 'none',
      askMin: profile.askMin ?? null,
      askMax: profile.askMax ?? null,
      keywordCount: profile.technologyKeywords.length,
    });

    return profile;
  }

  private _resolveAsk(extracted: Record<string, unknown>): { askMin?: number; askMax?: number } {
    const fromRange = this._parseMoneyRange(this._asText(extracted['capitalNeed']));

    if (fromRange.askMin !== undefined || fromRange.askMax !== undefined) {
      return fromRange;
    }

    const explicitMin = this._parseMoneyValue(extracted['askMin']);
    const explicitMax = this._parseMoneyValue(extracted['askMax']);

    if (explicitMin === undefined && explicitMax === undefined) {
      return {};
    }

    const low = explicitMin ?? explicitMax;
    const high = explicitMax ?? explicitMin;

    return {
      askMin: Math.min(low as number, high as number),
      askMax: Math.max(low as number, high as number),
    };
  }

  private _parseMoneyRange(text: string | undefined): { askMin?: number; askMax?: number } {
    if (text === undefined) {
      return {};
    }

    const segments = text
      .split(/\s*(?:–|—|−|-|\bto\b|\bthrough\b|\band\b)\s*/i)
      .map(segment => segment.trim())
      .filter(segment => segment.length > 0);
    const tokens = segments
      .map(segment => this._parseMoneyToken(segment))
      .filter((token): token is { value: number; hadSuffix: boolean } => token !== undefined);

    if (tokens.length === 0) {
      return {};
    }

    if (tokens.length === 1) {
      return { askMin: tokens[0].value, askMax: tokens[0].value };
    }

    const first = tokens[0];
    const second = tokens[1];
    const normalizedFirst =
      !first.hadSuffix && second.hadSuffix && first.value < second.value / 1000
        ? this._applyScaleOf(first.value, second)
        : first.value;
    const low = Math.min(normalizedFirst, second.value);
    const high = Math.max(normalizedFirst, second.value);

    return { askMin: low, askMax: high };
  }

  private _applyScaleOf(value: number, reference: { value: number; hadSuffix: boolean }): number {
    const scale = reference.value >= 1000000000 ? 1000000000 : reference.value >= 1000000 ? 1000000 : 1000;

    return value * scale;
  }

  private _parseMoneyValue(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      return value;
    }

    const text = this._asText(value);

    if (text === undefined) {
      return undefined;
    }

    return this._parseMoneyToken(text)?.value;
  }

  private _parseMoneyToken(text: string): { value: number; hadSuffix: boolean } | undefined {
    const match = text.match(/(\d[\d,]*(?:\.\d+)?)\s*(k|mm|m|b|thousand|million|billion)?/i);

    if (!match) {
      return undefined;
    }

    const magnitude = Number(match[1].replace(/,/g, ''));

    if (!Number.isFinite(magnitude)) {
      return undefined;
    }

    const suffix = match[2] ? match[2].toLowerCase() : '';
    const multiplier = MONEY_MULTIPLIERS[suffix];

    if (multiplier === undefined) {
      return { value: Math.round(magnitude), hadSuffix: false };
    }

    return { value: Math.round(magnitude * multiplier), hadSuffix: true };
  }

  private _normalizeIndustry(value: unknown): string {
    const text = this._asText(value);

    if (text === undefined) {
      return EXTRACTION_DEFAULTS.industry;
    }

    const slug = text
      .toLowerCase()
      .trim()
      .replace(/[\s_/]+/g, '-')
      .replace(/[^a-z0-9-]/g, '');

    if (Object.prototype.hasOwnProperty.call(VERTICAL_NAICS_MAP, slug)) {
      return slug;
    }

    logger.warn('Extraction returned an unmapped industry slug; defaulting', {
      returned: text,
      fallback: EXTRACTION_DEFAULTS.industry,
    });

    return EXTRACTION_DEFAULTS.industry;
  }

  private _normalizeLocation(value: unknown): { state: string; county?: string; city?: string } {
    const record = this._asRecord(value);
    const location: { state: string; county?: string; city?: string } = { state: EXTRACTION_DEFAULTS.state };

    if (!record) {
      return location;
    }

    const state = this._asText(record['state']);
    const county = this._asText(record['county']);
    const city = this._asText(record['city']);

    if (state !== undefined) {
      location.state = this._normalizeStateCode(state);
    }

    if (county !== undefined) {
      location.county = county.replace(/\s+county$/i, '').trim();
    }

    if (city !== undefined) {
      location.city = city;
    }

    return location;
  }

  private _normalizeStateCode(state: string): string {
    const trimmed = state.trim();

    if (trimmed.length === 2) {
      return trimmed.toUpperCase();
    }

    if (trimmed.toLowerCase() === 'utah') {
      return EXTRACTION_DEFAULTS.state;
    }

    return trimmed;
  }

  private _normalizeStage(value: unknown): IStartupProfile['stage'] | undefined {
    const text = this._asText(value);

    if (text === undefined) {
      return undefined;
    }

    const slug = text.toLowerCase().trim().replace(/\s+/g, '-');

    if (!EXTRACTION_STAGE_VALUES.includes(slug)) {
      return undefined;
    }

    return slug as IStartupProfile['stage'];
  }

  private _asRecord(value: unknown): Record<string, unknown> | undefined {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return undefined;
    }

    return value as Record<string, unknown>;
  }

  private _asText(value: unknown): string | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }

    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();

    if (trimmed.length === 0 || trimmed.toLowerCase() === 'null' || trimmed.toLowerCase() === 'unknown') {
      return undefined;
    }

    return trimmed;
  }

  private _asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const seen = new Set<string>();
    const result: string[] = [];

    for (const entry of value) {
      const text = this._asText(entry);

      if (text !== undefined && !seen.has(text.toLowerCase())) {
        seen.add(text.toLowerCase());
        result.push(text);
      }
    }

    return result;
  }

  private _asInteger(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      return Math.round(value);
    }

    const text = this._asText(value);

    if (text === undefined) {
      return undefined;
    }

    const parsed = Number(text.replace(/,/g, ''));

    if (!Number.isFinite(parsed) || parsed < 0) {
      return undefined;
    }

    return Math.round(parsed);
  }

  private _asBoolean(value: unknown): boolean | undefined {
    if (typeof value === 'boolean') {
      return value;
    }

    const text = this._asText(value);

    if (text === undefined) {
      return undefined;
    }

    const lowered = text.toLowerCase();

    if (lowered === 'true' || lowered === 'yes') {
      return true;
    }

    if (lowered === 'false' || lowered === 'no') {
      return false;
    }

    return undefined;
  }
}
