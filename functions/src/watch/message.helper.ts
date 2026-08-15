import { Timestamp } from 'firebase-admin/firestore';
import { IRoute, IStop } from '../firestore';

const SHORT_LINE_MAX_LENGTH = 320;
const APP_BASE_URL = 'https://fundpath.dev';

export interface IComposedMessage {
  subject: string;
  body: string;
  html: string;
}

function formatDollars(amount: number | null | undefined): string {
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

function formatDate(value: Timestamp | undefined): string {
  if (!value) {
    return '';
  }
  const parsed = value.toDate();
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function dollarBand(stop: IStop): string {
  const min = formatDollars(stop.minAward);
  const max = formatDollars(stop.maxAward);
  if (min && max && min !== max) {
    return `${min}–${max}`;
  }
  return max || min || '';
}

function truncateAtSentenceBoundary(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  const truncated = text.slice(0, maxLength);
  const lastSentenceEnd = Math.max(truncated.lastIndexOf('. '), truncated.lastIndexOf('.'));
  if (lastSentenceEnd > 0) {
    return truncated.slice(0, lastSentenceEnd + 1);
  }
  const lastSpace = truncated.lastIndexOf(' ');
  return lastSpace > 0 ? `${truncated.slice(0, lastSpace)}…` : `${truncated}…`;
}

function stopFacts(stop: IStop): string {
  const parts: string[] = [`${stop.title} (${stop.agency})`];

  const band = dollarBand(stop);
  if (band) {
    parts.push(`up to ${band}`);
  }

  const closeDate = formatDate(stop.closeDate);
  if (closeDate) {
    parts.push(`closes ${closeDate}`);
  }

  return parts.join(', ');
}

function routeLink(routeId: string): string {
  return `${APP_BASE_URL}/route/${routeId}`;
}

export class MessageHelper {
  public static routeReady(route: IRoute, firstStop: IStop): IComposedMessage {
    const link = routeLink(route.id ?? '');
    const facts = stopFacts(firstStop);
    const whyFitClause = firstStop.whyFit ? ` ${firstStop.whyFit.split('. ')[0].trim().replace(/\.?$/, '.')}` : '';

    let body = `FundPath: Your funding route is ready — ${facts}.${whyFitClause} ${link}`;
    body = truncateAtSentenceBoundary(body, SHORT_LINE_MAX_LENGTH);

    const subject = 'Your FundPath funding route is ready';
    const html = `
      <p>Your funding route is ready. First stop:</p>
      <p><strong>${escapeHtml(firstStop.title)}</strong> (${escapeHtml(firstStop.agency)})</p>
      <p>${escapeHtml(facts)}</p>
      ${firstStop.whyFit ? `<p>${escapeHtml(firstStop.whyFit)}</p>` : ''}
      <p><a href="${link}">${link}</a></p>
    `.trim();

    return { subject, body, html };
  }

  public static newStops(route: IRoute, freshStops: IStop[]): IComposedMessage {
    const link = routeLink(route.id ?? '');
    const [topStop, ...rest] = freshStops;
    const facts = stopFacts(topStop);
    const whyFitClause = topStop.whyFit ? ` ${topStop.whyFit.split('. ')[0].trim().replace(/\.?$/, '.')}` : '';
    const moreClause = rest.length > 0 ? ` +${rest.length} more on your route.` : '';

    let body = `FundPath: New stop on your route — ${facts}.${whyFitClause}${moreClause} ${link}`;
    body = truncateAtSentenceBoundary(body, SHORT_LINE_MAX_LENGTH);

    const subject = freshStops.length > 1 ? `${freshStops.length} new stops on your FundPath route` : 'New stop on your FundPath route';
    const html = `
      <p>We found ${freshStops.length > 1 ? 'new stops' : 'a new stop'} on your funding route:</p>
      <p><strong>${escapeHtml(topStop.title)}</strong> (${escapeHtml(topStop.agency)})</p>
      <p>${escapeHtml(facts)}</p>
      ${topStop.whyFit ? `<p>${escapeHtml(topStop.whyFit)}</p>` : ''}
      ${rest.length > 0 ? `<p>+${rest.length} more on your route.</p>` : ''}
      <p><a href="${link}">${link}</a></p>
    `.trim();

    return { subject, body, html };
  }
}
