import * as fs from 'fs';
import * as path from 'path';
import { PDFDocument, PDFFont, PDFPage, StandardFonts } from 'pdf-lib';
import { Timestamp } from 'firebase-admin/firestore';
import { ISf424FillValues } from './application.interfaces';
import { ISf424FieldPosition, SF424_COORDINATES, Sf424FieldKey } from './sf424.coordinates';

/** Where the bundled base form lives, resolved so it works from `lib/` after `tsc`. */
export const SF424_BASE_PDF_PATH = path.join(__dirname, '../../assets/sf424-base.pdf');

const DEFAULT_FONT_SIZE = 9;
const DEFAULT_APPLICANT_TYPE = 'Small Business';

/**
 * Fills the real SF-424 by *overlaying* the founder's values on the official
 * grants.gov readonly render of the form.
 *
 * Why an overlay: the fillable SF424_4_0-V4.0 is an XFA dynamic PDF —
 * `NeedsRendering: true`, `/XFA` present, and zero AcroForm field names — which
 * pdf-lib cannot fill. The readonly render is a plain, static, non-XFA PDF that
 * opens anywhere, so we draw text at measured box coordinates
 * (`sf424.coordinates.ts`) instead of setting form fields. SF-424 is a US
 * government work, so bundling it is fine.
 *
 * 8b (EIN/TIN) and 8c (UEI) are never written: FundPath does not collect them.
 */
export class SF424Helper {
  /** Reads the bundled base PDF off disk. */
  public static loadBasePdf(): Uint8Array {
    return new Uint8Array(fs.readFileSync(SF424_BASE_PDF_PATH));
  }

  /** Draws `values` onto `basePdfBytes` and returns the saved PDF bytes. */
  public static async fill(basePdfBytes: Uint8Array, values: ISf424FillValues): Promise<Uint8Array> {
    const doc = await PDFDocument.load(basePdfBytes);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const pages = doc.getPages();

    const draw = (key: Sf424FieldKey, value: string | undefined): void => {
      const text = (value ?? '').trim();

      if (text.length === 0) {
        return;
      }

      const position = SF424_COORDINATES[key];
      const page = pages[position.page];

      if (!page) {
        return;
      }

      SF424Helper._drawValue(page, font, position, text);
    };

    // 1 Type of Submission / 2 Type of Application — checkboxes, not text.
    if (values.typeOfSubmission === 'Application') {
      draw('typeOfSubmissionCheckbox', 'X');
    }

    if (values.typeOfApplication === 'New') {
      draw('typeOfApplicationCheckbox', 'X');
    }

    // 8a legal name, 8d address, 8f contact.
    draw('legalName', values.legalName);
    draw('street1', values.street1);
    draw('street2', values.street2);
    draw('city', values.city);
    draw('county', values.county);
    draw('state', values.state);
    draw('zip', values.zip);
    draw('contactFirstName', values.contactFirstName);
    draw('contactLastName', values.contactLastName);
    draw('contactTitle', values.contactTitle);
    draw('contactPhone', values.contactPhone);
    draw('contactEmail', values.contactEmail);

    // 9 type of applicant, 11 ALN, 12 funding opportunity, 15 project title.
    draw('applicantType', values.applicantType ?? DEFAULT_APPLICANT_TYPE);
    draw('alnNumber', values.alnNumber);
    draw('alnTitle', values.alnTitle);
    draw('fundingOpportunityNumber', values.fundingOpportunityNumber);
    draw('fundingOpportunityTitle', values.fundingOpportunityTitle);
    draw('projectTitle', values.projectTitle);

    // 17 proposed project dates, 18a estimated federal funding.
    draw('projectStartDate', SF424Helper.formatDate(values.projectStartDate));
    draw('projectEndDate', SF424Helper.formatDate(values.projectEndDate));
    draw('federalFunding', SF424Helper.formatCurrency(values.fundingRequested));

    return doc.save();
  }

  /** `MM/DD/YYYY` in UTC, matching how the form is filled by hand. */
  public static formatDate(value?: Timestamp): string | undefined {
    if (!value) {
      return undefined;
    }

    const date = value.toDate();
    const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
    const day = `${date.getUTCDate()}`.padStart(2, '0');

    return `${month}/${day}/${date.getUTCFullYear()}`;
  }

  /** `1,234,567.00` — field 18 is already labelled "Estimated Funding ($)". */
  public static formatCurrency(value?: number): string | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return undefined;
    }

    return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // ---- drawing -------------------------------------------------------------------

  private static _drawValue(page: PDFPage, font: PDFFont, position: ISf424FieldPosition, text: string): void {
    const size = position.size ?? DEFAULT_FONT_SIZE;
    const maxLines = position.maxLines ?? 1;
    const lineHeight = position.lineHeight ?? size + 2;
    const lines = SF424Helper._layoutLines(font, text, size, position.maxWidth, maxLines);

    lines.forEach((line, index) => {
      const width = font.widthOfTextAtSize(line, size);
      const x = position.align === 'right' ? position.x - width : position.x;

      page.drawText(line, { x, y: position.y - index * lineHeight, size, font });
    });
  }

  /**
   * Wraps `text` to at most `maxLines` lines that each fit `maxWidth`, truncating
   * with an ellipsis rather than letting a long value run over a printed label or
   * out of its box.
   */
  private static _layoutLines(
    font: PDFFont,
    text: string,
    size: number,
    maxWidth: number | undefined,
    maxLines: number,
  ): string[] {
    if (!maxWidth) {
      return [text];
    }

    const words = text.split(/\s+/).filter(word => word.length > 0);
    const lines: string[] = [];
    let current = '';

    for (const word of words) {
      const candidate = current.length === 0 ? word : `${current} ${word}`;

      if (font.widthOfTextAtSize(candidate, size) <= maxWidth || current.length === 0) {
        current = candidate;
        continue;
      }

      lines.push(current);
      current = word;

      if (lines.length === maxLines) {
        break;
      }
    }

    if (lines.length < maxLines && current.length > 0) {
      lines.push(current);
    }

    return lines.slice(0, maxLines).map(line => SF424Helper._truncate(font, line, size, maxWidth));
  }

  /** Hard-truncates a single line to `maxWidth`, appending `…` when it had to cut. */
  private static _truncate(font: PDFFont, text: string, size: number, maxWidth: number): string {
    if (font.widthOfTextAtSize(text, size) <= maxWidth) {
      return text;
    }

    let candidate = text;

    while (candidate.length > 1 && font.widthOfTextAtSize(`${candidate}...`, size) > maxWidth) {
      candidate = candidate.slice(0, -1);
    }

    return `${candidate}...`;
  }
}
