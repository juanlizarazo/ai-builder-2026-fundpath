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
 * use `toSentences(text)[0]`.
 */
export function toSentences(text: string | undefined | null): string[] {
  if (!text) { return []; }

  return text
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}
