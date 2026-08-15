import { Component, ElementRef, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TextFieldModule } from '@angular/cdk/text-field';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { addDays, addMonths, differenceInBusinessDays } from 'date-fns';
import { Observable, Subject, catchError, debounceTime, filter, map, of, switchMap } from 'rxjs';
import { FundpathService } from '@app/core/services/fundpath.service';
import { AuthService } from '@app/core/services/auth.service';
import { AlertBannerComponent } from '@app/shared/components/alert-banner/alert-banner.component';
import { RunwayComponent } from '@app/shared/components/runway/runway.component';
import { ApplicationService, IApplicantDetailsWire, IGenerateSf424Response } from './services/application.service';
import { FundPath } from '../../../types/firestore';
import { formatDate, toDate } from '../../shared/utils/format.utils';

type INarrativeSection = FundPath.Firestore.Applications.INarrativeStarter['section'];
type NarrativeDraftsRecord = Partial<Record<INarrativeSection, string>>;
type IRegistrationStep = FundPath.Firestore.Applications.IRegistrationStep;

/** Distinguishes "not yet loaded" from "loaded, no saved drafts" so the init effect never fires early and clobbers real data with defaults. */
interface INarrativeDraftsLoadState {
  loaded: boolean;
  drafts: NarrativeDraftsRecord | undefined;
}

/** Autosave debounce for Leg 2's narrative editors — matches the brief's 800ms. */
const NARRATIVE_AUTOSAVE_DEBOUNCE_MS = 800;

/** Leg 4 auto-generates the filled SF-424 this long after the last form edit, once the form is complete. */
const SF424_AUTOGEN_DEBOUNCE_MS = 800;

