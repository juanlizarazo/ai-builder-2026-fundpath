import { Timestamp } from 'firebase-admin/firestore';
import { IRegistrationStep, IRegistrationTimeline } from '../firestore';
import {
  AGENCY_PORTAL_BY_ALN_PREFIX,
  DRAFTING_BUFFER_BUSINESS_DAYS,
  GRANTS_GOV_LEAD_BUSINESS_DAYS,
  REGISTRATION_LEAD_BUSINESS_DAYS,
  SBA_REGISTRY_LEAD_BUSINESS_DAYS,
} from './application.constants';

export interface IRegistrationTimelineInput {
  closeDate?: Timestamp;
  isSbir?: boolean;
  isSttr?: boolean;
  aln?: string;
  /** Injectable for tests; defaults to the real current time. */
  now?: Date;
}

interface IStepBlueprint {
  key: string;
  label: string;
  system: string;
  url?: string;
  durationBusinessDays: number;
  note?: string;
}

const WEEKEND_NOTE = 'Business-day estimate only — skips weekends but has no federal holiday table, so treat it as a floor, not a guarantee.';

/**
 * Computes the registration timeline for a grant — the chain of registrations a
 * founder must complete before they can submit, anchored either backwards from a
 * known close date (`mode: 'deadline'`) or forwards from today when there is no
 * close date on record (`mode: 'earliest-ready'`).
 *
 * Static-methods-only helper, same shape as TieringHelper/EligibilityRulesHelper.
 */
export class RegistrationTimelineHelper {
  public static build(input: IRegistrationTimelineInput): IRegistrationTimeline {
    const now = RegistrationTimelineHelper._toDateOnly(input.now ?? new Date());
    const blueprints = RegistrationTimelineHelper._blueprintsFor(input.isSbir, input.isSttr, input.aln);

    if (input.closeDate) {
      return RegistrationTimelineHelper._buildDeadlineMode(input.closeDate, blueprints, now);
    }

    return RegistrationTimelineHelper._buildEarliestReadyMode(blueprints, now);
  }

  // ---- step chain -----------------------------------------------------------

  private static _blueprintsFor(isSbir?: boolean, isSttr?: boolean, aln?: string): IStepBlueprint[] {
    const blueprints: IStepBlueprint[] = [
      {
        key: 'sam-gov-registration',
        label: 'SAM.gov UEI + entity registration',
        system: 'SAM.gov',
        url: 'https://sam.gov',
        durationBusinessDays: REGISTRATION_LEAD_BUSINESS_DAYS,
        note: WEEKEND_NOTE,
      },
    ];

    if (isSbir || isSttr) {
      blueprints.push({
        key: 'sba-company-registry',
        label: 'SBA Company Registry (SBC control ID)',
        system: 'SBA Company Registry',
        durationBusinessDays: SBA_REGISTRY_LEAD_BUSINESS_DAYS,
      });
    }

    blueprints.push({
      key: 'grants-gov-account',
      label: 'Grants.gov account + AOR authorization',
      system: 'Grants.gov',
      url: 'https://grants.gov',
      durationBusinessDays: GRANTS_GOV_LEAD_BUSINESS_DAYS,
    });

    const portal = RegistrationTimelineHelper._resolvePortal(aln);

    if (portal) {
      blueprints.push({
        key: 'agency-portal',
        label: `Agency portal (${portal.system})`,
        system: portal.system,
        url: portal.url,
        durationBusinessDays: portal.durationBusinessDays,
      });
    }

    return blueprints;
  }

  private static _resolvePortal(aln?: string): { system: string; url?: string; durationBusinessDays: number } | undefined {
    if (!aln) {
      return undefined;
    }

    const match = aln.match(/^\d+/);

    if (!match) {
      return undefined;
    }

    return AGENCY_PORTAL_BY_ALN_PREFIX[match[0]];
  }

  // ---- modes ------------------------------------------------------------------

