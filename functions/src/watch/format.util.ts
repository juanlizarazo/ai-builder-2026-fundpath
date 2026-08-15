import { Timestamp } from 'firebase-admin/firestore';
import { IStop } from '../firestore';

export const APP_BASE_URL = 'https://fundpath.dev';

export function formatDollars(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return '';
  }
  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(1)}M`;
  }
  if (amount >= 1_000) {
    return `$${(amount / 1_000).toFixed(0)}K`;
  }
  return `$${amount}`;
}

export function formatDate(value: Timestamp | undefined): string {
  if (!value) {
    return '';
  }
  const parsed = value.toDate();
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function dollarBand(stop: IStop): string {
  const min = formatDollars(stop.minAward);
  const max = formatDollars(stop.maxAward);
  if (min && max && min !== max) {
    return `${min}–${max}`;
  }
  return max || min || '';
}

export function routeLink(routeId: string): string {
  return `${APP_BASE_URL}/route/${routeId}`;
}
