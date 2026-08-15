import { IRoute, IStop } from '../firestore';
import { EmailTemplateHelper } from './email-template.helper';
import { dollarBand, formatDate, routeLink } from './format.util';

const SHORT_LINE_MAX_LENGTH = 320;

export interface IComposedMessage {
  subject: string;
  body: string;
  html: string;
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

export class MessageHelper {
  public static routeReady(route: IRoute, firstStop: IStop): IComposedMessage {
    const link = routeLink(route.id ?? '');
    const facts = stopFacts(firstStop);
    const whyFitClause = firstStop.whyFit ? ` ${firstStop.whyFit.split('. ')[0].trim().replace(/\.?$/, '.')}` : '';

    let body = `FundPath: Your funding route is ready — ${facts}.${whyFitClause} ${link}`;
    body = truncateAtSentenceBoundary(body, SHORT_LINE_MAX_LENGTH);

    const subject = 'Your FundPath funding route is ready';
    const html = EmailTemplateHelper.routeReady(route, firstStop);

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
    const html = EmailTemplateHelper.newStops(route, freshStops);

    return { subject, body, html };
  }
}
