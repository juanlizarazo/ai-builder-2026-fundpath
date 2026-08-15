import { FitTier, IRoute, IStop } from '../firestore';
import { APP_BASE_URL, dollarBand, escapeHtml, formatDate, routeLink } from './format.util';

/**
 * Design tokens mirror the app's "Basin & Range" system (app/src/styles.css
 * --fp-* custom properties) — literal hex values here because email clients
 * need every color inlined, no CSS custom properties.
 */
const COLOR = {
  ink: '#14181D',
  limestone: '#F6F4F0',
  basin: '#12454F',
  basinTint: '#E4EDEE',
  signal: '#D9502B',
  sage: '#2E6B4F',
  sand: '#E3DDD1',
  white: '#FFFFFF',
  muted: '#5B6169',
};

const TIER_CHIP: Record<FitTier, { label: string; color: string; tint: string }> = {
  'likely': { label: 'Likely fit', color: '#2E6B4F', tint: '#E5EFE9' },
  'potential': { label: 'Verify & apply', color: '#8A5D14', tint: '#F3E8D6' },
  'adjacent': { label: 'Adjacent match', color: '#8A4420', tint: '#F1E2D8' },
  'probably-not': { label: 'Long shot', color: '#6B4141', tint: '#EDE1E1' },
};

// A thin ridgeline of varying-height bars — the one signature graphic,
// literally the "Basin & Range" skyline the brand is named for.
const RIDGE_HEIGHTS = [10, 16, 9, 22, 13, 18, 8, 15, 11];
const RIDGE_COLORS = [COLOR.sand, COLOR.basin, COLOR.sand, COLOR.sage, COLOR.sand, COLOR.basin, COLOR.sand, COLOR.sand, COLOR.basin];

const FONT_DISPLAY = "'Archivo', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const FONT_BODY = "'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const FONT_MONO = "'IBM Plex Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace";

const RESPONSIVE_STYLE = `
  <style>
    body, table, td { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    @media only screen and (max-width: 600px) {
      .fp-px { padding-left: 20px !important; padding-right: 20px !important; }
      .fp-headline { font-size: 22px !important; }
      .fp-title { font-size: 18px !important; }
      .fp-data-cell { display: block !important; width: 100% !important; padding: 10px 0 !important; border-bottom: 1px solid ${COLOR.sand}; }
      .fp-data-cell:last-child { border-bottom: none !important; }
      .fp-data-cell + .fp-data-cell { border-left: none !important; padding-left: 0 !important; }
    }
  </style>
`;

