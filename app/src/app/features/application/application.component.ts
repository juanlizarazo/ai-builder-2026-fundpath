import { Component, ElementRef, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { differenceInBusinessDays } from 'date-fns';
import { Observable, catchError, filter, of, switchMap } from 'rxjs';
import { FundpathService } from '@app/core/services/fundpath.service';
import { AuthService } from '@app/core/services/auth.service';
import { AlertBannerComponent } from '@app/shared/components/alert-banner/alert-banner.component';
import { RunwayComponent } from '@app/shared/components/runway/runway.component';
import { ApplicationService, IApplicantDetailsWire } from './services/application.service';
import { FundPath } from '../../../types/firestore';
import { formatDate, toDate } from '../../shared/utils/format.utils';

/** Which leg of the Sherpa wizard is showing. Leg 0 is the feasibility pre-check; Legs 1-4 are the numbered legs. */
type Leg = 0 | 1 | 2 | 3 | 4;

const LEG_TITLES: Record<Leg, string> = {
  0: 'Can you make it?',
  1: 'Get registered',
  2: 'Tell your story',
  3: 'Fill the form',
  4: 'Your form'
};

interface IApplicantFormState {
  legalName: string;
  street1: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  contactFirstName: string;
  contactLastName: string;
  contactTitle: string;
  contactEmail: string;
  contactPhone: string;
  projectTitle: string;
  /** `<input type="date">` value — `YYYY-MM-DD`, or '' when left blank. Optional per IApplicantDetails. */
  projectStartDate: string;
  /** Same shape/optionality as projectStartDate. */
  projectEndDate: string;
  fundingRequested: string;
}

const EMPTY_FORM: IApplicantFormState = {
  legalName: '',
  street1: '',
  street2: '',
  city: '',
  state: '',
  zip: '',
  county: '',
  contactFirstName: '',
  contactLastName: '',
  contactTitle: '',
  contactEmail: '',
  contactPhone: '',
  projectTitle: '',
  projectStartDate: '',
  projectEndDate: '',
  fundingRequested: ''
};

/** Formats a Firestore Timestamp (or already-a-Date) as `YYYY-MM-DD` for an `<input type="date">`. */
function toDateInputValue(value: unknown): string {
  if (!value) { return ''; }

  const candidate = value as { toDate?: () => Date };
  const date = typeof candidate.toDate === 'function' ? candidate.toDate() : (value as Date);

  if (!(date instanceof Date) || Number.isNaN(date.getTime())) { return ''; }

  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${date.getUTCDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
}

@Component({
  selector: 'app-application',
  standalone: true,
  imports: [
    RouterLink,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    AlertBannerComponent,
    RunwayComponent
  ],
  templateUrl: './application.component.html',
  styleUrl: './application.component.scss'
})
export class ApplicationComponent {
  @ViewChild('pageHeading') private readonly _headingRef?: ElementRef<HTMLElement>;

  protected readonly legTitles = LEG_TITLES;
  protected readonly legs: Leg[] = [0, 1, 2, 3, 4];
  protected readonly numberedLegs: Leg[] = [1, 2, 3, 4];
  protected readonly currentLeg = signal<Leg>(0);

  /**
   * Keys of registration steps marked done, for the runway's "lit" node.
   * Local UI state for now — Task 9 wires this to real per-step persistence
   * as part of Leg 1's "Get registered" content.
   */
  protected readonly checkedStepKeys = signal<string[]>([]);

  private readonly _activatedRoute = inject(ActivatedRoute);
  private readonly _fundpathService = inject(FundpathService);
  private readonly _applicationService = inject(ApplicationService);
  private readonly _authService = inject(AuthService);

  protected readonly routeId = this._activatedRoute.snapshot.paramMap.get('routeId') ?? '';
  protected readonly stopId = this._activatedRoute.snapshot.paramMap.get('stopId') ?? '';

  protected readonly formatDate = formatDate;

  private readonly _liveRoute = toSignal(this._buildLiveRoute(), { initialValue: undefined });

  protected readonly route = computed<FundPath.Firestore.Routes.IRoute | null>(() => this._liveRoute() ?? null);

  protected readonly stop = computed<FundPath.Firestore.Routes.IStop | null>(() =>
    this.route()?.stops?.find(s => s.id === this.stopId) ?? null
  );

  protected readonly taskState = computed<Record<string, boolean>>(() => this.route()?.taskState ?? {});

  protected readonly checklistTasks = computed<FundPath.Firestore.Routes.ITask[]>(() =>
    (this.stop()?.tasks ?? []).filter(t => t.category === 'registration' || t.category === 'document')
  );

  // --- Starter kit: one-shot callable response (Task 5's generateStarterKit is a synchronous
  // request/response with the full IStarterKit — no background job updates a starterKits/{...}
  // doc afterward, so a live Firestore watch isn't needed; calling it again is idempotent re-sync).
  protected readonly kit = signal<FundPath.Firestore.Applications.IStarterKit | null>(null);
  protected readonly isLoadingKit = signal(true);
  protected readonly kitError = signal('');

  protected readonly timeline = computed(() => this.kit()?.timeline ?? null);
  protected readonly narratives = computed(() => this.kit()?.narratives ?? []);
  protected readonly portals = computed(() => this.kit()?.portals ?? []);
  protected readonly submissionMechanics = computed(() => this.kit()?.submissionMechanics ?? []);

  // --- Leg 0: "Can you make it?" ------------------------------------------

  /** Business days from today to the deadline (`closeDate` or `submitBy`) — "days you have". */
  protected readonly daysAvailable = computed<number | null>(() => {
    const t = this.timeline();
    if (!t) { return null; }

    const deadline = toDate(t.closeDate) ?? toDate(t.submitBy);
    return deadline ? differenceInBusinessDays(deadline, new Date()) : null;
  });

  /** Sum of every step's `durationBusinessDays` — "days you need". */
  protected readonly daysNeeded = computed<number | null>(() => {
    const t = this.timeline();
    if (!t) { return null; }

    return t.steps.reduce((total, step) => total + step.durationBusinessDays, 0);
  });

  /** The backend's own `slackBusinessDays`, rendered as-is — never recomputed client-side. */
  protected readonly slackDays = computed<number | null>(() => this.timeline()?.slackBusinessDays ?? null);

  private readonly _profile = toSignal(this._buildProfile$(), { initialValue: undefined });
  private readonly _hasPrefilled = signal(false);

  protected readonly applicantForm = signal<IApplicantFormState>({ ...EMPTY_FORM });

  protected readonly isFormComplete = computed<boolean>(() => {
    const f = this.applicantForm();

    return !!(
      f.legalName.trim() &&
      f.street1.trim() &&
      f.city.trim() &&
      f.state.trim() &&
      f.zip.trim() &&
      f.contactFirstName.trim() &&
      f.contactLastName.trim() &&
      f.contactEmail.trim() &&
      f.contactPhone.trim() &&
      f.projectTitle.trim()
    );
  });

  protected readonly isDownloading = signal(false);
  protected readonly downloadError = signal('');
  protected readonly copiedSection = signal<string | null>(null);

  constructor() {
    void this._loadStarterKit();

    effect(() => {
      const profile = this._profile();

      if (profile && !this._hasPrefilled()) {
        this.applicantForm.set({
          legalName: profile.legalName ?? '',
          street1: profile.street1 ?? '',
          street2: profile.street2 ?? '',
          city: profile.city ?? '',
          state: profile.state ?? '',
          zip: profile.zip ?? '',
          county: profile.county ?? '',
          contactFirstName: profile.contactFirstName ?? '',
          contactLastName: profile.contactLastName ?? '',
          contactTitle: profile.contactTitle ?? '',
          contactEmail: profile.contactEmail ?? '',
          contactPhone: profile.contactPhone ?? '',
          projectTitle: profile.projectTitle ?? '',
          projectStartDate: toDateInputValue(profile.projectStartDate),
          projectEndDate: toDateInputValue(profile.projectEndDate),
          fundingRequested: profile.fundingRequested !== undefined ? String(profile.fundingRequested) : ''
        });
        this._hasPrefilled.set(true);
      }
    });
  }

  public ngAfterViewInit(): void {
    setTimeout(() => this._headingRef?.nativeElement.focus(), 0);
  }

  protected goToLeg(leg: Leg): void {
    this.currentLeg.set(leg);
  }

  protected nextLeg(): void {
    this.currentLeg.update(leg => (leg < 4 ? (leg + 1) as Leg : leg));
  }

  protected previousLeg(): void {
    this.currentLeg.update(leg => (leg > 0 ? (leg - 1) as Leg : leg));
  }

  protected toggleRunwayStep(stepKey: string): void {
    this.checkedStepKeys.update(keys =>
      keys.includes(stepKey) ? keys.filter(k => k !== stepKey) : [...keys, stepKey]
    );
  }

  protected updateField<K extends keyof IApplicantFormState>(field: K, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.applicantForm.update(f => ({ ...f, [field]: value }));
  }

  protected isTaskChecked(task: FundPath.Firestore.Routes.ITask): boolean {
    return this._applicationService.isTaskChecked(this.taskState(), task);
  }

  protected toggleTask(task: FundPath.Firestore.Routes.ITask): void {
    this._applicationService.toggleTask(this.routeId, task.id, this.isTaskChecked(task));
  }

  protected async copyNarrative(narrative: FundPath.Firestore.Applications.INarrativeStarter): Promise<void> {
    try {
      await navigator.clipboard.writeText(narrative.draft);
      this.copiedSection.set(narrative.section);
      setTimeout(() => this.copiedSection.set(null), 2000);
    } catch {
      // Clipboard permission denial is non-critical for this nicety — silently ignore.
    }
  }

  protected async downloadSf424(): Promise<void> {
    if (!this.isFormComplete() || this.isDownloading()) { return; }

    this.isDownloading.set(true);
    this.downloadError.set('');

    try {
      const result = await this._applicationService.generateSf424(this.routeId, this.stopId, this._buildApplicantDetails());

      if (result.url) {
        // A cross-origin signed URL typically can't use the `download` attribute reliably —
        // open in a new tab so the browser handles the PDF (view or download per its own settings).
        window.open(result.url, '_blank');
      } else if (result.base64) {
        this._downloadBase64Pdf(result.base64);
      }
    } catch {
      this.downloadError.set('Something went wrong generating your SF-424. Please try again.');
    } finally {
      this.isDownloading.set(false);
    }
  }

  protected clearKitError(): void {
    this.kitError.set('');
  }

  protected clearDownloadError(): void {
    this.downloadError.set('');
  }

  private async _loadStarterKit(): Promise<void> {
    if (!this.routeId || !this.stopId) {
      this.isLoadingKit.set(false);
      return;
    }

    this.isLoadingKit.set(true);
    this.kitError.set('');

    try {
      const kit = await this._applicationService.generateStarterKit(this.routeId, this.stopId);
      this.kit.set(kit);
    } catch {
      this.kitError.set('Something went wrong loading your application starter kit. Please try again.');
    } finally {
      this.isLoadingKit.set(false);
    }
  }

  private _buildApplicantDetails(): IApplicantDetailsWire {
    const f = this.applicantForm();
    const fundingRequested = f.fundingRequested.trim() ? Number(f.fundingRequested) : undefined;

    return {
      legalName: f.legalName.trim(),
      street1: f.street1.trim(),
      street2: f.street2.trim() || undefined,
      city: f.city.trim(),
      state: f.state.trim(),
      zip: f.zip.trim(),
      county: f.county.trim() || undefined,
      contactFirstName: f.contactFirstName.trim(),
      contactLastName: f.contactLastName.trim(),
      contactTitle: f.contactTitle.trim() || undefined,
      contactEmail: f.contactEmail.trim(),
      contactPhone: f.contactPhone.trim(),
      projectTitle: f.projectTitle.trim(),
      // Optional per IApplicantDetails — leave unset rather than sending '' so 17a/17b just stay blank.
      projectStartDate: f.projectStartDate.trim() || undefined,
      projectEndDate: f.projectEndDate.trim() || undefined,
      fundingRequested: fundingRequested !== undefined && !Number.isNaN(fundingRequested) ? fundingRequested : undefined
    };
  }

  private _downloadBase64Pdf(base64: string): void {
    const byteChars = atob(base64);
    const byteNumbers = new Array<number>(byteChars.length);

    for (let i = 0; i < byteChars.length; i++) {
      byteNumbers[i] = byteChars.charCodeAt(i);
    }

    const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/pdf' });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = objectUrl;
    anchor.download = 'SF-424.pdf';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  }

  private _buildLiveRoute(): Observable<FundPath.Firestore.Routes.IRoute | null> {
    const routeId = this.routeId;

    if (!routeId) { return of(null); }

    return this._authService.user$.pipe(
      filter((user) => !!user),
      switchMap(() => this._fundpathService.watchRoute(routeId)),
      catchError(() => of(null))
    );
  }

  private _buildProfile$(): Observable<FundPath.Firestore.Applications.IApplicantDetails | undefined> {
    return this._authService.user$.pipe(
      filter((user) => !!user),
      switchMap((user) => this._applicationService.watchApplicantDetails(user!.uid)),
      catchError(() => of(undefined))
    );
  }
}
