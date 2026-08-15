import { AfterViewChecked, Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AlertBannerComponent } from '@app/shared/components/alert-banner/alert-banner.component';
import { FundpathService } from '@app/core/services/fundpath.service';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EXAMPLE_LABELS = [
  'Example 1: Healthcare AI',
  'Example 2: Aerospace',
  'Example 3: Water Tech',
  'Example 4: Cybersecurity',
  'Example 5: Marketplace'
];

const EXAMPLE_DESCRIPTIONS = [
  'Utah AI healthcare SaaS — 15 employees, $1M ARR, $2.5M raised, reducing nurse administrative burden with AI, need $500K–$2M for R&D and commercialization',
  'Utah aerospace manufacturer — 35 employees, $3M revenue, $8M raised, lightweight composite components for space launch vehicles, need $2M–$5M for next production phase',
  'Utah water tech startup — 10 employees, $500K revenue, $1.5M raised, AI-powered sensors that detect municipal water-main leaks in real time, need $500K–$3M',
  'Utah cybersecurity startup — 22 employees, $2M ARR, $5M raised, AI threat detection for SMB networks, need $1M–$3M for product expansion and DoD market entry',
  'Utah consumer marketplace — 8 employees, $750K revenue, $1M raised, connecting parents with local youth sports/activities providers, need $250K–$1M for growth'
];

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
    MatProgressSpinnerModule,
    AlertBannerComponent
  ],
  templateUrl: './intake.component.html',
  styleUrl: './intake.component.scss'
})
export class IntakeComponent implements AfterViewChecked {
  private readonly _router = inject(Router);
  private readonly _fundpathService = inject(FundpathService);
  private _shouldFocusPhone = false;

  @ViewChild('phoneInput') private _phoneInput?: ElementRef<HTMLInputElement>;

  protected readonly description = signal('');
  protected readonly isSubmitting = signal(false);
  protected readonly errorMessage = signal('');

  protected readonly notifyEmail = signal('');
  protected readonly notifyPhone = signal('');
  protected readonly smsOptIn = signal(false);

  protected readonly exampleLabels = EXAMPLE_LABELS;
  protected readonly exampleDescriptions = EXAMPLE_DESCRIPTIONS;

  protected get existingRouteId(): string | null {
    return this._fundpathService.currentRouteId();
  }

  protected onDescriptionChange(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement;
    this.description.set(textarea.value);
  }

  protected fillExample(index: number): void {
    this.description.set(EXAMPLE_DESCRIPTIONS[index]);
  }

  protected clearError(): void {
    this.errorMessage.set('');
  }

  protected onSmsOptInChange(checked: boolean): void {
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

  protected get submitLabel(): string {
    return this.smsOptIn() ? 'Yes, build my route' : 'Build my route';
  }

  protected get isEmailValid(): boolean {
    const email = this.notifyEmail().trim();

    return !email || EMAIL_PATTERN.test(email);
  }

  protected async submit(): Promise<void> {
    if (!this.description().trim() || this.isSubmitting() || !this.isEmailValid) {
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set('');

    try {
      const result = await this._fundpathService.buildRoute(this.description().trim(), {
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
