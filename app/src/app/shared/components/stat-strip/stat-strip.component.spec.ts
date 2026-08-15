import { TestBed } from '@angular/core/testing';
import { Timestamp } from '@angular/fire/firestore';
import { Observable, of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CorpusService } from '@app/core/services/corpus.service';

import { StatStripComponent } from './stat-strip.component';

const FAKE_STATS = {
  lastSyncedAt: Timestamp.fromDate(new Date(Date.now() - 4 * 60 * 60 * 1000)),
  countGrantsGov: 1000,
  countGrantsGovHydrated: 800,
  countSeed: 100,
  countSbir: 200,
  countUtah: 300,
  countAssistanceListings: 400,
  countUSASpending: 143,
  totalCount: 2143
};

function createFixture(stats$: Observable<unknown>) {
  TestBed.configureTestingModule({
    imports: [StatStripComponent],
    providers: [{ provide: CorpusService, useValue: { stats$ } }]
  });

  const fixture = TestBed.createComponent(StatStripComponent);
  fixture.detectChanges();

  return fixture;
}

function numberFields(fixture: ReturnType<typeof createFixture>): string[] {
  return Array.from(fixture.nativeElement.querySelectorAll('.stat-strip-number')).map(
    (el) => (el as HTMLElement).textContent ?? ''
  );
}

describe('StatStripComponent', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing until stats have loaded', () => {
    const fixture = createFixture(of(null));

    expect(fixture.nativeElement.querySelector('.stat-strip')).toBeNull();
  });

  it('animates the count up to the real total and shows source count + relative sync time', () => {
    vi.useFakeTimers();

    const fixture = createFixture(of(FAKE_STATS));

    const [countBefore] = numberFields(fixture);
    expect(countBefore.replace(/,/g, '')).not.toBe(String(FAKE_STATS.totalCount));

    vi.advanceTimersByTime(2000);
    fixture.detectChanges();

    const [countAfter, sourceCount] = numberFields(fixture);
    expect(countAfter.replace(/,/g, '')).toBe(String(FAKE_STATS.totalCount));
    expect(sourceCount).toBe('6');

    const syncedText = fixture.nativeElement.querySelector('.stat-strip')?.textContent ?? '';
    expect(syncedText).toContain('ago');
  });
});
