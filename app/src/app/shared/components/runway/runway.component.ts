import { Component, computed, input, output, signal } from '@angular/core';
import { monthTicks } from '../../utils/scale.utils';
import { formatDate, toDate } from '../../utils/format.utils';
import { FundPath } from '../../../../types/firestore';

type IRegistrationTimeline = FundPath.Firestore.Applications.IRegistrationTimeline;
type IRegistrationStep = FundPath.Firestore.Applications.IRegistrationStep;

interface IRunwayTick {
  label: string;
  position: number;
}

interface IRunwayStep {
  step: IRegistrationStep;
  startPct: number;
  endPct: number;
  isLit: boolean;
  isDone: boolean;
}

/**
 * The Sherpa's date UI: a horizontal runway where position and length are
 * real. Every step is placed proportionally by its real `startBy`/`completeBy`
 * dates along `[today, deadline]`; slack renders as a hatched segment past
 * the last step, and overflows (turning the whole runway `--fp-signal`) when
 * `slackBusinessDays` is negative — the infeasibility-you-can-see behavior.
 */
@Component({
  selector: 'app-runway',
  standalone: true,
  imports: [],
  templateUrl: './runway.component.html',
  styleUrl: './runway.component.scss'
})
export class RunwayComponent {
  public readonly timeline = input.required<IRegistrationTimeline>();
  /** Keys (`step.key`) of steps already marked done — determines which node is "lit". */
  public readonly checkedStepKeys = input<readonly string[]>([]);
  /** Emitted when a step's "Mark done" affordance is used, carrying `step.key`. */
  public readonly stepToggled = output<string>();

  protected readonly openPopoverKey = signal<string | null>(null);

  private readonly _today = new Date();

  private readonly _deadline = computed<Date | null>(() => {
    const t = this.timeline();
    return toDate(t.closeDate) ?? toDate(t.submitBy) ?? null;
  });

  protected readonly ticks = computed<IRunwayTick[]>(() => {
    const deadline = this._deadline();
    if (!deadline) { return []; }

    return monthTicks(this._today, deadline).map(date => ({
      label: date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
      position: this._fraction(date) * 100
    }));
  });

  /** Unclamped fraction — unlike `scale.utils.ts::datePosition`, this can exceed 1 so overflow is visible. */
  private _fraction(date: Date): number {
    const deadline = this._deadline();
    if (!deadline) { return 0; }

    const span = deadline.getTime() - this._today.getTime();
    if (span <= 0) { return 1; }

    return (date.getTime() - this._today.getTime()) / span;
  }

  protected readonly steps = computed<IRunwayStep[]>(() => {
    const checked = new Set(this.checkedStepKeys());
    const litKey = this.litStepKey();

    return this.timeline().steps.map(step => {
      const startBy = toDate(step.startBy);
      const completeBy = toDate(step.completeBy);

      return {
        step,
        startPct: startBy ? this._fraction(startBy) * 100 : 0,
        endPct: completeBy ? this._fraction(completeBy) * 100 : 0,
        isLit: step.key === litKey,
        isDone: checked.has(step.key)
      };
    });
  });

  /** The earliest not-yet-done step — the one node tagged "Start here". `null` if all steps are done. */
  protected readonly litStepKey = computed<string | null>(() => {
    const checked = new Set(this.checkedStepKeys());
    const ordered = [...this.timeline().steps].sort((a, b) => {
      const aDate = toDate(a.startBy)?.getTime() ?? 0;
      const bDate = toDate(b.startBy)?.getTime() ?? 0;
      return aDate - bDate;
    });

    return ordered.find(step => !checked.has(step.key))?.key ?? null;
  });

  protected readonly slackStartPct = computed<number>(() => {
    const steps = this.steps();
    if (steps.length === 0) { return 0; }

    return Math.max(...steps.map(s => s.endPct));
  });

  /** Unclamped — can exceed 100, which is exactly the overflow-past-the-wall signal. */
  protected readonly slackEndPct = computed<number>(() => {
    const deadline = this._deadline();
    return deadline ? this._fraction(deadline) * 100 : 100;
  });

  protected readonly isInfeasible = computed<boolean>(() => this.timeline().slackBusinessDays < 0);

  protected readonly slackLabel = computed<string>(() => {
    const days = this.timeline().slackBusinessDays;
    return days < 0 ? `${Math.abs(days)} days short` : `${days} days slack`;
  });

  protected formatStepDate(value: unknown): string {
    return formatDate(value as never);
  }

  protected togglePopover(key: string): void {
    this.openPopoverKey.update(open => (open === key ? null : key));
  }

  protected isPopoverOpen(key: string): boolean {
    return this.openPopoverKey() === key;
  }

  protected markDone(step: IRegistrationStep): void {
    this.stepToggled.emit(step.key);
  }
}