function renderRidge(): string {
  const bars = RIDGE_HEIGHTS.map((height, i) => `
    <td width="${Math.round(100 / RIDGE_HEIGHTS.length)}%" valign="bottom" style="padding:0 1px;">
      <div style="height:${height}px; background-color:${RIDGE_COLORS[i]}; border-radius:2px 2px 0 0;">&nbsp;</div>
    </td>
  `).join('');

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>${bars}</tr>
    </table>
  `;
}

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
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700&family=Public+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap" rel="stylesheet" />
    <title>FundPath</title>
    ${RESPONSIVE_STYLE}
  </head>
  <body style="margin:0; padding:0; width:100% !important; min-width:100%; background-color:${COLOR.limestone};">
    <div style="display:none; max-height:0; overflow:hidden; opacity:0;">${escapeHtml(opts.headline)}&#8203;&#8203;&#8203;&#8203;&#8203;</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; background-color:${COLOR.limestone};">
      <tr>
        <td align="center" style="padding:0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:600px; margin:0 auto; background-color:${COLOR.white};">

            <tr>
              <td style="padding:22px 22px 0;">${renderRidge()}</td>
            </tr>

            <tr>
              <td class="fp-px" style="padding:20px 32px 0;">
                <span style="font-family:${FONT_DISPLAY}; font-size:20px; font-weight:700; color:${COLOR.ink}; letter-spacing:-0.02em;">FundPath</span>
              </td>
            </tr>

            <tr>
              <td class="fp-px" style="padding:26px 32px 0;">
                <div style="font-family:${FONT_MONO}; font-size:11px; font-weight:600; letter-spacing:0.08em; text-transform:uppercase; color:${COLOR.basin};">${escapeHtml(opts.eyebrow)}</div>
                <div class="fp-headline" style="font-family:${FONT_DISPLAY}; font-size:27px; font-weight:700; color:${COLOR.ink}; letter-spacing:-0.02em; margin-top:8px; line-height:1.22;">${escapeHtml(opts.headline)}</div>
              </td>
            </tr>

            <tr>
              <td class="fp-px" style="padding:20px 32px 0;">
                ${opts.contentHtml}
              </td>
            </tr>

            <tr>
              <td class="fp-px" style="padding:8px 32px 36px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
                  <tr>
                    <td style="border-radius:10px; background-color:${COLOR.basin};">
                      <a href="${opts.ctaLink}" style="display:block; padding:14px 24px; font-family:${FONT_BODY}; font-size:15px; font-weight:600; color:#ffffff; text-decoration:none; text-align:center;">${escapeHtml(opts.ctaLabel)}</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td class="fp-px" style="padding:20px 32px 30px; border-top:1px solid ${COLOR.sand};">
                <div style="font-family:${FONT_BODY}; font-size:12.5px; color:${COLOR.muted}; line-height:1.6;">
                  You'll keep getting these while FundPath is watching for new matches on your route.
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
  const chip = TIER_CHIP[stop.fitTier] ?? { label: stop.fitTierLabel, color: COLOR.muted, tint: COLOR.sand };
  const band = dollarBand(stop);
  const closeDate = formatDate(stop.closeDate);

  const dataRow = band || closeDate
    ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;">
        <tr>
          ${band ? `<td class="fp-data-cell" width="50%" style="padding:0 16px 0 0;">
            <div style="font-family:${FONT_MONO}; font-size:10.5px; letter-spacing:0.06em; text-transform:uppercase; color:${COLOR.muted};">Award range</div>
            <div style="font-family:${FONT_MONO}; font-size:16px; font-weight:600; color:${COLOR.ink}; margin-top:3px;">${band}</div>
          </td>` : ''}
          ${closeDate ? `<td class="fp-data-cell" width="50%" style="padding:0 0 0 16px; ${band ? `border-left:1px solid ${COLOR.sand};` : ''}">
            <div style="font-family:${FONT_MONO}; font-size:10.5px; letter-spacing:0.06em; text-transform:uppercase; color:${COLOR.muted};">Closes</div>
            <div style="font-family:${FONT_MONO}; font-size:16px; font-weight:600; color:${COLOR.signal}; margin-top:3px;">${closeDate}</div>
          </td>` : ''}
        </tr>
      </table>`
    : '';

  const whyFitBlock = stop.whyFit
    ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;">
        <tr>
          <td style="background-color:${COLOR.limestone}; border-radius:10px; padding:14px 16px;">
            <div style="font-family:${FONT_MONO}; font-size:10px; font-weight:600; letter-spacing:0.06em; text-transform:uppercase; color:${COLOR.basin};">Why this fits</div>
            <div style="font-family:${FONT_BODY}; font-size:14px; color:${COLOR.ink}; margin-top:6px; line-height:1.55;">${escapeHtml(stop.whyFit)}</div>
          </td>
        </tr>
      </table>`
    : '';

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="border-left:3px solid ${COLOR.basin}; padding:2px 0 2px 18px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td>
                <div class="fp-title" style="font-family:${FONT_DISPLAY}; font-size:19px; font-weight:700; color:${COLOR.ink}; line-height:1.3;">${escapeHtml(stop.title)}</div>
                <div style="font-family:${FONT_MONO}; font-size:11px; color:${COLOR.muted}; letter-spacing:0.04em; text-transform:uppercase; margin-top:5px;">${escapeHtml(stop.agency)}</div>
              </td>
              <td width="120" align="right" valign="top">
                <span style="display:inline-block; background-color:${chip.tint}; color:${chip.color}; font-family:${FONT_BODY}; font-size:11.5px; font-weight:600; padding:5px 12px; border-radius:999px; white-space:nowrap;">${escapeHtml(chip.label)}</span>
              </td>
            </tr>
          </table>
          ${dataRow}
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
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;">
      <tr>
        <td style="padding-left:18px;">
          <div style="font-family:${FONT_BODY}; font-size:12.5px; color:${COLOR.muted};">+ ${count} more opportunit${count === 1 ? 'y' : 'ies'} on your route</div>
        </td>
      </tr>
    </table>
  `;
}

export class EmailTemplateHelper {
  public static routeReady(route: IRoute, firstStop: IStop): string {
    return renderShell({
      eyebrow: 'Route ready',
      headline: "Here's where to start.",
      contentHtml: renderStopCard(firstStop),
      ctaLabel: 'Open your route',
      ctaLink: routeLink(route.id ?? ''),
    });
  }

  public static demoTest(route: IRoute, stop: IStop): string {
    return renderShell({
      eyebrow: 'Test alert',
      headline: "Here's what a real notification looks like.",
      contentHtml: renderStopCard(stop),
      ctaLabel: 'Open your route',
      ctaLink: routeLink(route.id ?? ''),
    });
  }

  public static newStops(route: IRoute, freshStops: IStop[]): string {
    const [topStop, ...rest] = freshStops;
    const headline = freshStops.length > 1 ? `We found ${freshStops.length} new opportunities.` : 'We found a new opportunity.';

    return renderShell({
      eyebrow: 'New match',
      headline,
      contentHtml: renderStopCard(topStop) + renderMoreNote(rest.length),
      ctaLabel: 'Open your route',
      ctaLink: routeLink(route.id ?? ''),
    });
  }
}
