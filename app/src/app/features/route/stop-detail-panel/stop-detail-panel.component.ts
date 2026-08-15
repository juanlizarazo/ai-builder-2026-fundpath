import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { ApplicationService } from '../../application/services/application.service';
import { FundPath } from '../../../../types/firestore';
import { formatDollars, formatDate } from '../../../shared/utils/format.utils';
import { linearPosition } from '../../../shared/utils/scale.utils';
import { toSentences } from '../../../shared/utils/text.utils';

type IStop = FundPath.Firestore.Routes.IStop;
type IEligibilityFlag = FundPath.Firestore.Routes.IEligibilityFlag;

interface ILedgerRow {
  text: string;
  fromFlag: boolean;
}

/**
 * Stop-detail content mounted inside `ss-side-panel` (Task 7). Replaces the
 * ten stacked prose blocks the old inline-expanding station card rendered
 * with a structured, scannable layout: fit ledger, proof bar, verify list,
 * do-next list, collapsed checklist, and provenance note.
 */
@Component({
  selector: 'app-stop-detail-panel',
  standalone: true,
  imports: [RouterLink, MatIconModule],
  templateUrl: './stop-detail-panel.component.html',
  styleUrl: './stop-detail-panel.component.scss'
})
export class StopDetailPanelComponent {
  private readonly _applicationService = inject(ApplicationService);

  public readonly stop = input.required<IStop>();
  public readonly routeId = input.required<string>();
  public readonly taskState = input<Record<string, boolean>>({});
  /** The founder's own ask range, for the proof bar's marker — `null` until the profile loads. */
  public readonly askMin = input<number | null>(null);
  public readonly askMax = input<number | null>(null);

  protected readonly isChecklistExpanded = signal(false);
  protected readonly isFullAssessmentExpanded = signal(false);

  protected readonly formatDollars = formatDollars;
  protected readonly formatDate = formatDate;

  protected readonly canStartApplication = computed<boolean>(() =>
    this.stop().placement === 'primary' || this.stop().placement === 'alongside'
  );

  protected readonly eligibilityFlags = computed<IEligibilityFlag[]>(() => this.stop().eligibilityFlags ?? []);

  /** `WHY YOU FIT` column: sentences from `whyFit` plus `info`-severity flags. */
  protected readonly fitRows = computed<ILedgerRow[]>(() => {
    const s = this.stop();
    const rows: ILedgerRow[] = toSentences(s.whyFit).filter(Boolean).map(text => ({ text, fromFlag: false }));

    for (const flag of this.eligibilityFlags()) {
      if (flag.severity === 'info') { rows.push({ text: flag.message, fromFlag: true }); }
    }

    return rows;
  });

  /** `WHAT COULD MAKE YOU INELIGIBLE` column: sentences from `whyIneligible` plus `warn`/`block` flags. */
  protected readonly ineligibleRows = computed<ILedgerRow[]>(() => {
    const s = this.stop();
    const rows: ILedgerRow[] = toSentences(s.whyIneligible).filter(Boolean).map(text => ({ text, fromFlag: false }));

    for (const flag of this.eligibilityFlags()) {
      if (flag.severity === 'warn' || flag.severity === 'block') { rows.push({ text: flag.message, fromFlag: true }); }
    }

    return rows;
  });

  protected readonly verifyRows = computed<string[]>(() => toSentences(this.stop().whatToVerify).filter(Boolean));
  protected readonly doNextRows = computed<string[]>(() => toSentences(this.stop().whatToDoNext).filter(Boolean));

  protected readonly tasks = computed<FundPath.Firestore.Routes.ITask[]>(() => this.stop().tasks ?? []);

  protected readonly checkedTaskCount = computed<number>(() =>
    this.tasks().filter(task => this.isTaskChecked(task)).length
  );

  protected readonly namedWinners = computed<string[]>(() => this.stop().historicalProof?.namedWinners ?? []);

  protected readonly provenanceNote = computed<string>(() =>
    this.stop().provenanceNote || 'Program details curated from agency source, Aug 2026'
  );

  // --- Proof: horizontal award-range bar --------------------------------

  /** Scale domain `[0, max]` for the award bar — wide enough to fit the award range and the founder's ask. */
  private readonly _domainMax = computed<number>(() => {
    const s = this.stop();
    const candidates = [s.minAward, s.maxAward, this.askMin(), this.askMax()].filter(
      (value): value is number => typeof value === 'number'
    );

    if (candidates.length === 0) { return 1; }

    return Math.max(...candidates) * 1.1;
  });

  protected readonly hasAwardRange = computed<boolean>(() =>
    typeof this.stop().minAward === 'number' || typeof this.stop().maxAward === 'number'
  );

  protected readonly minPct = computed<number>(() => this._positionPct(this.stop().minAward));
  protected readonly maxPct = computed<number>(() => this._positionPct(this.stop().maxAward));
  protected readonly medianPct = computed<number>(() => this._positionPct(this.stop().historicalProof?.medianAward));
  protected readonly askPct = computed<number | null>(() => {
    const min = this.askMin();
    const max = this.askMax();

    if (typeof max === 'number') { return this._positionPct(max); }
    if (typeof min === 'number') { return this._positionPct(min); }

    return null;
  });

  private _positionPct(value: number | undefined): number {
    if (typeof value !== 'number') { return 0; }

    return linearPosition(value, 0, this._domainMax()) * 100;
  }

  protected formatAmount(): string {
    const s = this.stop();

    if (s.minAward && s.maxAward) { return `${formatDollars(s.minAward)} – ${formatDollars(s.maxAward)}`; }
    if (s.maxAward) { return `Up to ${formatDollars(s.maxAward)}`; }
    if (s.minAward) { return `From ${formatDollars(s.minAward)}`; }

    return 'See program for details';
  }

  protected isTaskChecked(task: FundPath.Firestore.Routes.ITask): boolean {
    return this._applicationService.isTaskChecked(this.taskState(), task);
  }

  protected toggleTask(task: FundPath.Firestore.Routes.ITask): void {
    this._applicationService.toggleTask(this.routeId(), task.id, this.isTaskChecked(task));
  }

  protected toggleChecklist(): void {
    this.isChecklistExpanded.update(open => !open);
  }

  protected toggleFullAssessment(): void {
    this.isFullAssessmentExpanded.update(open => !open);
  }
}
