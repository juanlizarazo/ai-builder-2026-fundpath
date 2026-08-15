import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TerrainFieldComponent } from './terrain-field.component';

function mockMatchMedia(matches: { reducedMotion?: boolean; coarsePointer?: boolean }) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches:
      (query.includes('prefers-reduced-motion') && !!matches.reducedMotion) ||
      (query.includes('pointer: coarse') && !!matches.coarsePointer),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  })) as unknown as typeof window.matchMedia;
}

describe('TerrainFieldComponent', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts a rAF loop and adds a passive pointermove listener when motion is allowed', () => {
    mockMatchMedia({});
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

    TestBed.configureTestingModule({ imports: [TerrainFieldComponent] });
    const fixture = TestBed.createComponent(TerrainFieldComponent);
    fixture.detectChanges();

    expect(rafSpy).toHaveBeenCalled();
    expect(addEventListenerSpy).toHaveBeenCalledWith('pointermove', expect.any(Function), { passive: true });
  });

  it('does not add a pointermove listener or set CSS vars under prefers-reduced-motion', () => {
    mockMatchMedia({ reducedMotion: true });
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

    TestBed.configureTestingModule({ imports: [TerrainFieldComponent] });
    const fixture = TestBed.createComponent(TerrainFieldComponent);
    fixture.detectChanges();

    expect(addEventListenerSpy).not.toHaveBeenCalledWith('pointermove', expect.any(Function), { passive: true });
    // Parked at center: the light/layers fall back to their CSS default (unset --mx/--px etc.), never written by the loop.
    expect(fixture.nativeElement.style.getPropertyValue('--mx')).toBe('');
  });

  it('does not add a pointermove listener for a coarse (touch) pointer', () => {
    mockMatchMedia({ coarsePointer: true });
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

    TestBed.configureTestingModule({ imports: [TerrainFieldComponent] });
    const fixture = TestBed.createComponent(TerrainFieldComponent);
    fixture.detectChanges();

    expect(addEventListenerSpy).not.toHaveBeenCalledWith('pointermove', expect.any(Function), { passive: true });
    expect(fixture.nativeElement.style.getPropertyValue('--px')).toBe('');
  });

  it('cleans up the pointermove listener and rAF on destroy', () => {
    mockMatchMedia({});
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(42);
    const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame');
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

    TestBed.configureTestingModule({ imports: [TerrainFieldComponent] });
    const fixture = TestBed.createComponent(TerrainFieldComponent);
    fixture.detectChanges();
    fixture.destroy();

    expect(cancelSpy).toHaveBeenCalledWith(42);
    expect(removeEventListenerSpy).toHaveBeenCalledWith('pointermove', expect.any(Function));
  });
});
