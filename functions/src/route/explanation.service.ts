import * as logger from 'firebase-functions/logger';
import { ClaudeService } from '../ai/claude.service';
import { IStartupProfile, IStop } from '../firestore';
import {
  EXPLANATION_FALLBACK,
  EXPLANATION_LIMITS,
  EXPLANATION_SYSTEM_PROMPT,
  EXPLANATION_USER_PROMPT_PREFIX,
  FEDERAL_REGISTRATION_SIGNALS,
  SAM_REGISTRATION_TIP,
} from './explanation.constants';
import {
  IExplanationProfilePayload,
  IExplanationRequestPayload,
  IExplanationStopPayload,
  IStopExplanation,
} from './explanation.interfaces';

export class ExplanationService {
  private readonly _claude = new ClaudeService();

  public async explain(profile: IStartupProfile, stops: IStop[]): Promise<Map<string, IStopExplanation>> {
    const explanations = new Map<string, IStopExplanation>();

    if (stops.length === 0) {
      return explanations;
    }

    const hasExistingFederalRegistration = this._detectFederalRegistration(profile);
    const payload: IExplanationRequestPayload = {
      profile: this._buildProfilePayload(profile, hasExistingFederalRegistration),
      stops: stops.map(stop => this._buildStopPayload(stop, hasExistingFederalRegistration)),
    };
    const modelEntries = await this._requestExplanations(payload);
    const stopsById = new Map<string, IStop>(stops.map(stop => [stop.id, stop]));
    const unknownStopIds: string[] = [];

    for (const entry of modelEntries) {
      const candidate = this._sanitizeEntry(entry);

      if (!candidate) {
        continue;
      }

      const stop = stopsById.get(candidate.stopId);

      if (!stop) {
        unknownStopIds.push(candidate.stopId);
        continue;
      }

      explanations.set(stop.id, {
        stopId: stop.id,
        whyFit: this._normalizeTeaser(candidate.whyFit, stop),
        whyIneligible: candidate.whyIneligible,
        whatToVerify: candidate.whatToVerify,
        whatToDoNext: candidate.whatToDoNext,
      });
    }

    if (unknownStopIds.length > 0) {
      logger.warn('Explanation model returned stop ids that were not requested; discarding', {
        unknownStopIds,
      });
    }

    const fallbackStopIds: string[] = [];

    for (const stop of stops) {
      if (!explanations.has(stop.id)) {
        fallbackStopIds.push(stop.id);
        explanations.set(stop.id, this._buildFallback(profile, stop, hasExistingFederalRegistration));
      }
    }

    if (fallbackStopIds.length > 0) {
      logger.warn('Falling back to deterministic explanations', {
        fallbackStopIds,
        fallbackCount: fallbackStopIds.length,
        totalStops: stops.length,
      });
    }

    return explanations;
  }

  private async _requestExplanations(payload: IExplanationRequestPayload): Promise<unknown[]> {
    try {
      const raw = await this._claude.completeJson<unknown>(
        `${EXPLANATION_USER_PROMPT_PREFIX}${JSON.stringify(payload)}`,
        EXPLANATION_SYSTEM_PROMPT,
      );

      return this._asEntryArray(raw);
    } catch (error) {
      logger.error('Explanation batch call failed; every stop will use its deterministic fallback', {
        error: (error as Error).message,
        stopCount: payload.stops.length,
      });

      return [];
    }
  }

  private _asEntryArray(raw: unknown): unknown[] {
    if (Array.isArray(raw)) {
      return raw;
    }

    if (typeof raw === 'object' && raw !== null) {
      const wrapper = raw as Record<string, unknown>;

      for (const key of ['explanations', 'stops', 'results', 'data']) {
        const nested = wrapper[key];

        if (Array.isArray(nested)) {
          return nested;
        }
      }
    }

    logger.warn('Explanation model returned a shape that was not a JSON array');

    return [];
  }

  private _sanitizeEntry(entry: unknown): IStopExplanation | undefined {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      return undefined;
    }

    const record = entry as Record<string, unknown>;
    const stopId = this._asProse(record['stopId']);
    const whyFit = this._asProse(record['whyFit']);
    const whyIneligible = this._asProse(record['whyIneligible']);
    const whatToVerify = this._asProse(record['whatToVerify']);
    const whatToDoNext = this._asProse(record['whatToDoNext']);

    if (!stopId || !whyFit || !whyIneligible || !whatToVerify || !whatToDoNext) {
      return undefined;
    }

