import { toSentences } from './text.utils';

describe('text.utils', () => {
  describe('toSentences', () => {
    it('returns [\'\'] for empty or nullish input, matching the old firstSentence', () => {
      expect(toSentences('')).toEqual(['']);
      expect(toSentences(undefined)).toEqual(['']);
      expect(toSentences(null)).toEqual(['']);
    });

    it('truncates to 120 characters when there is no sentence-ending punctuation at all', () => {
      const noTerminator = 'a'.repeat(200);

      const result = toSentences(noTerminator);

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(noTerminator.substring(0, 120));
      expect(result[0]).toHaveLength(120);
    });

    it('does not truncate short unterminated text', () => {
      const short = 'no punctuation here just words';

      expect(toSentences(short)).toEqual([short]);
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
