import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute } from '@angular/router';
import { provideRouter } from '@angular/router';
import { Firestore, Timestamp } from '@angular/fire/firestore';
import { Functions } from '@angular/fire/functions';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { AuthService } from '@app/core/services/auth.service';
import { FundpathService } from '@app/core/services/fundpath.service';
import { LoadingService } from '@app/core/services/loading.service';
import { NotificationsService } from '@app/core/services/notifications.service';
import { datePosition } from '@app/shared/utils/scale.utils';

import { RouteComponent } from './route.component';
import { FundPath } from '../../../types/firestore';

type IStop = FundPath.Firestore.Routes.IStop;
type IRoute = FundPath.Firestore.Routes.IRoute;

function makeStop(overrides: Partial<IStop> & Pick<IStop, 'id' | 'title'>): IStop {
  return {
    agency: 'Test Agency',
    fitTier: 'likely',
    fitTierLabel: 'Likely Fit',
    placement: 'primary',
    eligibilityFlags: [],
    tasks: [],
    ...overrides
  };
}

function daysFromNow(days: number): Timestamp {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return Timestamp.fromDate(date);
}

function makeRoute(overrides: Partial<IRoute> = {}): IRoute {
  return {
    uid: 'uid-1',
    profileId: 'profile-1',
    verdictLine: 'You have a strong path.',
    stops: [],
    offRoute: [],
    deepPassStatus: 'complete',
    deepPassFoundNew: false,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    ...overrides
  };
}

type IStartupProfile = FundPath.Firestore.Profiles.IStartupProfile;

function createFixture(route: IRoute | null, profile: IStartupProfile | null = null) {
  TestBed.configureTestingModule({
    imports: [RouteComponent],
    providers: [
      provideRouter([]),
      provideNoopAnimations(),
      { provide: Firestore, useValue: {} },
      { provide: Functions, useValue: {} },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: { get: () => null } } }
      },
      {
        provide: FundpathService,
        useValue: {
          currentRoute: () => route,
          watchRoute: vi.fn(),
          watchProfile: vi.fn().mockReturnValue(of(profile))
        }
      },
      { provide: AuthService, useValue: { user$: of(null) } },
      {
        provide: NotificationsService,
        useValue: { notifications: () => [], unreadCount: () => 0 }
      },
      { provide: LoadingService, useValue: { show: vi.fn(), hide: vi.fn() } }
    ]
  });

  const fixture = TestBed.createComponent(RouteComponent);
  fixture.detectChanges();

  return fixture;
}

/**
 * The test-only surface used to exercise `RouteComponent`'s protected
 * computeds/methods directly (scale correctness, summary rail, seams) —
 * the same pattern would apply via `component as any` but this keeps the
 * assertions readably typed.
 */
interface IRouteComponentTestSurface {
  diagramDomain(): [Date, Date];
  diagramStations(): { stop: IStop; position: number; kind: 'primary' | 'alongside' }[];
  stopCount(): number;
  awardRange(): { min: number; max: number } | null;
  nextDeadlineDays(): number | null;
  isDeadlineUrgent(): boolean;
  offRouteStops(): IStop[];
  selectedStopForDetail(): IStop | null;
  openStopDetail(stop: IStop): void;
}

function asTestSurface(fixture: ReturnType<typeof createFixture>): IRouteComponentTestSurface {
  return fixture.componentInstance as unknown as IRouteComponentTestSurface;
}

