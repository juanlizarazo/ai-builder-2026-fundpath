import { describe, expect, it } from 'vitest';

import { composeGuidedDescription, industryLabel } from './intake.constants';

describe('intake.constants', () => {
  describe('industryLabel', () => {
    it('maps known slugs to friendly labels', () => {
      expect(industryLabel('health-it')).toBe('Health IT');
      expect(industryLabel('saas')).toBe('SaaS');
    });

    it('falls back to the raw slug for an unmapped value', () => {
      expect(industryLabel('made-up')).toBe('made-up');
    });
  });

  describe('composeGuidedDescription', () => {
    it('composes a coherent sentence from only the four required fields', () => {
      const result = composeGuidedDescription({
        companyName: '',
        industry: 'health-it',
        county: 'Salt Lake',
        team: '11–50',
        revenue: '',
        raised: '',
        amount: '$500K–$2M',
        useOfFunds: ''
      });

      expect(result).toBe('Utah Health IT company in Salt Lake County, 11–50 employees. Need $500K–$2M.');
    });

    it('composes a coherent sentence with every field filled, preserving extraction-schema field order', () => {
      const result = composeGuidedDescription({
        companyName: 'Nurse-AI Co',
        industry: 'health-it',
        county: 'Salt Lake',
        team: '11–50',
        revenue: '$500K–$2M',
        raised: '$1M–$5M',
        amount: '$500K–$2M',
        useOfFunds: 'R&D'
      });

      expect(result).toBe(
        'Nurse-AI Co — Utah Health IT company in Salt Lake County, 11–50 employees, $500K–$2M. $1M–$5M raised. Need $500K–$2M for R&D.'
      );
    });

    it('never leaves a dangling em-dash when the company name is blank', () => {
      const result = composeGuidedDescription({
        companyName: '   ',
        industry: 'water',
        county: 'Cache',
        team: '1–10',
        revenue: '',
        raised: '',
        amount: '$100K–$500K',
        useOfFunds: ''
      });

      expect(result.startsWith('—')).toBe(false);
      expect(result).toBe('Utah Water Tech company in Cache County, 1–10 employees. Need $100K–$500K.');
    });
  });
});
