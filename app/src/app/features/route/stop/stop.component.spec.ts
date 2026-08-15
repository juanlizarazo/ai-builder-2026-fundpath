import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Timestamp } from '@angular/fire/firestore';
import { describe, expect, it, vi } from 'vitest';

import { StopComponent } from './stop.component';
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

function createFixture(stop: IStop) {
  TestBed.configureTestingModule({
    imports: [StopComponent],
    providers: [provideNoopAnimations()]
  });

  const fixture = TestBed.createComponent(StopComponent);
  fixture.componentRef.setInput('stop', stop);
  fixture.detectChanges();

  return fixture;
}

describe('StopComponent', () => {
  it('renders the mono data strip from award, ALN, and close date', () => {
    const stop = makeStop({
      minAward: 500_000,
      maxAward: 2_000_000,
      aln: '47.041',
      closeDate: Timestamp.fromDate(new Date('2027-03-03'))
    });

    const fixture = createFixture(stop);
    const strip = fixture.nativeElement.querySelector('.stop-data-strip');

    expect(strip.textContent).toContain('$500K');
    expect(strip.textContent).toContain('$2.0M');
    expect(strip.textContent).toContain('ALN 47.041');
    expect(strip.textContent).toContain('Closes Mar 2, 2027');
  });

  it('does not show prose (whyFit) in the collapsed header', () => {
    const stop = makeStop({ whyFit: 'This company is an excellent fit because of its R&D core.' });
    const fixture = createFixture(stop);

    expect(fixture.nativeElement.querySelector('.stop-summary')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('This company is an excellent fit');
  });

  it('derives up to three fit chips from eligibility flags, mapping info/warn to check/warning icons', () => {
    const stop = makeStop({
      eligibilityFlags: [
        { severity: 'info', code: 'REGISTRATION_LEAD_TIME', message: 'Plenty of lead time.' },
        { severity: 'warn', code: 'SBIR_EMPLOYEE_LIMIT', message: 'Check headcount.' },
        { severity: 'block', code: 'NO_RD_CORE', message: 'Should not appear as a chip.' }
      ]
    });

    const fixture = createFixture(stop);
    const chips = Array.from(fixture.nativeElement.querySelectorAll('.fit-chip')) as HTMLElement[];

    expect(chips.length).toBe(2);
    expect(chips[0].textContent).toContain('✓');
    expect(chips[0].textContent).toContain('Registration lead time');
    expect(chips[1].textContent).toContain('⚠');
    expect(chips[1].textContent).toContain('Employee limit');
  });

  it('falls back to the raw code for an unmapped eligibility flag', () => {
    const stop = makeStop({
      eligibilityFlags: [{ severity: 'info', code: 'SOME_NEW_CODE', message: 'n/a' }]
    });

    const fixture = createFixture(stop);
    const chip = fixture.nativeElement.querySelector('.fit-chip');

    expect(chip.textContent).toContain('SOME_NEW_CODE');
  });

  it('emits `opened` with the stop when the collapsed card is activated — the Task 7 seam', () => {
    const stop = makeStop();
    const fixture = createFixture(stop);
    const openedSpy = vi.fn();
    fixture.componentInstance.opened.subscribe(openedSpy);

    const header = fixture.nativeElement.querySelector('.stop-header') as HTMLButtonElement;
    header.click();

    expect(openedSpy).toHaveBeenCalledWith(stop);
  });
});