/** Leg 3's three screens, each with its own optional-fields disclosure. */
type FormScreen = 0 | 1 | 2;

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
    RunwayComponent,
    TextFieldModule
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
  private readonly _sanitizer = inject(DomSanitizer);
  private _sf424BlobUrl: string | null = null;

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

  // --- Leg 1: "Get registered" ---------------------------------------------

  /** The one step the runway marks "lit" — the earliest not yet in `checkedStepKeys`. Same rule as `RunwayComponent`. */
  protected readonly currentStep = computed<IRegistrationStep | null>(() => {
    const t = this.timeline();
    if (!t) { return null; }

    const checked = new Set(this.checkedStepKeys());
    const ordered = [...t.steps].sort((a, b) => {
      const aTime = toDate(a.startBy)?.getTime() ?? 0;
      const bTime = toDate(b.startBy)?.getTime() ?? 0;
      return aTime - bTime;
    });

    return ordered.find(step => !checked.has(step.key)) ?? null;
  });

  protected readonly doneStepsCount = computed<number>(() => {
    const t = this.timeline();
    if (!t) { return 0; }

    const checked = new Set(this.checkedStepKeys());
    return t.steps.filter(step => checked.has(step.key)).length;
  });

  // --- Leg 2: "Tell your story" --------------------------------------------

  protected readonly currentNarrativeIndex = signal(0);

  /** Per-section draft text, editable — initialized once from persisted `narrativeDrafts` (winning) or the kit's fresh `draft`. */
  protected readonly narrativeDraftsState = signal<NarrativeDraftsRecord>({});

  protected readonly draftedNarrativeCount = computed<number>(() =>
    Object.values(this.narrativeDraftsState()).filter(text => !!text?.trim()).length
  );

  private readonly _uid = toSignal(
    this._authService.user$.pipe(map(user => user?.uid ?? null)),
    { initialValue: null }
  );

  private readonly _narrativeDraftsLoaded = toSignal(
    this._authService.user$.pipe(
      filter((user) => !!user),
      switchMap((user) => this._applicationService.watchNarrativeDrafts(user!.uid)),
      map((drafts) => ({ loaded: true, drafts })),
      catchError(() => of({ loaded: true, drafts: undefined }))
    ),
    { initialValue: { loaded: false, drafts: undefined } as INarrativeDraftsLoadState }
  );

  private readonly _hasInitializedNarratives = signal(false);
  private readonly _narrativeSave$ = new Subject<NarrativeDraftsRecord>();

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

  // --- Leg 3: "Fill the form" -----------------------------------------------

  protected readonly currentFormScreen = signal<FormScreen>(0);
  protected readonly optionalFieldsOpen = signal<Record<FormScreen, boolean>>({ 0: false, 1: false, 2: false });

  /** Total fields is fixed at 16 — every key of `IApplicantFormState`. */
  protected readonly filledFieldCount = computed<number>(() =>
    Object.values(this.applicantForm()).filter((value) => value.trim().length > 0).length
  );

  // --- Leg 4: "Your form" ---------------------------------------------------

  protected readonly sf424Result = signal<IGenerateSf424Response | null>(null);
  protected readonly isGeneratingSf424 = signal(false);
  protected readonly sf424Error = signal('');

  protected readonly sf424SafeUrl = computed<SafeResourceUrl | null>(() => {
    const result = this.sf424Result();
    if (!result) { return null; }

    if (result.url) { return this._sanitizer.bypassSecurityTrustResourceUrl(result.url); }

    if (result.base64) {
      if (this._sf424BlobUrl) { URL.revokeObjectURL(this._sf424BlobUrl); }
      this._sf424BlobUrl = this._base64ToBlobUrl(result.base64);

      return this._sanitizer.bypassSecurityTrustResourceUrl(this._sf424BlobUrl);
    }

    return null;
  });

  protected readonly portalsFootnote = computed<string>(() => {
    const portalNames = this.portals().map((p) => p.name).join(' / ');
    const mechanics = this.submissionMechanics().map((m) => m.detail).join(' · ');

    return [portalNames && `Submit at ${portalNames} ↗`, mechanics].filter(Boolean).join(' · ');
  });

  constructor() {
    void this._loadStarterKit();

    effect(() => {
      const profile = this._profile();

      if (profile && !this._hasPrefilled()) {
        this.applicantForm.set(this._deriveApplicantForm(profile));
        this._hasPrefilled.set(true);
      }
    });

    effect(() => {
      const kit = this.kit();
      const draftsState = this._narrativeDraftsLoaded();

      if (kit && draftsState.loaded && !this._hasInitializedNarratives()) {
        const initial: NarrativeDraftsRecord = {};

        for (const narrative of kit.narratives) {
          initial[narrative.section] = draftsState.drafts?.[narrative.section] ?? narrative.draft;
        }

        this.narrativeDraftsState.set(initial);
        this._hasInitializedNarratives.set(true);
      }
    });

    this._narrativeSave$
      .pipe(
        debounceTime(NARRATIVE_AUTOSAVE_DEBOUNCE_MS),
        switchMap((drafts) => {
          const uid = this._uid();
          return uid ? this._applicationService.saveNarrativeDrafts(uid, drafts) : of(undefined);
        }),
        takeUntilDestroyed()
      )
      .subscribe();

    // Leg 4 auto-generates the filled SF-424 the moment the form is complete, debounced — no click into the dark.
    toObservable(this.applicantForm)
      .pipe(
        debounceTime(SF424_AUTOGEN_DEBOUNCE_MS),
        filter(() => this.isFormComplete()),
        switchMap(() => {
          this.isGeneratingSf424.set(true);
          this.sf424Error.set('');

          return this._applicationService
            .generateSf424(this.routeId, this.stopId, this._buildApplicantDetails())
            .then((result) => ({ ok: true as const, result }))
            .catch(() => ({ ok: false as const, result: null }));
        }),
        takeUntilDestroyed()
      )
      .subscribe((outcome) => {
        this.isGeneratingSf424.set(false);

        if (outcome.ok) {
          this.sf424Result.set(outcome.result);
        } else {
          this.sf424Error.set('Something went wrong generating your SF-424. Please try again.');
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

  protected updateNarrativeDraft(section: INarrativeSection, value: string): void {
    this.narrativeDraftsState.update((state) => {
      const next = { ...state, [section]: value };
      this._narrativeSave$.next(next);

      return next;
    });
  }

  protected wordCount(text: string | undefined): number {
    const trimmed = (text ?? '').trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }

  protected isNarrativeDrafted(section: INarrativeSection): boolean {
    return !!this.narrativeDraftsState()[section]?.trim();
  }

  protected goToNarrativeTab(index: number): void {
    if (index >= 0 && index < this.narratives().length) {
      this.currentNarrativeIndex.set(index);
    }
  }

  protected nextNarrativeSection(): void {
    this.currentNarrativeIndex.update((index) =>
      index < this.narratives().length - 1 ? index + 1 : index
    );
  }

  protected updateField<K extends keyof IApplicantFormState>(field: K, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.applicantForm.update(f => ({ ...f, [field]: value }));
  }

  protected toggleOptionalFields(screen: FormScreen): void {
    this.optionalFieldsOpen.update((open) => ({ ...open, [screen]: !open[screen] }));
  }

  protected nextFormScreen(): void {
    if (this.currentFormScreen() < 2) {
      this.currentFormScreen.update((screen) => (screen + 1) as FormScreen);
    } else {
      this.nextLeg();
    }
  }

  protected previousFormScreen(): void {
    if (this.currentFormScreen() > 0) {
      this.currentFormScreen.update((screen) => (screen - 1) as FormScreen);
    } else {
      this.previousLeg();
    }
  }

  protected openSf424InNewTab(): void {
    const result = this.sf424Result();
    if (!result) { return; }

    window.open(result.url ?? this._sf424BlobUrl ?? undefined, '_blank');
  }

  protected isTaskChecked(task: FundPath.Firestore.Routes.ITask): boolean {
    return this._applicationService.isTaskChecked(this.taskState(), task);
  }

  protected toggleTask(task: FundPath.Firestore.Routes.ITask): void {
    this._applicationService.toggleTask(this.routeId, task.id, this.isTaskChecked(task));
  }

  protected async copyNarrative(narrative: FundPath.Firestore.Applications.INarrativeStarter): Promise<void> {
    try {
      // Copies the currently edited draft, not the original starter text — the textarea is the source of truth once Leg 2 loads.
      const text = this.narrativeDraftsState()[narrative.section] ?? narrative.draft;
      await navigator.clipboard.writeText(text);
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

  protected clearSf424Error(): void {
    this.sf424Error.set('');
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

  /**
   * `applicantDetails` (already saved from a prior visit) always wins —
   * this only fills gaps for fields never explicitly entered, so a second
   * visit never clobbers an edit with a re-derived value.
   */
  private _deriveApplicantForm(profile: FundPath.Firestore.Profiles.IStartupProfile): IApplicantFormState {
    const details = profile.applicantDetails;
    const stop = this.stop();

    const projectTitle =
      details?.projectTitle ??
      (profile.useOfFunds
        ? profile.useOfFunds.charAt(0).toUpperCase() + profile.useOfFunds.slice(1)
        : stop
          ? `${stop.title} — ${profile.industry} project`
          : '');

    const fundingRequested = details?.fundingRequested ?? profile.askMax ?? stop?.maxAward ?? profile.askMin;

    const derivedStart = toDate(stop?.closeDate) ?? new Date();
    const projectStartDate = details?.projectStartDate
      ? toDateInputValue(details.projectStartDate)
      : toDateInputValue(addDays(derivedStart, 90));
    const projectEndDate = details?.projectEndDate
      ? toDateInputValue(details.projectEndDate)
      : toDateInputValue(addMonths(addDays(derivedStart, 90), 12));

    return {
      legalName: details?.legalName ?? profile.companyName ?? '',
      street1: details?.street1 ?? '',
      street2: details?.street2 ?? '',
      city: details?.city ?? profile.location.city ?? '',
      state: details?.state ?? profile.location.state ?? 'UT',
      zip: details?.zip ?? '',
      county: details?.county ?? profile.location.county ?? '',
      contactFirstName: details?.contactFirstName ?? '',
      contactLastName: details?.contactLastName ?? '',
      contactTitle: details?.contactTitle ?? '',
      contactEmail: details?.contactEmail ?? '',
      contactPhone: details?.contactPhone ?? '',
      projectTitle,
      projectStartDate,
      projectEndDate,
      fundingRequested: fundingRequested !== undefined ? String(fundingRequested) : ''
    };
  }

  private _base64ToBlobUrl(base64: string): string {
    const byteChars = atob(base64);
    const byteNumbers = new Array<number>(byteChars.length);

    for (let i = 0; i < byteChars.length; i++) {
      byteNumbers[i] = byteChars.charCodeAt(i);
    }

    const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/pdf' });

    return URL.createObjectURL(blob);
  }

  private _downloadBase64Pdf(base64: string): void {
    const objectUrl = this._base64ToBlobUrl(base64);
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

  /**
   * The whole profile, not just `applicantDetails` — Task 10 widens this
   * (was `watchApplicantDetails`) so the prefill effect can derive fields
   * the founder never explicitly entered (state/city/county, a project
   * title from `useOfFunds`, funding requested from the ask range, etc.)
   * instead of leaving them empty on first visit.
   */
  private _buildProfile$(): Observable<FundPath.Firestore.Profiles.IStartupProfile | null> {
    return this._authService.user$.pipe(
      filter((user) => !!user),
      switchMap((user) => this._fundpathService.watchProfile(user!.uid)),
      catchError(() => of(null))
    );
  }
}
