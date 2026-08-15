import type { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { IRoute, IStop } from '../firestore';
import { MessageHelper } from './message.helper';

function stubTimestamp(iso: string): Timestamp {
  return { toDate: (): Date => new Date(iso), toMillis: (): number => new Date(iso).getTime() } as unknown as Timestamp;
}

function buildStop(overrides: Partial<IStop> = {}): IStop {
  return {
    id: 'stop-1',
    title: 'Small Business Innovation Research',
    agency: 'NSF',
    fitTier: 'likely',
    fitTierLabel: 'Likely Fit',
    minAward: 250_000,
    maxAward: 500_000,
    closeDate: stubTimestamp('2026-12-01T00:00:00Z'),
    placement: 'primary',
    whyFit: 'Your R&D-heavy product matches this program closely. It funds early commercialization work.',
    eligibilityFlags: [],
    tasks: [],
    ...overrides,
  };
}

function buildRoute(overrides: Partial<IRoute> = {}): IRoute {
  return {
    id: 'route-1',
    uid: 'uid-1',
    profileId: 'uid-1',
    verdictLine: 'Strong match',
    stops: [],
    offRoute: [],
    deepPassStatus: 'complete',
    deepPassFoundNew: false,
    createdAt: stubTimestamp('2026-08-01T00:00:00Z'),
    updatedAt: stubTimestamp('2026-08-01T00:00:00Z'),
    ...overrides,
  };
}

describe('MessageHelper.routeReady', () => {
  it('composes a short line with program, agency, dollar band, close date, and link', () => {
    const route = buildRoute();
    const stop = buildStop();
    const message = MessageHelper.routeReady(route, stop);

    expect(message.body).toContain('Small Business Innovation Research');
    expect(message.body).toContain('NSF');
    expect(message.body).toContain('$250K–$500K');
    expect(message.body).toContain('Dec 1, 2026');
    expect(message.body).toContain('https://fundpath.dev/route/route-1');
    expect(message.body.length).toBeLessThanOrEqual(320);
  });

  it('never exceeds 320 chars given a pathological title', () => {
    const route = buildRoute();
    const stop = buildStop({
      title: 'A'.repeat(500),
      whyFit: 'B'.repeat(500),
    });
    const message = MessageHelper.routeReady(route, stop);

    expect(message.body.length).toBeLessThanOrEqual(320);
  });

  it('degrades gracefully when maxAward and closeDate are missing', () => {
    const route = buildRoute();
    const stop = buildStop({ minAward: undefined, maxAward: undefined, closeDate: undefined });
    const message = MessageHelper.routeReady(route, stop);

    expect(message.body).not.toContain('undefined');
    expect(message.body).not.toContain('NaN');
    expect(message.body).toContain('Small Business Innovation Research');
  });

  it('escapes user-derived text in the HTML body', () => {
    const route = buildRoute();
    const stop = buildStop({ title: '<script>alert(1)</script>' });
    const message = MessageHelper.routeReady(route, stop);

    expect(message.html).not.toContain('<script>');
    expect(message.html).toContain('&lt;script&gt;');
  });
});

describe('MessageHelper.demoTest', () => {
  it('composes a test-alert message from the real first stop', () => {
    const route = buildRoute();
    const stop = buildStop();
    const message = MessageHelper.demoTest(route, stop);

    expect(message.subject).toBe('FundPath: test notification');
    expect(message.body).toContain('test alert');
    expect(message.body).toContain('Small Business Innovation Research');
    expect(message.body).toContain('https://fundpath.dev/route/route-1');
    expect(message.body.length).toBeLessThanOrEqual(320);
  });
});

describe('MessageHelper.newStops', () => {
  it('leads with the highest-ranked stop and appends a +n more clause', () => {
    const route = buildRoute();
    const stops = [buildStop({ id: 'a', title: 'Top Program' }), buildStop({ id: 'b', title: 'Second Program' })];
    const message = MessageHelper.newStops(route, stops);

    expect(message.body).toContain('Top Program');
    expect(message.body).toContain('+1 more opportunities on your route.');
    expect(message.body).not.toContain('Second Program');
  });

  it('never exceeds 320 chars given a pathological title', () => {
    const route = buildRoute();
    const stops = [buildStop({ title: 'C'.repeat(500), whyFit: 'D'.repeat(500) })];
    const message = MessageHelper.newStops(route, stops);

    expect(message.body.length).toBeLessThanOrEqual(320);
  });

  it('truncates whyFit at a sentence boundary, never mid-word', () => {
    const route = buildRoute();
    const stops = [
      buildStop({
        title: 'Program',
        whyFit: 'This is a fairly long why-fit sentence that describes the match in detail. A second sentence follows.',
      }),
    ];
    const message = MessageHelper.newStops(route, stops);

    expect(message.body).toContain('This is a fairly long why-fit sentence that describes the match in detail.');
    expect(message.body).not.toContain('A second sentence');
  });
});
