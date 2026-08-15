import { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { IApplicantDetails, IOpportunity, IStop } from '../firestore';
import { buildSf424FillValues } from './generateSf424.function';

const APPLICANT: IApplicantDetails = {
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
};

const STOP: IStop = {
  id: 'stop-1',
  opportunityId: 'opp-1',
  title: 'NIH SBIR Phase I (Parent SBIR [R43/R44])',
  agency: 'National Institutes of Health',
  aln: '93.859',
  fitTier: 'likely',
  fitTierLabel: 'Primary',
  placement: 'primary',
  eligibilityFlags: [],
  tasks: [],
};

describe('buildSf424FillValues', () => {
  it('carries the ALN from the stop and always marks a new Application submission', () => {
    const values = buildSf424FillValues(APPLICANT, STOP, undefined);

    expect(values.alnNumber).toBe('93.859');
    expect(values.fundingOpportunityTitle).toBe(STOP.title);
    expect(values.applicantType).toBe('Small Business');
    expect(values.typeOfSubmission).toBe('Application');
    expect(values.typeOfApplication).toBe('New');
    expect(values.legalName).toBe(APPLICANT.legalName);
  });

  it('fills fundingOpportunityNumber from a grants.gov opportunity sourceId', () => {
    const opportunity: IOpportunity = {
      source: 'grants-gov',
      sourceId: 'PA-24-247',
      alnResolved: true,
      title: STOP.title,
      description: 'desc',
      agency: STOP.agency,
      status: 'posted',
      lastSyncedAt: Timestamp.now(),
    };

    const values = buildSf424FillValues(APPLICANT, STOP, opportunity);

    expect(values.fundingOpportunityNumber).toBe('PA-24-247');
  });

  it('leaves fundingOpportunityNumber undefined for non-grants.gov opportunities', () => {
    const opportunity: IOpportunity = {
      source: 'sbir',
      sourceId: 'some-sbir-id',
      alnResolved: true,
      title: STOP.title,
      description: 'desc',
      agency: STOP.agency,
      status: 'posted',
      lastSyncedAt: Timestamp.now(),
    };

    const values = buildSf424FillValues(APPLICANT, STOP, opportunity);

    expect(values.fundingOpportunityNumber).toBeUndefined();
  });
});
