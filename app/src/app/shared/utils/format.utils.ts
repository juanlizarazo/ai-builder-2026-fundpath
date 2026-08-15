import { Timestamp } from '@angular/fire/firestore';

export function formatDollars(amount: number): string {
  if (amount >= 1_000_000) { return `$${(amount / 1_000_000).toFixed(1)}M`; }
  if (amount >= 1_000) { return `$${(amount / 1_000).toFixed(0)}K`; }
  return `$${amount}`;
}

export function formatDate(ts: Timestamp | undefined): string {
  if (!ts) { return ''; }
  return ts.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