describe('RouteComponent', () => {
  describe('route path — scale correctness', () => {
    it('places a stop at month 12 of the 24-month domain at ~50% position', () => {
      const route = makeRoute({
        stops: [
          makeStop({ id: 'a', title: 'Month 0 stop', placement: 'primary', sequenceMonth: 0 }),
          makeStop({ id: 'b', title: 'Month 12 stop', placement: 'primary', sequenceMonth: 12 }),
          makeStop({ id: 'c', title: 'Month 18 stop', placement: 'primary', sequenceMonth: 18 })
        ]
      });

      const fixture = createFixture(route);
      const component = asTestSurface(fixture);

      const stations = component.diagramStations();
      const monthTwelveStation = stations.find(station => station.stop.id === 'b');

      expect(monthTwelveStation).toBeDefined();
      expect(monthTwelveStation!.position).toBeCloseTo(0.5, 1);

      // Cross-check directly against the shared scale util with the same domain,
      // per the task's scale-correctness requirement.
      const [from, to] = component.diagramDomain();
      const twelveMonthsOut = new Date(from);
      twelveMonthsOut.setMonth(twelveMonthsOut.getMonth() + 12);
      expect(datePosition(twelveMonthsOut, from, to)).toBeCloseTo(0.5, 1);
    });

    it('places month 0 near the start and month 18 further along than month 12', () => {
      const route = makeRoute({
        stops: [
          makeStop({ id: 'a', title: 'Month 0 stop', placement: 'primary', sequenceMonth: 0 }),
          makeStop({ id: 'b', title: 'Month 12 stop', placement: 'primary', sequenceMonth: 12 }),
          makeStop({ id: 'c', title: 'Month 18 stop', placement: 'primary', sequenceMonth: 18 })
        ]
      });

      const fixture = createFixture(route);
      const component = asTestSurface(fixture);
      const stations = component.diagramStations();

      const monthZero = stations.find(s => s.stop.id === 'a')!.position;
      const monthTwelve = stations.find(s => s.stop.id === 'b')!.position;
      const monthEighteen = stations.find(s => s.stop.id === 'c')!.position;

      expect(monthZero).toBeCloseTo(0, 1);
      expect(monthTwelve).toBeLessThan(monthEighteen);
      expect(monthEighteen).toBeCloseTo(0.75, 1);
    });

    it('renders one station node per primary/alongside stop', () => {
      const route = makeRoute({
        stops: [
          makeStop({ id: 'a', title: 'Primary', placement: 'primary', sequenceMonth: 1 }),
          makeStop({ id: 'b', title: 'Alongside', placement: 'alongside', sequenceMonth: 1 })
        ]
      });

      const fixture = createFixture(route);
      fixture.detectChanges();

      const nodes = fixture.nativeElement.querySelectorAll('.route-fallback-row');
      expect(nodes.length).toBe(2);
    });
  });

  describe('header summary rail', () => {
    it('computes stop count, award range, nearest deadline, and ruled-out count', () => {
      const route = makeRoute({
        stops: [
          makeStop({
            id: 'a', title: 'A', placement: 'primary', sequenceMonth: 0,
            minAward: 500_000, maxAward: 2_000_000, closeDate: daysFromNow(30)
          }),
          makeStop({
            id: 'b', title: 'B', placement: 'primary', sequenceMonth: 4,
            minAward: 1_000_000, maxAward: 4_500_000, closeDate: daysFromNow(200)
          })
        ],
        offRoute: [makeStop({ id: 'c', title: 'C', placement: 'off-route' })]
      });

      const fixture = createFixture(route);
      const component = asTestSurface(fixture);

      expect(component.stopCount()).toBe(2);
      expect(component.awardRange()).toEqual({ min: 500_000, max: 4_500_000 });
      expect(component.nextDeadlineDays()).toBe(30);
      expect(component.isDeadlineUrgent()).toBe(true);
      expect(component.offRouteStops().length).toBe(1);

      fixture.detectChanges();
      const rail = fixture.nativeElement.querySelector('.summary-rail');
      expect(rail.textContent).toContain('2 PROGRAMS');
      expect(rail.textContent).toContain('1 RULED OUT');
    });

    it('is not urgent when the nearest deadline is 45+ days out', () => {
      const route = makeRoute({
        stops: [
          makeStop({ id: 'a', title: 'A', placement: 'primary', sequenceMonth: 0, closeDate: daysFromNow(90) })
        ]
      });

      const fixture = createFixture(route);
      expect(asTestSurface(fixture).isDeadlineUrgent()).toBe(false);
    });
  });

  describe('ruled-out stops', () => {
    it('collapses off-route stops to a single toggle that expands to one-line rows', () => {
      const route = makeRoute({
        offRoute: [
          makeStop({
            id: 'x', title: 'Ineligible Program', placement: 'off-route',
            eligibilityFlags: [{ severity: 'block', code: 'NO_RD_CORE', message: 'No R&D core.' }]
          })
        ]
      });

      const fixture = createFixture(route);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.ruled-out-list')).toBeNull();

      const toggle = fixture.nativeElement.querySelector('.ruled-out-toggle') as HTMLButtonElement;
      expect(toggle.textContent).toContain('1 ruled out');

      toggle.click();
      fixture.detectChanges();

      const row = fixture.nativeElement.querySelector('.ruled-out-row');
      expect(row.textContent).toContain('Ineligible Program');
      expect(row.textContent).toContain('No R&D core.');
    });
  });

  describe('abstention restyle', () => {
    it('renders the confident-decision headline instead of the old warning-style copy', () => {
      const route = makeRoute({
        stops: [],
        nonGrantAlternatives: [makeStop({ id: 'n', title: 'Non-grant', placement: 'non-grant' })]
      });
      const fixture = createFixture(route);
      fixture.detectChanges();

      const headline = fixture.nativeElement.querySelector('.abstention-headline');
      expect(headline.textContent).toContain("No strong federal grant match — and that's the honest answer.");
      expect(fixture.nativeElement.querySelector('.abstention-badge')).toBeNull();
    });
  });

  describe('stop-detail selection', () => {
    it('openStopDetail records the selected stop without any UI consuming it yet', () => {
      const fixture = createFixture(makeRoute());
      const component = asTestSurface(fixture);
      const stop = makeStop({ id: 'z', title: 'Z', placement: 'primary' });

      expect(component.selectedStopForDetail()).toBeNull();
      component.openStopDetail(stop);
      expect(component.selectedStopForDetail()).toBe(stop);
    });
  });
});
