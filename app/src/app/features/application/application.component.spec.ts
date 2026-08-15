import { TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { Firestore, Timestamp } from '@angular/fire/firestore';
import { Functions } from '@angular/fire/functions';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { AuthService } from '@app/core/services/auth.service';
import { FundpathService } from '@app/core/services/fundpath.service';

import { ApplicationComponent } from './application.component';
import { ApplicationService } from './services/application.service';
import { FundPath } from '../../../types/firestore';

type IRegistrationTimeline = FundPath.Firestore.Applications.IRegistrationTimeline;

const DAY_MS = 24 * 60 * 60 * 1000;

function daysFromNow(days: number): Timestamp {
  return Timestamp.fromDate(new Date(Date.now() + days * DAY_MS));
}

function makeTimeline(overrides: Partial<IRegistrationTimeline> = {}): IRegistrationTimeline {
  return {
    mode: 'deadline',
    closeDate: daysFromNow(30),
    steps: [
      {
        key: 'sam-gov',
        label: 'Register on SAM.gov',
        system: 'SAM.gov',
        durationBusinessDays: 10,
        startBy: daysFromNow(0),
        completeBy: daysFromNow(10)
      }
    ],
    feasible: true,
    slackBusinessDays: 12,
    headline: 'Yes — you can make this deadline.',
    ...overrides
  };
}

type INarrativeStarter = FundPath.Firestore.Applications.INarrativeStarter;
type NarrativeDrafts = Partial<Record<INarrativeStarter['section'], string>>;

function makeNarratives(): INarrativeStarter[] {
  return [
    { section: 'innovation', heading: 'Innovation', draft: 'Fresh innovation draft.' },
    { section: 'commercialization', heading: 'Commercialization', draft: 'Fresh commercialization draft.' },
    { section: 'team', heading: 'Team', draft: 'Fresh team draft.' },
    { section: 'alignment', heading: 'Alignment', draft: 'Fresh alignment draft.' }
  ];
}

interface ICreateFixtureOptions {
  timeline?: IRegistrationTimeline | null;
  narratives?: INarrativeStarter[];
  persistedNarrativeDrafts?: NarrativeDrafts;
  uid?: string;
  saveNarrativeDrafts?: ReturnType<typeof vi.fn>;
}

function createFixture(options: ICreateFixtureOptions = {}) {
  const kit: FundPath.Firestore.Applications.IStarterKit = {
    uid: 'uid-1',
    routeId: 'route-1',
    stopId: 'stop-1',
    opportunityTitle: 'Test opportunity',
    agency: 'Test Agency',
    timeline: options.timeline ?? makeTimeline(),
    documents: [],
    portals: [],
    submissionMechanics: [],
    narratives: options.narratives ?? [],
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now()
  };

  const user = options.uid ? { uid: options.uid } : null;

  TestBed.configureTestingModule({
    imports: [ApplicationComponent],
    providers: [
      provideRouter([]),
      { provide: Firestore, useValue: {} },
      { provide: Functions, useValue: {} },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: { get: (key: string) => (key === 'routeId' ? 'route-1' : 'stop-1') } } }
      },
      {
        provide: FundpathService,
        useValue: {
          watchRoute: vi.fn().mockReturnValue(of(null)),
          watchProfile: vi.fn().mockReturnValue(of(null))
        }
      },
      { provide: AuthService, useValue: { user$: of(user) } },
      {
        provide: ApplicationService,
        useValue: {
          generateStarterKit: vi.fn().mockResolvedValue(kit),
          watchApplicantDetails: vi.fn().mockReturnValue(of(undefined)),
          watchNarrativeDrafts: vi.fn().mockReturnValue(of(options.persistedNarrativeDrafts)),
          saveNarrativeDrafts: options.saveNarrativeDrafts ?? vi.fn().mockResolvedValue(undefined),
          isTaskChecked: vi.fn(() => false),
          toggleTask: vi.fn()
        }
      }
    ]
  });

  const fixture = TestBed.createComponent(ApplicationComponent);
  fixture.detectChanges();

  return fixture;
}

interface IApplicationComponentTestSurface {
  currentLeg(): 0 | 1 | 2 | 3 | 4;
  goToLeg(leg: 0 | 1 | 2 | 3 | 4): void;
  nextLeg(): void;
  previousLeg(): void;
  daysAvailable(): number | null;
  daysNeeded(): number | null;
  slackDays(): number | null;
  currentStep(): IRegistrationTimeline['steps'][number] | null;
  doneStepsCount(): number;
  checkedStepKeys(): string[];
  toggleRunwayStep(key: string): void;
  narrativeDraftsState(): NarrativeDrafts;
  updateNarrativeDraft(section: INarrativeStarter['section'], value: string): void;
  draftedNarrativeCount(): number;
}

function asTestSurface(fixture: ReturnType<typeof createFixture>): IApplicationComponentTestSurface {
  return fixture.componentInstance as unknown as IApplicationComponentTestSurface;
}

describe('ApplicationComponent — Sherpa leg shell', () => {
  it('starts on Leg 0 and advances/retreats via nextLeg/previousLeg/goToLeg', async () => {
    const fixture = createFixture({ timeline: makeTimeline() });
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
    const surface = asTestSurface(fixture);

    expect(surface.currentLeg()).toBe(0);

    surface.nextLeg();
    expect(surface.currentLeg()).toBe(1);

    surface.previousLeg();
    expect(surface.currentLeg()).toBe(0);

    surface.goToLeg(3);
    expect(surface.currentLeg()).toBe(3);
  });

  it('does not advance past Leg 4 or retreat past Leg 0', async () => {
    const fixture = createFixture({ timeline: makeTimeline() });
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
    const surface = asTestSurface(fixture);

    surface.previousLeg();
    expect(surface.currentLeg()).toBe(0);

    surface.goToLeg(4);
    surface.nextLeg();
    expect(surface.currentLeg()).toBe(4);
  });

  it('computes days-available/needed/slack from the timeline without recomputing slackBusinessDays', async () => {
    const timeline = makeTimeline({
      closeDate: daysFromNow(20),
      steps: [
        { key: 'a', label: 'A', system: 'SAM.gov', durationBusinessDays: 10, startBy: daysFromNow(0), completeBy: daysFromNow(10) },
        { key: 'b', label: 'B', system: 'Grants.gov', durationBusinessDays: 3, startBy: daysFromNow(10), completeBy: daysFromNow(13) }
      ],
      slackBusinessDays: 5
    });

    const fixture = createFixture({ timeline });
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
    const surface = asTestSurface(fixture);

    expect(surface.daysNeeded()).toBe(13); // 10 + 3, summed from steps — not re-derived from dates
    expect(surface.slackDays()).toBe(5); // rendered as-is from the backend, never recomputed
    expect(surface.daysAvailable()).toBeGreaterThan(0);
  });

  it('renders "This one\'s tight." in the infeasible path using the backend headline verbatim', async () => {
    const timeline = makeTimeline({ feasible: false, headline: 'You need 3 more days than you have.' });
    const fixture = createFixture({ timeline });
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("This one's tight.");
    expect(fixture.nativeElement.textContent).toContain('You need 3 more days than you have.');
  });
});
