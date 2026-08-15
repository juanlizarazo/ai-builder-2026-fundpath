import { Timestamp } from 'firebase-admin/firestore';

export type FitTier = 'likely' | 'potential' | 'adjacent' | 'probably-not';

export interface IOpportunity {
  id?: string;
  source: 'grants-gov' | 'sbir' | 'assistance-listing' | 'usaspending' | 'utah';
  sourceId: string;
  aln?: string;
  alnResolved: boolean;
  title: string;
  description: string;
  agency: string;
  agencyCode?: string;
  fundingInstrument?: string;
  applicantTypeCodes?: string[];
  naicsCodes?: string[];
  keywords?: string[];
  minAward?: number;
  maxAward?: number;
  openDate?: Timestamp;
  closeDate?: Timestamp;
  programPhase?: 'I' | 'II' | 'D2P2';
  isSbir?: boolean;
  isSttr?: boolean;
  status: 'posted' | 'forecasted' | 'closed' | 'archived';
  lastSyncedAt: Timestamp;
}

export interface IStartupProfile {
  id?: string;
  uid: string;
  rawDescription: string;
  industry: string;
  technologyKeywords: string[];
  location: { state: string; county?: string; city?: string };
  employees: number;
  revenueArr?: number;
  stage?: 'idea' | 'pre-seed' | 'seed' | 'series-a' | 'growth';
  capitalRaised?: number;
  askMin?: number;
  askMax?: number;
  useOfFunds?: string;
  hasRdCore: boolean;
  targetCustomer?: string;
  productMaturity?: string;
  ownershipSignals?: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface IEligibilityFlag {
  severity: 'block' | 'warn' | 'info';
  code: string;
  message: string;
}

export interface IHistoricalProof {
  totalDollars: number;
  medianAward: number;
  countTotal: number;
  countUtah: number;
  countVertical: number;
  namedWinners: string[];
}

export interface ITask {
  id: string;
  label: string;
  completed: boolean;
  dueDate?: Timestamp;
  category?: 'registration' | 'document' | 'narrative' | 'submission';
}

export interface IStop {
  id: string;
  opportunityId?: string;
  title: string;
  agency: string;
  aln?: string;
  fitTier: FitTier;
  fitTierLabel: string;
  minAward?: number;
  maxAward?: number;
  closeDate?: Timestamp;
  registrationDeadline?: Timestamp;
  placement: 'primary' | 'alongside' | 'off-route' | 'non-grant';
  sequenceMonth?: number;
  whyFit?: string;
  whyIneligible?: string;
  whatToVerify?: string;
  whatToDoNext?: string;
  eligibilityFlags: IEligibilityFlag[];
  historicalProof?: IHistoricalProof;
  tasks: ITask[];
  isSbir?: boolean;
  isSttr?: boolean;
  programPhase?: 'I' | 'II' | 'D2P2';
  programUrl?: string;
}

export interface IRoute {
  id?: string;
  uid: string;
  profileId: string;
  verdictLine: string;
  stops: IStop[];
  offRoute: IStop[];
  nonGrantAlternatives?: IStop[];
  deepPassStatus: 'pending' | 'running' | 'complete';
  deepPassFoundNew: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface IUtahResource {
  id?: string;
  title: string;
  description: string;
  link: string;
  email: string | null;
  industries: string[];
  counties: string[];
  needs: string[];
  stage: string;
  enrichedAt?: Timestamp;
}
