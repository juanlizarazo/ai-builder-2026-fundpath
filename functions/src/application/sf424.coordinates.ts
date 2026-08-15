/**
 * Hand-picked overlay positions for the bundled SF-424 base PDF
 * (`assets/sf424-base.pdf`, the grants.gov *readonly* render of
 * SF424_4_0-V4.0 — 3 pages, every page 612x792, no AcroForm fields and no XFA).
 *
 * Every coordinate below was derived from the real page geometry, not guessed:
 * `yarn dev:sf424-fields` prints each printed label with its page-space (x, y),
 * and the input boxes themselves are `re` (rectangle) paths in the same content
 * streams. Values are therefore placed *inside the drawn box* for their field —
 * `x` = box left + 3pt of padding, `y` = box bottom + 4pt (leaves room for
 * descenders in a 13.6pt-tall box while keeping 9pt Helvetica clear of the box
 * rules). Multi-line boxes are top-aligned instead (`y` = box top - 9).
 *
 * Origin is bottom-left, units are PDF points — the same space
 * `PDFPage.drawText({ x, y })` uses.
 *
 * 8b (EIN/TIN) and 8c (UEI) have deliberately no entry here: FundPath never
 * collects those identifiers, so there is nothing to draw.
 */
export interface ISf424FieldPosition {
  /** 0-based page index in the base PDF. */
  page: number;
  /** Left edge of the text, or its right edge when `align` is `'right'`. */
  x: number;
  /** Baseline of the first line. */
  y: number;
  /** Font size in points; defaults to 9. */
  size?: number;
  /** Box width available for the value; longer values wrap or are truncated. */
  maxWidth?: number;
  /** Lines available in the box (multi-line boxes only). Defaults to 1. */
  maxLines?: number;
  /** Baseline-to-baseline distance when wrapping. Defaults to size + 2. */
  lineHeight?: number;
  /** Horizontal alignment inside the box. Defaults to `'left'`. */
  align?: 'left' | 'right';
}

export type Sf424FieldKey =
  | 'typeOfSubmissionCheckbox'
  | 'typeOfApplicationCheckbox'
  | 'legalName'
  | 'street1'
  | 'street2'
  | 'city'
  | 'county'
  | 'state'
  | 'zip'
  | 'contactFirstName'
  | 'contactLastName'
  | 'contactTitle'
  | 'contactPhone'
  | 'contactEmail'
  | 'applicantType'
  | 'alnNumber'
  | 'alnTitle'
  | 'fundingOpportunityNumber'
  | 'fundingOpportunityTitle'
  | 'projectTitle'
  | 'projectStartDate'
  | 'projectEndDate'
  | 'federalFunding';

export const SF424_COORDINATES: Record<Sf424FieldKey, ISf424FieldPosition> = {
  // --- page 0 -------------------------------------------------------------------
  /** Field 1 "Application" checkbox — 10x10 box at (44.1, 654.4); X centred in it. */
  typeOfSubmissionCheckbox: { page: 0, x: 46.1, y: 656.2 },
  /** Field 2 "New" checkbox — 10x10 box at (184.3, 671.4); X centred in it. */
  typeOfApplicationCheckbox: { page: 0, x: 186.3, y: 673.2 },
  /** 8a Legal Name — box (103.5, 479.3) 474.0x13.6. */
  legalName: { page: 0, x: 106.5, y: 483.3, maxWidth: 468 },
  /** 8d Street1 — box (112.5, 402.9) 437.2x13.6. */
  street1: { page: 0, x: 115.5, y: 406.9, maxWidth: 431 },
  /** 8d Street2 — box (112.5, 386.7) 437.2x13.6. */
  street2: { page: 0, x: 115.5, y: 390.7, maxWidth: 431 },
  /** 8d City — box (112.5, 370.6) 281.3x13.6. */
  city: { page: 0, x: 115.5, y: 374.6, maxWidth: 275 },
  /** 8d County/Parish — box (112.5, 354.4) 244.5x13.6. */
  county: { page: 0, x: 115.5, y: 358.4, maxWidth: 238 },
  /** 8d State — box (112.5, 338.2) 452.2x13.6. */
  state: { page: 0, x: 115.5, y: 342.2, maxWidth: 446 },
  /** 8d Zip / Postal Code — box (112.5, 289.7) 244.5x13.6. */
  zip: { page: 0, x: 115.5, y: 293.7, maxWidth: 238 },
  /** 8f First Name — box (296.2, 191.3) 278.2x13.6. */
  contactFirstName: { page: 0, x: 299.2, y: 195.3, maxWidth: 272 },
  /** 8f Last Name — box (95.3, 158.3) 479.2x13.6. */
  contactLastName: { page: 0, x: 98.3, y: 162.3, maxWidth: 473 },
  /** 8f Title — box (63.0, 123.1) 347.2x13.6. */
  contactTitle: { page: 0, x: 66.0, y: 127.1, maxWidth: 341 },
  /** 8f Telephone Number — box (117.8, 65.3) 198.7x13.6. */
  contactPhone: { page: 0, x: 120.8, y: 69.3, maxWidth: 192 },
  /** 8f Email — box (72.8, 45.8) 474.7x13.6. */
  contactEmail: { page: 0, x: 75.8, y: 49.8, maxWidth: 468 },

  // --- page 1 -------------------------------------------------------------------
  /**
   * Field 9 Type of Applicant 1 — the "Select Applicant Type" dropdown box
   * (35.4, 670.4) 491.4x15.0. Static overlay, so the chosen value is written
   * where a human would have picked it from the list.
   */
  applicantType: { page: 1, x: 38.5, y: 675.0, maxWidth: 485 },
  /** Field 11 Assistance Listing Number — box (35.4, 499.3) 107.6x13.6. */
  alnNumber: { page: 1, x: 38.5, y: 503.4, maxWidth: 101 },
  /** Field 11 Assistance Listing Title — box (35.4, 457.5) 474.7x25.5, 2 lines. */
  alnTitle: { page: 1, x: 38.5, y: 473.9, maxWidth: 468, maxLines: 2, lineHeight: 11 },
  /** Field 12 Funding Opportunity Number — box (35.4, 422.1) 301.1x13.6. */
  fundingOpportunityNumber: { page: 1, x: 38.5, y: 426.1, maxWidth: 295 },
  /** Field 12 Title — box (35.4, 351.8) 474.7x52.4, top-aligned, up to 4 lines. */
  fundingOpportunityTitle: { page: 1, x: 38.5, y: 395.2, maxWidth: 468, maxLines: 4, lineHeight: 11 },
  /** Field 15 Descriptive Title of Applicant's Project — box (35.4, 130.3) 475.4x44.2. */
  projectTitle: { page: 1, x: 38.5, y: 165.5, maxWidth: 469, maxLines: 3, lineHeight: 11 },

  // --- page 2 -------------------------------------------------------------------
  /** 17a Proposed Project Start Date — box (91.7, 596.1) 53.3x13.6. */
  projectStartDate: { page: 2, x: 94.7, y: 600.1, maxWidth: 47 },
  /** 17b Proposed Project End Date — box (413.3, 596.1) 53.3x13.6. */
  projectEndDate: { page: 2, x: 416.3, y: 600.1, maxWidth: 47 },
  /** 18a Estimated Funding, Federal — box (106.9, 554.9) 138.7x13.6, right-aligned money. */
  federalFunding: { page: 2, x: 242.6, y: 558.9, maxWidth: 132, align: 'right' },
};
