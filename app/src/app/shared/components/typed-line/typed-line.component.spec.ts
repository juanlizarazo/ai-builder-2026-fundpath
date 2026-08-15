import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  TYPED_LINE_DELETE_SPEED_MS,
  TYPED_LINE_HOLD_MS,
  TYPED_LINE_LEAD_IN_MS,
  TYPED_LINE_TYPE_SPEED_MS,
  TypedLineComponent
} from './typed-line.component';

const PHRASES = ['first phrase.', 'second phrase.'];

function mockMatchMedia(reducedMotion: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('prefers-reduced-motion') && reducedMotion,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  })) as unknown as typeof window.matchMedia;
}

function createFixture() {
  TestBed.configureTestingModule({ imports: [TypedLineComponent] });
  const fixture = TestBed.createComponent(TypedLineComponent);
  fixture.componentInstance.phrases = PHRASES;
  fixture.detectChanges();

  return fixture;
}

describe('TypedLineComponent', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('settles immediately to the first phrase under prefers-reduced-motion, with no timers running', () => {
    mockMatchMedia(true);
    vi.useFakeTimers();

    const fixture = createFixture();

    expect(fixture.componentInstance.typedText).toBe(PHRASES[0]);
    expect(fixture.componentInstance.isSettled).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('types the first phrase after the lead-in, then holds, deletes, and cycles to the next phrase', () => {
    mockMatchMedia(false);
    vi.useFakeTimers();

    const fixture = createFixture();
    const component = fixture.componentInstance;

    // Before the lead-in elapses, nothing has typed yet.
    expect(component.typedText).toBe('');

    vi.advanceTimersByTime(TYPED_LINE_LEAD_IN_MS);
    // One character in.
    expect(component.typedText).toBe(PHRASES[0].substring(0, 1));

    // Finish typing the first phrase.
    vi.advanceTimersByTime(TYPED_LINE_TYPE_SPEED_MS * (PHRASES[0].length - 1));
    expect(component.typedText).toBe(PHRASES[0]);

    // Hold, then fully delete.
    vi.advanceTimersByTime(TYPED_LINE_HOLD_MS + TYPED_LINE_DELETE_SPEED_MS * PHRASES[0].length);
    expect(component.typedText).toBe('');

    // Types the second phrase next.
    vi.advanceTimersByTime(TYPED_LINE_TYPE_SPEED_MS * PHRASES[1].length);
    expect(component.typedText).toBe(PHRASES[1]);
  });

  it('loops back to the first phrase after cycling through the full list', () => {
    mockMatchMedia(false);
    vi.useFakeTimers();

    const fixture = createFixture();
    const component = fixture.componentInstance;

    const fullCycleMs =
      TYPED_LINE_LEAD_IN_MS +
      PHRASES.reduce(
        (total, phrase) =>
          total + TYPED_LINE_TYPE_SPEED_MS * phrase.length + TYPED_LINE_HOLD_MS + TYPED_LINE_DELETE_SPEED_MS * phrase.length,
        0
      );

    vi.advanceTimersByTime(fullCycleMs + TYPED_LINE_TYPE_SPEED_MS * PHRASES[0].length);

    expect(component.typedText).toBe(PHRASES[0]);
  });
});
