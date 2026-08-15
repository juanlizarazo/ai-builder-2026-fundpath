import { Component, ElementRef, ViewChild, computed, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { FundPath, FIT_TIER_LABELS, FIT_TIER_ICONS } from '../../../../types/firestore';
import { formatDollars, formatDate } from '../../../shared/utils/format.utils';

@Component({
  selector: 'app-stop',
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './stop.component.html',
  styleUrl: './stop.component.scss'
})
export class StopComponent {
  @ViewChild('detailsRef') private readonly _detailsRef?: ElementRef<HTMLElement>;

  public readonly stop = input.required<FundPath.Firestore.Routes.IStop>();

  protected readonly isExpanded = signal(false);
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

  private readonly _taskOverrides = signal<Record<string, boolean>>({});

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

  protected firstSentence(text: string | undefined): string {
    if (!text) { return ''; }
    const match = text.match(/^[^.!?]+[.!?]/u);
    return match ? match[0] : text.substring(0, 120);
  }

  protected formatHistoricalDollars(amount: number): string {
    return formatDollars(amount);
  }

  protected isTaskChecked(task: FundPath.Firestore.Routes.ITask): boolean {
    const overrides = this._taskOverrides();

    return task.id in overrides ? overrides[task.id] : task.completed;
  }

  protected toggleTask(taskId: string, currentState: boolean): void {
    this._taskOverrides.update(o => ({ ...o, [taskId]: !currentState }));
  }

  protected toggle(): void {
    const next = !this.isExpanded();
    this.isExpanded.set(next);

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
