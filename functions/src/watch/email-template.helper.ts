import { FitTier, IRoute, IStop } from '../firestore';
import { APP_BASE_URL, dollarBand, escapeHtml, formatDate, routeLink } from './format.util';

/**
 * Design tokens for the FundPath email shell. Kept local to this file
 * (not shared with app/) because email clients need every color literal
 * inlined — no CSS custom properties, no external stylesheet.
 */
const COLOR = {
  navyDeep: '#0B2530',
  navy: '#15445B',
  paper: '#FAF7F1',
  card: '#FFFFFF',
  ink: '#1F2A30',
  muted: '#6B7280',
  border: '#E7E1D3',
  amber: '#D97706',
  cream: '#F5F1E6',
};

const FONT_DISPLAY = "Georgia, 'Times New Roman', Times, serif";
const FONT_BODY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const FONT_MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";

const TIER_EMOJI: Record<FitTier, string> = {
  'likely': '🟢',
  'potential': '🟡',
  'adjacent': '🟠',
  'probably-not': '🔴',
};

interface IEmailShellOptions {
  eyebrow: string;
  headline: string;
  contentHtml: string;
  ctaLabel: string;
  ctaLink: string;
}

function renderShell(opts: IEmailShellOptions): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>FundPath</title>
  </head>
  <body style="margin:0; padding:0; background-color:${COLOR.paper};">
    <div style="display:none; max-height:0; overflow:hidden; opacity:0;">${escapeHtml(opts.headline)}&#8203;&#8203;&#8203;</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLOR.paper};">
      <tr>
        <td align="center" style="padding:24px 16px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:600px; background-color:${COLOR.card}; border-radius:10px; border:1px solid ${COLOR.border};">
            <tr>
              <td style="background-color:${COLOR.navyDeep}; padding:26px 36px; border-radius:10px 10px 0 0;">
                <span style="font-family:${FONT_DISPLAY}; font-size:22px; font-weight:700; color:${COLOR.cream}; letter-spacing:-0.3px;">FundPath</span>
                <div style="font-family:${FONT_BODY}; font-size:12px; color:#9FB4BE; margin-top:4px; letter-spacing:0.2px;">Government funding intelligence for Utah startups</div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 36px 4px;">
                <div style="font-family:${FONT_BODY}; font-size:11px; font-weight:700; letter-spacing:1.4px; text-transform:uppercase; color:${COLOR.amber};">${escapeHtml(opts.eyebrow)}</div>
                <div style="font-family:${FONT_DISPLAY}; font-size:23px; font-weight:700; color:${COLOR.navy}; margin-top:8px; line-height:1.3;">${escapeHtml(opts.headline)}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 36px 4px;">
                ${opts.contentHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:12px 36px 36px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="border-radius:6px; background-color:${COLOR.navy};">
                      <a href="${opts.ctaLink}" style="display:inline-block; padding:13px 26px; font-family:${FONT_BODY}; font-size:14px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:6px;">${escapeHtml(opts.ctaLabel)}</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 36px 28px; border-top:1px solid ${COLOR.border};">
                <div style="font-family:${FONT_BODY}; font-size:12px; color:${COLOR.muted}; line-height:1.6;">
                  You'll keep getting these while FundPath watches for new funding matches.
                  <a href="${APP_BASE_URL}/privacy" style="color:${COLOR.muted}; text-decoration:underline;">Privacy</a>
                  &nbsp;·&nbsp;
                  <a href="${APP_BASE_URL}/terms" style="color:${COLOR.muted}; text-decoration:underline;">Terms</a>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderStopCard(stop: IStop): string {
  const tierEmoji = TIER_EMOJI[stop.fitTier] ?? '⚪';
  const band = dollarBand(stop);
  const closeDate = formatDate(stop.closeDate);

  const factsRow = band || closeDate
    ? `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;">
        <tr>
          ${band ? `<td style="padding-right:24px;">
            <div style="font-family:${FONT_BODY}; font-size:10px; letter-spacing:0.6px; text-transform:uppercase; color:${COLOR.muted};">Award</div>
            <div style="font-family:${FONT_MONO}; font-size:15px; font-weight:700; color:${COLOR.navy};">${band}</div>
          </td>` : ''}
          ${closeDate ? `<td>
            <div style="font-family:${FONT_BODY}; font-size:10px; letter-spacing:0.6px; text-transform:uppercase; color:${COLOR.muted};">Closes</div>
            <div style="font-family:${FONT_MONO}; font-size:15px; font-weight:700; color:${COLOR.ink};">${closeDate}</div>
          </td>` : ''}
        </tr>
      </table>`
    : '';

  const whyFitBlock = stop.whyFit
    ? `<div style="font-family:${FONT_BODY}; font-style:italic; font-size:13px; color:${COLOR.ink}; margin-top:14px; padding-top:12px; border-top:1px solid ${COLOR.border}; line-height:1.55;">&#8220;${escapeHtml(stop.whyFit)}&#8221;</div>`
    : '';

  // The left rail is a deliberate echo of the route timeline in the web app —
  // the same dot-and-line motif that marks a stop there marks it here.
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0;">
      <tr>
        <td width="10" style="background-color:${COLOR.navy}; border-radius:6px 0 0 6px; font-size:0; line-height:0;">&nbsp;</td>
        <td style="background-color:${COLOR.paper}; border:1px solid ${COLOR.border}; border-left:none; border-radius:0 6px 6px 0; padding:16px 18px 18px;">
          <div style="font-family:${FONT_BODY}; font-size:11px; font-weight:700; letter-spacing:0.7px; text-transform:uppercase; color:${COLOR.muted};">${tierEmoji}&nbsp; ${escapeHtml(stop.fitTierLabel)}</div>
          <div style="font-family:${FONT_DISPLAY}; font-size:17px; font-weight:700; color:${COLOR.ink}; margin-top:6px; line-height:1.35;">${escapeHtml(stop.title)}</div>
          <div style="font-family:${FONT_BODY}; font-size:11px; color:${COLOR.muted}; letter-spacing:0.4px; text-transform:uppercase; margin-top:3px;">${escapeHtml(stop.agency)}</div>
          ${factsRow}
          ${whyFitBlock}
        </td>
      </tr>
    </table>
  `;
}

function renderMoreNote(count: number): string {
  if (count <= 0) {
    return '';
  }

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;">
      <tr>
        <td width="10" style="font-size:0; line-height:0;">&nbsp;</td>
        <td style="padding:2px 0 0 18px;">
          <div style="font-family:${FONT_BODY}; font-size:12px; color:${COLOR.muted};">+ ${count} more waiting on your route</div>
        </td>
      </tr>
    </table>
  `;
}

export class EmailTemplateHelper {
  public static routeReady(route: IRoute, firstStop: IStop): string {
    return renderShell({
      eyebrow: 'Your route is ready',
      headline: "Here's where to start.",
      contentHtml: renderStopCard(firstStop),
      ctaLabel: 'View your full route →',
      ctaLink: routeLink(route.id ?? ''),
    });
  }

  public static newStops(route: IRoute, freshStops: IStop[]): string {
    const [topStop, ...rest] = freshStops;
    const headline = freshStops.length > 1 ? `We found ${freshStops.length} new stops.` : 'We found a new stop.';

    return renderShell({
      eyebrow: 'New stop on your route',
      headline,
      contentHtml: renderStopCard(topStop) + renderMoreNote(rest.length),
      ctaLabel: 'View your full route →',
      ctaLink: routeLink(route.id ?? ''),
    });
  }
}
