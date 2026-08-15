import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { ApplicationService } from '@app/features/application/services/application.service';

import { StopDetailPanelComponent } from './stop-detail-panel.component';
import { FundPath } from '../../../../types/firestore';

type IStop = FundPath.Firestore.Routes.IStop;

function makeStop(overrides: Partial<IStop> = {}): IStop {
  return {
    id: 'stop-1',
    title: 'Small Business Innovation Research',
    agency: 'Department of Energy',
    fitTier: 'likely',
    fitTierLabel: 'Likely Fit',
    placement: 'primary',
    eligibilityFlags: [],
    tasks: [],
    ...overrides
  };
}

function createFixture(stop: IStop, isTaskChecked: ReturnType<typeof vi.fn> = vi.fn(() => false)) {
  TestBed.configureTestingModule({
    imports: [StopDetailPanelComponent],
    providers: [
      provideRouter([]),
      {
        provide: ApplicationService,
        useValue: { isTaskChecked, toggleTask: vi.fn() }
      }
    ]
  });

  const fixture = TestBed.createComponent(StopDetailPanelComponent);
  fixture.componentRef.setInput('stop', stop);
  fixture.componentRef.setInput('routeId', 'route-1');
  fixture.detectChanges();

  return fixture;
}

describe('StopDetailPanelComponent', () => {
  it('merges whyFit sentences with info-severity flags into the "why you fit" section', () => {
    const stop = makeStop({
      whyFit: 'You have a strong R&D core. Your team size fits the SBIR profile.',
      eligibilityFlags: [{ severity: 'info', code: 'REGISTRATION_LEAD_TIME', message: 'Plenty of lead time.' }]
    });

    const fixture = createFixture(stop);
    const rows = fixture.nativeElement.querySelectorAll('.fit-primary .fit-row');

    expect(rows.length).toBe(3);
    expect(rows[2].textContent).toContain('Plenty of lead time.');
  });

  it('merges whyIneligible sentences with warn/block flags into the "check before you apply" accordion, excluding info flags', () => {
    const stop = makeStop({
      whyIneligible: 'You may not meet the employee cap.',
      eligibilityFlags: [
        { severity: 'warn', code: 'SBIR_EMPLOYEE_LIMIT', message: 'Check headcount.' },
        { severity: 'block', code: 'NO_RD_CORE', message: 'Missing R&D core.' },
        { severity: 'info', code: 'REGISTRATION_LEAD_TIME', message: 'Should not appear here.' }
      ]
    });

    const fixture = createFixture(stop);
    const accordion = fixture.nativeElement.querySelector('.accordion') as HTMLElement;
    const rows = accordion.querySelectorAll('.fit-row--warn');

    expect(rows.length).toBe(3);
    expect(accordion.textContent).not.toContain('Should not appear here.');
  });

  it('auto-expands the "check before you apply" accordion when a block-severity flag is present', () => {
    const stop = makeStop({
      eligibilityFlags: [{ severity: 'block', code: 'NO_RD_CORE', message: 'Missing R&D core.' }]
    });

    const fixture = createFixture(stop);
    const accordion = fixture.nativeElement.querySelector('.accordion') as HTMLDetailsElement;

    expect(accordion.open).toBe(true);
  });

  it('shows the permanent "not an eligibility determination" disclaimer', () => {
    const fixture = createFixture(makeStop());

    expect(fixture.nativeElement.textContent).toContain('An assessment, not an eligibility determination.');
  });

  it('collapses the checklist to a count by default and expands on toggle', () => {
    const isTaskChecked = vi.fn((_state: Record<string, boolean>, task: { id: string }) => task.id === 'task-1');
    const stop = makeStop({
      tasks: [
        { id: 'task-1', label: 'Register on SAM.gov', completed: false },
        { id: 'task-2', label: 'Gather financials', completed: false }
      ]
    });

    const fixture = createFixture(stop, isTaskChecked);
    const toggle = fixture.nativeElement.querySelector('.checklist-toggle') as HTMLButtonElement;

    expect(toggle.textContent).toContain('Checklist 1/2');
    expect(fixture.nativeElement.querySelector('.task-list')).toBeNull();

    toggle.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.task-item').length).toBe(2);
  });

  it('renders the sticky header with Start my application and Program page links', () => {
    const stop = makeStop({ placement: 'primary', programUrl: 'https://example.gov/program' });
    const fixture = createFixture(stop);

    const primary = fixture.nativeElement.querySelector('.detail-cta-primary') as HTMLAnchorElement;
    const secondary = fixture.nativeElement.querySelector('.detail-cta-secondary') as HTMLAnchorElement;

    expect(primary.textContent).toContain('Start my application');
    expect(secondary.href).toContain('https://example.gov/program');
  });

  it('shows a deadline chip with days remaining when the stop has a closeDate', () => {
    const soon = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const stop = makeStop({ closeDate: soon as unknown as IStop['closeDate'] });

    const fixture = createFixture(stop);
    const chip = fixture.nativeElement.querySelector('.deadline-chip') as HTMLElement;

    expect(chip.textContent).toContain('days left');
    expect(chip.classList.contains('deadline-chip--urgent')).toBe(true);
  });

  it('positions the award-range bar and the founder ask marker proportionally within the domain', () => {
    const stop = makeStop({ minAward: 250_000, maxAward: 750_000 });
    const fixture = createFixture(stop);
    fixture.componentRef.setInput('askMax', 1_000_000);
    fixture.detectChanges();

    const instance = fixture.componentInstance as unknown as {
      minPct: () => number;
      maxPct: () => number;
      askPct: () => number | null;
    };

    // Domain is [0, max(750_000, 1_000_000) * 1.1] = [0, 1_100_000]
    expect(instance.minPct()).toBeCloseTo((250_000 / 1_100_000) * 100, 1);
    expect(instance.maxPct()).toBeCloseTo((750_000 / 1_100_000) * 100, 1);
    expect(instance.askPct()).toBeCloseTo((1_000_000 / 1_100_000) * 100, 1);
  });
});
