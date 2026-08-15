/** Old `firstSentence`'s truncation bound for text with no terminator at all. */
const UNTERMINATED_FALLBACK_LENGTH = 120;

/**
 * Splits `text` into sentences.
 *
 * A split point is a sentence-ending punctuation mark (`.`, `!`, `?`)
 * followed by whitespace and then a capital letter — this keeps
 * mid-sentence punctuation (ellipses, decimals, "Inc.," etc.) from being
 * treated as a sentence boundary when it isn't followed by whitespace +
 * a capital letter, which is the same signal the previous ad hoc
 * `firstSentence` helper in `stop.component.ts` relied on. It is not a full
 * abbreviation-aware sentence tokenizer (e.g. "U.S. Department" will still
 * split after "U.S.").
 *
 * Absorbs that helper's job: callers that only need the lead sentence can
 * use `toSentences(text)[0]`. To keep that call site's behavior identical
 * to the old `firstSentence`, this always returns a non-empty array —
 * `['']` for empty/nullish input — and, when `text` has no sentence-ending
 * punctuation anywhere (so nothing to split on), returns the text truncated
 * to 120 characters rather than the whole (potentially very long) string,
 * matching `firstSentence`'s `text.substring(0, 120)` fallback.
 */
export function toSentences(text: string | undefined | null): string[] {
  if (!text) { return ['']; }

  if (!/[.!?]/.test(text)) {
    return [text.substring(0, UNTERMINATED_FALLBACK_LENGTH)];
  }

  const sentences = text
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);

  return sentences.length > 0 ? sentences : [''];
}
