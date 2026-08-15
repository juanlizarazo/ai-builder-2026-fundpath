import { Component, ElementRef, ViewChild, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ApplicationService } from '../../application/services/application.service';
import { FundPath, FIT_TIER_LABELS, FIT_TIER_ICONS } from '../../../../types/firestore';
import { formatDollars, formatDate, toDate } from '../../../shared/utils/format.utils';

/**
 * Short human labels for eligibility flag codes, used by the collapsed
 * station card's fit chips. No existing code→label map was found elsewhere
 * in this repo (only raw `code`/`message` rendering in the expanded detail
 * section) — this is a minimal one for the chip strip. Falls back to the
 * raw code for anything unmapped.
 */
const FLAG_CODE_LABELS: Record<string, string> = {
  REQUIRES_MUNICIPAL_PRIME: 'Needs municipal prime',
  APPLICANT_TYPE_INELIGIBLE: 'Applicant type ineligible',
  APPLICANT_TYPE_UNKNOWN: 'Applicant type unclear',
  APPLICANT_TYPE_OTHERS_SEE_TEXT: 'Check applicant type',
  SBIR_EMPLOYEE_LIMIT: 'Employee limit',
  SBIR_AFFILIATE_AGGREGATION: 'Affiliate aggregation',
  US_OWNERSHIP_REQUIRED: 'US ownership required',
  MAJORITY_VC_RESTRICTED: 'VC ownership limit',
  STTR_RI_PARTNER_REQUIRED: 'Research partner required',
  SBIR_PI_EMPLOYMENT: 'PI employment rule',
  NO_RD_CORE: 'No R&D core',
  ASK_ABOVE_SINGLE_AWARD_CEILING: 'Ask above ceiling',
  COMMERCIAL_FRAMING_NEEDS_GOV_CUSTOMER: 'Needs gov-customer framing',
  REGISTRATION_LEAD_TIME: 'Registration lead time'
};

/** Fit chips on the collapsed station card show at most this many flags. */
const MAX_FIT_CHIPS = 3;

@Component({
  selector: 'app-stop',
  standalone: true,
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './stop.component.html',
  styleUrl: './stop.component.scss'
})
export class StopComponent {
  @ViewChild('detailsRef') private readonly _detailsRef?: ElementRef<HTMLElement>;

  private readonly _applicationService = inject(ApplicationService);

  public readonly stop = input.required<FundPath.Firestore.Routes.IStop>();
  public readonly routeId = input.required<string>();
  public readonly taskState = input<Record<string, boolean>>({});

  /**
   * Seam for Task 7 (side panel): emitted whenever the collapsed station
   * card is activated. `RouteComponent` wires this to `openStopDetail`.
   */
  public readonly opened = output<FundPath.Firestore.Routes.IStop>();

  protected readonly isExpanded = signal(false);
  protected readonly canStartApplication = computed<boolean>(() =>
    this.stop().placement === 'primary' || this.stop().placement === 'alongside'
  );
  protected readonly tierLabels = FIT_TIER_LABELS;
  protected readonly tierIcons = FIT_TIER_ICONS;

  protected readonly eligibilityFlags = computed<FundPath.Firestore.Routes.IEligibilityFlag[]>(() =>
    this.stop().eligibilityFlags ?? []
  );

  protected readonly tasks = computed<FundPath.Firestore.Routes.ITask[]>(() =>
    this.stop().tasks ?? []
  );

  protected readonly namedWinners = computed<string[]>(() =>
    this.stop().historicalProof?.namedWinners ?? []
  );

  protected readonly provenanceNote = computed<string>(() =>
    this.stop().provenanceNote || 'Program details curated from agency source, Aug 2026'
  );

  /** Up to three `✓`/`⚠` fit chips derived from `eligibilityFlags`, for the collapsed card. */
  protected readonly fitChips = computed<{ code: string; label: string; icon: string }[]>(() =>
    this.eligibilityFlags()
      .filter(flag => flag.severity === 'info' || flag.severity === 'warn')
      .slice(0, MAX_FIT_CHIPS)
      .map(flag => ({
        code: flag.code,
        label: FLAG_CODE_LABELS[flag.code] ?? flag.code,
        icon: flag.severity === 'info' ? '✓' : '⚠'
      }))
  );

  /** Mono data strip: `$500K–$2M · ALN 47.041 · Closes Mar 3 · 67 days`. */
  protected readonly dataStrip = computed<string>(() => {
    const s = this.stop();
    const parts: string[] = [];

    const amount = this.formatAmount();
    if (amount) { parts.push(amount); }

    if (s.aln) { parts.push(`ALN ${s.aln}`); }

    const closeLabel = formatDate(s.closeDate);
    if (closeLabel) {
      parts.push(`Closes ${closeLabel}`);

      const days = this.daysUntilClose();
      if (days !== null) { parts.push(`${days} days`); }
    }

    return parts.join(' · ');
  });

  protected daysUntilClose(): number | null {
    const parsed = toDate(this.stop().closeDate);
    if (!parsed || Number.isNaN(parsed.getTime())) { return null; }

    const days = Math.ceil((parsed.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return days >= 0 ? days : null;
  }

  protected formatAmount(): string {
    const s = this.stop();
    const min = s.minAward;
    const max = s.maxAward;

    if (min && max) {
      return `${formatDollars(min)} – ${formatDollars(max)}`;
    }

    if (max) {
      return `Up to ${formatDollars(max)}`;
    }

    if (min) {
      return `From ${formatDollars(min)}`;
    }

    return '';
  }

  protected formatCloseDate(stop: FundPath.Firestore.Routes.IStop): string {
    const formatted = formatDate(stop.closeDate);
    return formatted ? `Closes ${formatted}` : 'Open';
  }

  protected formatRegistrationDate(stop: FundPath.Firestore.Routes.IStop): string {
    const formatted = formatDate(stop.registrationDeadline);
    return formatted ? `Start SAM.gov registration by ${formatted}` : '';
  }

  protected formatOpenDate(stop: FundPath.Firestore.Routes.IStop): string {
    return formatDate(stop.openDate);
  }

  protected formatHistoricalDollars(amount: number): string {
    return formatDollars(amount);
  }

  protected isTaskChecked(task: FundPath.Firestore.Routes.ITask): boolean {
    return this._applicationService.isTaskChecked(this.taskState(), task);
  }

  protected toggleTask(taskId: string, currentState: boolean): void {
    this._applicationService.toggleTask(this.routeId(), taskId, currentState);
  }

  protected toggle(): void {
    const next = !this.isExpanded();
    this.isExpanded.set(next);
    this.opened.emit(this.stop());

    if (next && this._detailsRef) {
      setTimeout(() => {
        const firstFocusable = this._detailsRef?.nativeElement.querySelector<HTMLElement>(
          'button, a, input, [tabindex="0"]'
        );
        firstFocusable?.focus();
      }, 0);
    }
  }
}
