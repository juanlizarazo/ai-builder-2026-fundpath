import { AfterViewChecked, Component, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { AlertBannerComponent } from '@app/shared/components/alert-banner/alert-banner.component';
import { SurveyingInterstitialComponent } from '@app/shared/components/surveying-interstitial/surveying-interstitial.component';
import { TerrainFieldComponent } from '@app/shared/components/terrain-field/terrain-field.component';
import { TypedLineComponent } from '@app/shared/components/typed-line/typed-line.component';
import { StatStripComponent } from '@app/shared/components/stat-strip/stat-strip.component';
import { FundpathService } from '@app/core/services/fundpath.service';
import {
  EXAMPLE_GUIDED_TOKENS,
  EXAMPLE_LABELS,
  GUIDED_EXAMPLE_FILL_STEP_MS,
  GUIDED_EXAMPLE_TOKEN_ORDER,
  GuidedExampleTokens,
  INTAKE_COUNTY_OPTIONS,
  INTAKE_INDUSTRY_OPTIONS,
  INTAKE_NEED_BANDS,
  INTAKE_RAISED_BANDS,
  INTAKE_REVENUE_BANDS,
  INTAKE_TEAM_BANDS,
  INTAKE_USE_OF_FUNDS_OPTIONS,
  composeGuidedDescription,
  industryLabel
} from './intake.constants';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Cycled second line of the hero headline — maps to the plan's founder-needs
 * framing, not generic adjectives, so keep these concrete. Deliberately
 * drawn from different verticals than the example chips/descriptions below
 * (health-it, aerospace, water, cybersecurity, consumer marketplace) so the
 * hero reads as its own claim about breadth, not a replay of the test cases.
 */
const HERO_TYPED_PHRASES = [
  'lithium recovery from mine tailings.',
  'adaptive learning for rural schools.',
  'drone-based wildfire detection.',
  'chip testing for defense primes.'
];

/** Describe-mode fallback pastes — kept verbatim, this preserves the tested pipeline. */
const EXAMPLE_DESCRIPTIONS = [
  'Utah AI healthcare SaaS — 15 employees, $1M ARR, $2.5M raised, reducing nurse administrative burden with AI, need $500K–$2M for R&D and commercialization',
  'Utah aerospace manufacturer — 35 employees, $3M revenue, $8M raised, lightweight composite components for space launch vehicles, need $2M–$5M for next production phase',
  'Utah water tech startup — 10 employees, $500K revenue, $1.5M raised, AI-powered sensors that detect municipal water-main leaks in real time, need $500K–$3M',
  'Utah cybersecurity startup — 22 employees, $2M ARR, $5M raised, AI threat detection for SMB networks, need $1M–$3M for product expansion and DoD market entry',
  'Utah consumer marketplace — 8 employees, $750K revenue, $1M raised, connecting parents with local youth sports/activities providers, need $250K–$1M for growth'
];

export type IntakeMode = 'guided' | 'describe';
export type GuidedTokenKey = keyof GuidedExampleTokens;

@Component({
  selector: 'app-intake',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatCheckboxModule,
    MatIconModule,
    AlertBannerComponent,
    SurveyingInterstitialComponent,
    TerrainFieldComponent,
    TypedLineComponent,
    StatStripComponent
  ],
  templateUrl: './intake.component.html',
  styleUrl: './intake.component.scss'
})
export class IntakeComponent implements AfterViewChecked {
  private readonly _router = inject(Router);
  private readonly _fundpathService = inject(FundpathService);
  private _shouldFocusPhone = false;
  private _exampleFillTimers: ReturnType<typeof setTimeout>[] = [];

  public readonly heroTypedPhrases = HERO_TYPED_PHRASES;

  @ViewChild('phoneInput') private _phoneInput?: ElementRef<HTMLInputElement>;

  // ── Mode switch ──────────────────────────────────────────────────────────
  public readonly mode = signal<IntakeMode>('guided');

  // ── Describe mode ────────────────────────────────────────────────────────
  public readonly description = signal('');

  // ── Guided mode ───────────────────────────────────────────────────────────
  public readonly companyName = signal('');
  public readonly industry = signal('');
  public readonly county = signal('');
  public readonly team = signal('');
  public readonly revenue = signal('');
  public readonly raised = signal('');
  public readonly amount = signal('');
  public readonly useOfFunds = signal('');

  public readonly activePicker = signal<GuidedTokenKey | null>(null);

  public readonly industryOptions = INTAKE_INDUSTRY_OPTIONS;
  public readonly countyOptions = INTAKE_COUNTY_OPTIONS;
  public readonly teamBands = INTAKE_TEAM_BANDS;
  public readonly revenueBands = INTAKE_REVENUE_BANDS;
  public readonly raisedBands = INTAKE_RAISED_BANDS;
  public readonly needBands = INTAKE_NEED_BANDS;
  public readonly useOfFundsOptions = INTAKE_USE_OF_FUNDS_OPTIONS;

  /** The six fields the "N of 6" progress counter tracks, per the plan's wording. */
  public readonly completionCount = computed(
    () =>
      [this.industry(), this.county(), this.team(), this.revenue(), this.raised(), this.amount()].filter(Boolean)
        .length
  );

