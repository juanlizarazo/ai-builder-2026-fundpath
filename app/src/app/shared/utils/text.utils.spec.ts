import { toSentences } from './text.utils';

describe('text.utils', () => {
  describe('toSentences', () => {
    it('returns an empty array for empty or nullish input', () => {
      expect(toSentences('')).toEqual([]);
      expect(toSentences(undefined)).toEqual([]);
      expect(toSentences(null)).toEqual([]);
    });

    it('returns a single-element array for a one-sentence paragraph', () => {
      expect(toSentences('This is a single sentence.')).toEqual(['This is a single sentence.']);
    });

    it('splits a multi-sentence paragraph on sentence boundaries', () => {
      const text = 'This grant funds early-stage startups. Awards range from $10K to $250K. Apply before the deadline!';

      expect(toSentences(text)).toEqual([
        'This grant funds early-stage startups.',
        'Awards range from $10K to $250K.',
        'Apply before the deadline!'
      ]);
    });

    it('does not split on a decimal number followed by lowercase text', () => {
      const text = 'The match requirement is 1.5x the award. Budgets are reviewed quarterly.';

      expect(toSentences(text)).toEqual([
        'The match requirement is 1.5x the award.',
        'Budgets are reviewed quarterly.'
      ]);
    });
  });
});
