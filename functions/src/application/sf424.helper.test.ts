import { Timestamp } from 'firebase-admin/firestore';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { ISf424FillValues } from './application.interfaces';
import { SF424_COORDINATES } from './sf424.coordinates';
import { SF424Helper } from './sf424.helper';

const MINIMAL: ISf424FillValues = {
  legalName: 'Wasatch Photonics Research, Inc.',
  street1: '2500 South State Street',
  city: 'Salt Lake City',
  state: 'UT: Utah',
  zip: '84115',
  contactFirstName: 'Maria',
  contactLastName: 'Alvarez-Whitfield',
  contactEmail: 'maria@wasatchphotonics.example',
  contactPhone: '801-555-0142',
  projectTitle: 'Photonic sensing platform for battery thermal runaway detection',
  typeOfSubmission: 'Application',
  typeOfApplication: 'New',
};

const FULL: ISf424FillValues = {
  ...MINIMAL,
  street2: 'Innovation Annex B',
  county: 'Salt Lake',
  contactTitle: 'Chief Executive Officer',
  projectStartDate: Timestamp.fromDate(new Date('2027-01-04T00:00:00Z')),
  projectEndDate: Timestamp.fromDate(new Date('2027-12-31T00:00:00Z')),
  fundingRequested: 274500,
  alnNumber: '93.859',
  alnTitle: 'Biomedical Research and Research Training',
  fundingOpportunityNumber: 'PA-24-247',
  fundingOpportunityTitle: 'NIH SBIR Phase I (Parent SBIR [R43/R44])',
  applicantType: 'Small Business',
};

describe('SF424Helper', () => {
  it('bundles a 3-page 612x792 base form', async () => {
    const doc = await PDFDocument.load(SF424Helper.loadBasePdf());

    expect(doc.getPageCount()).toBe(3);

    for (const page of doc.getPages()) {
      expect(page.getSize()).toEqual({ width: 612, height: 792 });
    }
  });

  it('fills a complete applicant and keeps the page geometry intact', async () => {
    const filled = await SF424Helper.fill(SF424Helper.loadBasePdf(), FULL);
    const doc = await PDFDocument.load(filled);

    expect(filled.length).toBeGreaterThan(50_000);
    expect(doc.getPageCount()).toBe(3);
  });

  it('handles an applicant with every optional field missing', async () => {
    const filled = await SF424Helper.fill(SF424Helper.loadBasePdf(), MINIMAL);

    expect((await PDFDocument.load(filled)).getPageCount()).toBe(3);
  });

  it('formats dates as MM/DD/YYYY in UTC and money with thousands separators', () => {
    expect(SF424Helper.formatDate(Timestamp.fromDate(new Date('2027-01-04T00:00:00Z')))).toBe('01/04/2027');
    expect(SF424Helper.formatDate(undefined)).toBeUndefined();
    expect(SF424Helper.formatCurrency(274500)).toBe('274,500.00');
    expect(SF424Helper.formatCurrency(undefined)).toBeUndefined();
    expect(SF424Helper.formatCurrency(Number.NaN)).toBeUndefined();
  });

  it('never places anything in 8b (EIN/TIN) or 8c (UEI)', () => {
    const keys = Object.keys(SF424_COORDINATES).join(' ').toLowerCase();

    expect(keys).not.toMatch(/ein|tin|uei/);
  });

  it('keeps every coordinate on a real page and inside the media box', () => {
    for (const [key, position] of Object.entries(SF424_COORDINATES)) {
      expect(position.page, key).toBeGreaterThanOrEqual(0);
      expect(position.page, key).toBeLessThanOrEqual(2);
      expect(position.x, key).toBeGreaterThan(0);
      expect(position.x, key).toBeLessThan(612);
      expect(position.y, key).toBeGreaterThan(0);
      expect(position.y, key).toBeLessThan(792);
    }
  });
});