    return { stopId, whyFit, whyIneligible, whatToVerify, whatToDoNext };
  }

  private _asProse(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
      return undefined;
    }

    return trimmed;
  }

  private _normalizeTeaser(whyFit: string, stop: IStop): string {
    const leadIn = /^(this program|this opportunity|this grant|this solicitation)\b/i;

    if (!leadIn.test(whyFit)) {
      return whyFit;
    }

    return whyFit.replace(leadIn, stop.title);
  }

  private _detectFederalRegistration(profile: IStartupProfile): boolean {
    const haystack = `${profile.rawDescription} ${profile.productMaturity ?? ''}`.toLowerCase();

    return FEDERAL_REGISTRATION_SIGNALS.some(signal => haystack.includes(signal));
  }

  private _buildProfilePayload(
    profile: IStartupProfile,
    hasExistingFederalRegistration: boolean,
  ): IExplanationProfilePayload {
    const payload: IExplanationProfilePayload = {
      industry: profile.industry,
      technologyKeywords: profile.technologyKeywords.slice(0, EXPLANATION_LIMITS.maxKeywords),
      location: profile.location,
      employees: profile.employees,
      hasRdCore: profile.hasRdCore,
      ownershipSignals: (profile.ownershipSignals ?? []).slice(0, EXPLANATION_LIMITS.maxOwnershipSignals),
      hasExistingFederalRegistration,
    };

    if (profile.revenueArr !== undefined) {
      payload.revenueArr = profile.revenueArr;
    }

    if (profile.stage !== undefined) {
      payload.stage = profile.stage;
    }

    if (profile.capitalRaised !== undefined) {
      payload.capitalRaised = profile.capitalRaised;
    }

    if (profile.askMin !== undefined) {
      payload.askMin = profile.askMin;
    }

    if (profile.askMax !== undefined) {
      payload.askMax = profile.askMax;
    }

    if (profile.useOfFunds !== undefined) {
      payload.useOfFunds = profile.useOfFunds;
    }

    if (profile.targetCustomer !== undefined) {
      payload.targetCustomer = profile.targetCustomer;
    }

    if (profile.productMaturity !== undefined) {
      payload.productMaturity = profile.productMaturity;
    }

    return payload;
  }

  private _buildStopPayload(stop: IStop, hasExistingFederalRegistration: boolean): IExplanationStopPayload {
    const isFederalProgram = this._isFederalProgram(stop);
    const payload: IExplanationStopPayload = {
      stopId: stop.id,
      title: stop.title,
      agency: stop.agency,
      fitTier: stop.fitTier,
      fitTierLabel: stop.fitTierLabel,
      isSbir: stop.isSbir === true,
      isSttr: stop.isSttr === true,
      isFederalProgram,
      needsSamRegistrationTip: isFederalProgram && !hasExistingFederalRegistration,
      eligibilityFlags: stop.eligibilityFlags.slice(0, EXPLANATION_LIMITS.maxFlagsPerStop).map(flag => ({
        code: flag.code,
        severity: flag.severity,
        message: flag.message,
      })),
    };

    if (stop.aln !== undefined) {
      payload.aln = stop.aln;
    }

    if (stop.minAward !== undefined) {
      payload.minAward = stop.minAward;
    }

    if (stop.maxAward !== undefined) {
      payload.maxAward = stop.maxAward;
    }

    return payload;
  }

  private _isFederalProgram(stop: IStop): boolean {
    if (stop.placement === 'non-grant') {
      return false;
    }

    return stop.isSbir === true || stop.isSttr === true || stop.aln !== undefined;
  }

  private _buildFallback(
    profile: IStartupProfile,
    stop: IStop,
    hasExistingFederalRegistration: boolean,
  ): IStopExplanation {
    const blockingMessages = this._flagMessages(stop, ['block']);
    const warningMessages = this._flagMessages(stop, ['warn']);
    const infoMessages = this._flagMessages(stop, ['info']);
    const whyFit = `${stop.title} at ${stop.agency} was ranked ${stop.fitTierLabel} for your ${profile.industry} profile by our eligibility rules. ${EXPLANATION_FALLBACK.unavailableNote}`;
    const concerns = [...blockingMessages, ...warningMessages];
    const whyIneligible = concerns.length > 0 ? concerns.join(' ') : EXPLANATION_FALLBACK.noBlockingFlags;
    const whatToVerify =
      infoMessages.length > 0
        ? `${infoMessages.join(' ')} ${EXPLANATION_FALLBACK.verifyDefault}`
        : EXPLANATION_FALLBACK.verifyDefault;
    const nextSteps = [`Open the official page for ${stop.title} and confirm the current deadline and who is allowed to apply.`];

    if (this._isFederalProgram(stop) && !hasExistingFederalRegistration) {
      nextSteps.push(SAM_REGISTRATION_TIP);
    }

    return {
      stopId: stop.id,
      whyFit,
      whyIneligible,
      whatToVerify,
      whatToDoNext: nextSteps.join(' '),
    };
  }

  private _flagMessages(stop: IStop, severities: string[]): string[] {
    const messages: string[] = [];

    for (const flag of stop.eligibilityFlags) {
      if (severities.includes(flag.severity) && flag.message.trim().length > 0) {
        messages.push(this._asSentence(flag.message.trim()));
      }
    }

    return messages;
  }

  private _asSentence(message: string): string {
    if (/[.!?]$/.test(message)) {
      return message;
    }

    return `${message}.`;
  }
}