  public readonly isGuidedComplete = computed(
    () => !!this.industry() && !!this.county() && !!this.team() && !!this.amount()
  );

  public readonly isSubmitting = signal(false);
  public readonly errorMessage = signal('');

  public readonly notifyEmail = signal('');
  public readonly notifyPhone = signal('');
  public readonly smsOptIn = signal(false);

  /** Purely visual collapse state for the notify/SMS block — the underlying email/phone/consent logic is untouched. */
  public readonly notifyExpanded = signal(false);

  public readonly exampleLabels = EXAMPLE_LABELS;
  public readonly exampleDescriptions = EXAMPLE_DESCRIPTIONS;

  public get existingRouteId(): string | null {
    return this._fundpathService.currentRouteId();
  }

  public getIndustryLabel(slug: string): string {
    return industryLabel(slug);
  }

  public setMode(mode: IntakeMode): void {
    this.mode.set(mode);
    this.activePicker.set(null);
  }

  public togglePicker(token: GuidedTokenKey): void {
    this.activePicker.set(this.activePicker() === token ? null : token);
  }

  public closePicker(): void {
    this.activePicker.set(null);
  }

  public selectIndustry(value: string): void {
    this.industry.set(value);
    this.closePicker();
  }

  public selectCounty(value: string): void {
    this.county.set(value);
    this.closePicker();
  }

  public selectTeam(value: string): void {
    this.team.set(value);
    this.closePicker();
  }

  public selectRevenue(value: string): void {
    this.revenue.set(value);
    this.closePicker();
  }

  public selectRaised(value: string): void {
    this.raised.set(value);
    this.closePicker();
  }

  public selectAmount(value: string): void {
    this.amount.set(value);
    this.closePicker();
  }

  public selectUseOfFunds(value: string): void {
    this.useOfFunds.set(value);
    this.closePicker();
  }

  public onDescriptionChange(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement;
    this.description.set(textarea.value);
  }

  public fillExample(index: number): void {
    if (this.mode() === 'describe') {
      this.description.set(EXAMPLE_DESCRIPTIONS[index]);

      return;
    }

    this._clearExampleFillTimers();

    const tokens = EXAMPLE_GUIDED_TOKENS[index];
    const setters: Record<GuidedTokenKey, (value: string) => void> = {
      industry: (value) => this.industry.set(value),
      county: (value) => this.county.set(value),
      team: (value) => this.team.set(value),
      revenue: (value) => this.revenue.set(value),
      raised: (value) => this.raised.set(value),
      amount: (value) => this.amount.set(value),
      useOfFunds: (value) => this.useOfFunds.set(value)
    };

    GUIDED_EXAMPLE_TOKEN_ORDER.forEach((key, step) => {
      const timer = setTimeout(() => {
        setters[key](tokens[key]);
      }, step * GUIDED_EXAMPLE_FILL_STEP_MS);
      this._exampleFillTimers.push(timer);
    });
  }

  private _clearExampleFillTimers(): void {
    this._exampleFillTimers.forEach((timer) => clearTimeout(timer));
    this._exampleFillTimers = [];
  }

  public clearError(): void {
    this.errorMessage.set('');
  }

  public onSmsOptInChange(checked: boolean): void {
    this.smsOptIn.set(checked);

    if (!checked) {
      this.notifyPhone.set('');
    } else {
      this._shouldFocusPhone = true;
    }
  }

  public ngAfterViewChecked(): void {
    if (this._shouldFocusPhone && this._phoneInput) {
      this._shouldFocusPhone = false;
      this._phoneInput.nativeElement.focus();
    }
  }

  public get submitLabel(): string {
    return this.smsOptIn() ? 'Yes, build my route' : 'Build my route';
  }

  public get isEmailValid(): boolean {
    const email = this.notifyEmail().trim();

    return !email || EMAIL_PATTERN.test(email);
  }

  public get canSubmit(): boolean {
    if (this.isSubmitting() || !this.isEmailValid) {
      return false;
    }

    return this.mode() === 'guided' ? this.isGuidedComplete() : !!this.description().trim();
  }

  public async submit(): Promise<void> {
    if (!this.canSubmit) {
      return;
    }

    const description =
      this.mode() === 'guided'
        ? composeGuidedDescription({
            companyName: this.companyName(),
            industry: this.industry(),
            county: this.county(),
            team: this.team(),
            revenue: this.revenue(),
            raised: this.raised(),
            amount: this.amount(),
            useOfFunds: this.useOfFunds()
          })
        : this.description().trim();

    this.isSubmitting.set(true);
    this.errorMessage.set('');

    try {
      const result = await this._fundpathService.buildRoute(description, {
        notifyEmail: this.notifyEmail().trim() || undefined,
        notifyPhone: this.smsOptIn() ? this.notifyPhone().trim() || undefined : undefined,
        smsOptIn: this.smsOptIn()
      });
      await this._router.navigate(['/route', result.routeId]);
    } catch {
      this.errorMessage.set('Something went wrong. Please try again.');
      this.isSubmitting.set(false);
    }
  }
}
