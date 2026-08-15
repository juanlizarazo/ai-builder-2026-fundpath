import { Timestamp } from '@angular/fire/firestore';

export type FormattableDate =
  | Timestamp
  | { _seconds: number }
  | { seconds: number }
  | string
  | number
  | Date
  | null
  | undefined;

export function formatDollars(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) { return ''; }

  if (amount >= 1_000_000) { return `$${(amount / 1_000_000).toFixed(1)}M`; }

  if (amount >= 1_000) { return `$${(amount / 1_000).toFixed(0)}K`; }

  return `$${amount}`;
}

export function formatDate(value: FormattableDate): string {
  const parsed = toDate(value);

  if (!parsed || Number.isNaN(parsed.getTime())) { return ''; }

  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function toDate(value: FormattableDate): Date | null {
  if (value === null || value === undefined) { return null; }

  if (value instanceof Date) { return value; }

  if (typeof value === 'number') { return new Date(value); }

  if (typeof value === 'string') { return new Date(value); }

  const candidate = value as { toDate?: unknown; _seconds?: unknown; seconds?: unknown };

  if (typeof candidate.toDate === 'function') {
    try {
      const converted: unknown = (candidate.toDate as () => unknown)();

      return converted instanceof Date ? converted : null;
    } catch {
      return null;
    }
  }

  if (typeof candidate._seconds === 'number') { return new Date(candidate._seconds * 1000); }

  if (typeof candidate.seconds === 'number') { return new Date(candidate.seconds * 1000); }

  return null;
}