  private static _buildDeadlineMode(closeDateTs: Timestamp, blueprints: IStepBlueprint[], now: Date): IRegistrationTimeline {
    const closeDate = RegistrationTimelineHelper._toDateOnly(closeDateTs.toDate());
    const submitBy = RegistrationTimelineHelper._subtractBusinessDays(closeDate, DRAFTING_BUFFER_BUSINESS_DAYS);
    const steps: IRegistrationStep[] = [];
    let anchor = submitBy;

    for (let i = blueprints.length - 1; i >= 0; i--) {
      const blueprint = blueprints[i];
      const completeBy = anchor;
      const startBy = RegistrationTimelineHelper._subtractBusinessDays(completeBy, blueprint.durationBusinessDays);

      steps.unshift(RegistrationTimelineHelper._toStep(blueprint, startBy, completeBy));
      anchor = startBy;
    }

    const firstStep = steps[0];
    const feasible = firstStep.startBy.toDate().getTime() >= now.getTime();
    const slackBusinessDays = RegistrationTimelineHelper._businessDaysBetween(submitBy, closeDate);
    const startByLabel = RegistrationTimelineHelper._formatDate(firstStep.startBy.toDate());
    const headline = feasible
      ? `Start SAM.gov registration by ${startByLabel} or you cannot make this deadline.`
      : `You cannot make this deadline — registration would need to have started by ${startByLabel}. Consider a later cycle or a different stop.`;

    return {
      mode: 'deadline',
      closeDate: closeDateTs,
      submitBy: Timestamp.fromDate(submitBy),
      steps,
      feasible,
      slackBusinessDays,
      headline,
    };
  }

  private static _buildEarliestReadyMode(blueprints: IStepBlueprint[], now: Date): IRegistrationTimeline {
    const steps: IRegistrationStep[] = [];
    let anchor = RegistrationTimelineHelper._nextBusinessDayOnOrAfter(now);

    for (const blueprint of blueprints) {
      const startBy = anchor;
      const completeBy = RegistrationTimelineHelper._addBusinessDays(startBy, blueprint.durationBusinessDays);

      steps.push(RegistrationTimelineHelper._toStep(blueprint, startBy, completeBy));
      anchor = completeBy;
    }

    const submitBy = RegistrationTimelineHelper._addBusinessDays(anchor, DRAFTING_BUFFER_BUSINESS_DAYS);
    const headline = `You could be submission-ready by ${RegistrationTimelineHelper._formatDate(submitBy)}.`;

    return {
      mode: 'earliest-ready',
      submitBy: Timestamp.fromDate(submitBy),
      steps,
      feasible: true,
      slackBusinessDays: 0,
      headline,
    };
  }

  private static _toStep(blueprint: IStepBlueprint, startBy: Date, completeBy: Date): IRegistrationStep {
    return {
      key: blueprint.key,
      label: blueprint.label,
      system: blueprint.system,
      url: blueprint.url,
      durationBusinessDays: blueprint.durationBusinessDays,
      startBy: Timestamp.fromDate(startBy),
      completeBy: Timestamp.fromDate(completeBy),
      note: blueprint.note,
    };
  }

  // ---- business-day arithmetic (shared by both directions) --------------------

  private static _isWeekend(date: Date): boolean {
    const day = date.getDay();

    return day === 0 || day === 6;
  }

  private static _toDateOnly(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  private static _shiftBusinessDays(date: Date, businessDays: number, direction: 1 | -1): Date {
    const result = new Date(date.getTime());
    let remaining = businessDays;

    while (remaining > 0) {
      result.setDate(result.getDate() + direction);

      if (!RegistrationTimelineHelper._isWeekend(result)) {
        remaining--;
      }
    }

    return result;
  }

  private static _addBusinessDays(date: Date, businessDays: number): Date {
    return RegistrationTimelineHelper._shiftBusinessDays(date, businessDays, 1);
  }

  private static _subtractBusinessDays(date: Date, businessDays: number): Date {
    return RegistrationTimelineHelper._shiftBusinessDays(date, businessDays, -1);
  }

  private static _nextBusinessDayOnOrAfter(date: Date): Date {
    const result = new Date(date.getTime());

    while (RegistrationTimelineHelper._isWeekend(result)) {
      result.setDate(result.getDate() + 1);
    }

    return result;
  }

  /** Signed count of business days walked from `start` to `end` (date-only inputs). */
  private static _businessDaysBetween(start: Date, end: Date): number {
    const forward = end.getTime() >= start.getTime();
    const cursor = new Date(start.getTime());
    let count = 0;

    while (cursor.getTime() !== end.getTime()) {
      cursor.setDate(cursor.getDate() + (forward ? 1 : -1));

      if (!RegistrationTimelineHelper._isWeekend(cursor)) {
        count += forward ? 1 : -1;
      }
    }

    return count;
  }

  private static _formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  }
}
