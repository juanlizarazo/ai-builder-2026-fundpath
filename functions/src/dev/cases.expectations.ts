import { FitTier } from '../firestore';

export interface IProgramExpectation {
  label: string;
  titleContains: string[];
  required: boolean;
  expectedTier?: FitTier;
  expectedFlagCode?: string;
  expectedFlagSeverity?: 'block' | 'warn' | 'info';
}

export interface ICaseExpectation {
  caseNumber: number;
  abstain: boolean;
  minStops: number;
  maxStops?: number;
  minNonGrantAlternatives: number;
  verdictPattern?: RegExp;
  requireStackingNote?: boolean;
  programs: IProgramExpectation[];
}

export const CASE_EXPECTATIONS: ICaseExpectation[] = [
  {
    caseNumber: 1,
    abstain: false,
    minStops: 2,
    minNonGrantAlternatives: 0,
    programs: [
      {
        label: 'NIH SBIR/STTR',
        titleContains: ['small business innovation research'],
        required: true,
      },
    ],
  },
  {
    caseNumber: 2,
    abstain: false,
    minStops: 2,
    minNonGrantAlternatives: 0,
    requireStackingNote: true,
    programs: [
      {
        label: 'NASA SBIR/STTR',
        titleContains: ['nasa'],
        required: false,
      },
      {
        label: 'DoD / AFWERX / SpaceWERX',
        titleContains: ['afwerx', 'spacewerx', 'dod sbir', 'stratfi'],
        required: false,
      },
    ],
  },
  {
    caseNumber: 3,
    abstain: false,
    minStops: 2,
    minNonGrantAlternatives: 0,
    programs: [
      {
        label: 'WaterSMART (municipal prime required)',
        titleContains: ['watersmart', 'water and energy efficiency'],
        required: false,
        expectedTier: 'adjacent',
        expectedFlagCode: 'REQUIRES_MUNICIPAL_PRIME',
        expectedFlagSeverity: 'warn',
      },
    ],
  },
  {
    caseNumber: 4,
    abstain: false,
    minStops: 2,
    minNonGrantAlternatives: 0,
    programs: [
      {
        label: 'DoD / DHS S&T cyber',
        titleContains: ['dhs', 'afwerx', 'dod sbir', 'spacewerx'],
        required: false,
      },
    ],
  },
  {
    caseNumber: 5,
    abstain: true,
    minStops: 0,
    maxStops: 0,
    minNonGrantAlternatives: 3,
    verdictPattern: /no strong federal grant match/i,
    programs: [],
  },
];
