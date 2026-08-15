import { datePosition, linearPosition, monthTicks } from './scale.utils';

describe('scale.utils', () => {
  describe('monthTicks', () => {
    it('produces ticks between two dates', () => {
      const from = new Date('2026-01-01');
      const to = new Date('2026-06-01');

      const ticks = monthTicks(from, to);

      expect(ticks.length).toBeGreaterThan(0);

      for (const tick of ticks) {
        expect(tick.getTime()).toBeGreaterThanOrEqual(from.getTime());
        expect(tick.getTime()).toBeLessThanOrEqual(to.getTime());
      }
    });
  });

  describe('datePosition', () => {
    const from = new Date('2026-01-01');
    const to = new Date('2026-12-31');

    it('returns 0 at `from`', () => {
      expect(datePosition(from, from, to)).toBe(0);
    });

    it('returns 1 at `to`', () => {
      expect(datePosition(to, from, to)).toBe(1);
    });

    it('returns a fraction between 0 and 1 in the middle', () => {
      const mid = new Date('2026-07-01');
      const position = datePosition(mid, from, to);

      expect(position).toBeGreaterThan(0);
      expect(position).toBeLessThan(1);
    });

    it('clamps dates outside the range', () => {
      const before = new Date('2025-01-01');
      const after = new Date('2027-01-01');

      expect(datePosition(before, from, to)).toBe(0);
      expect(datePosition(after, from, to)).toBe(1);
    });
  });

  describe('linearPosition', () => {
    it('returns 0 for a value below the range', () => {
      expect(linearPosition(-10, 0, 100)).toBe(0);
    });

    it('returns a proportional position for a value within the range', () => {
      expect(linearPosition(25, 0, 100)).toBeCloseTo(0.25);
    });

    it('returns 1 for a value above the range', () => {
      expect(linearPosition(150, 0, 100)).toBe(1);
    });
  });
});
