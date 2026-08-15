import { Timestamp } from 'firebase-admin/firestore';

export type FitTier = 'likely' | 'potential' | 'adjacent' | 'probably-not';

export interface IProvenance {
  sourceUrl?: string;
  verifiedAt: string;
  verifiedBy: string;
  note?: string;
}

export interface IOpportunity {
  id?: string;
  source: 'grants-gov' | 'sbir' | 'assistance-listing' | 'usaspending' | 'utah' | 'seed';
  sourceId: string;
  aln?: string;
  alnAll?: string[];
  alnResolved: boolean;
  title: string;
  description: string;
  agency: string;
  agencyCode?: string;
  fundingInstrument?: string;
  applicantTypeCodes?: string[];
  applicantEligibilityDesc?: string;
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
  placement?: 'primary' | 'alongside' | 'off-route' | 'non-grant';
  programUrl?: string;
  curated?: boolean;
  provenance?: IProvenance;
  recipientName?: string;
  awardYear?: number;
  awardAmount?: number;
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
  applicantDetails?: IApplicantDetails;
  notifyEmail?: string;
  notifyPhone?: string;
  smsOptIn?: boolean;
  smsOptInAt?: Timestamp;
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
  source?: 'route' | 'kit';
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
  openDate?: Timestamp;
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
  curated?: boolean;
  provenanceNote?: string;
}

export interface IUtahResourceMatch {
  id: string;
  title: string;
  description: string;
  link: string;
  matchReason: string;
}

export interface IRoute {
  id?: string;
  uid: string;
  profileId: string;
  verdictLine: string;
  stops: IStop[];
  offRoute: IStop[];
  nonGrantAlternatives?: IStop[];
  stackingNote?: string;
  utahResources?: IUtahResourceMatch[];
  deepPassStatus: 'pending' | 'running' | 'complete';
  deepPassFoundNew: boolean;
  taskState?: Record<string, boolean>;
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

export interface IRegistrationStep {
  key: string;
  label: string;
  system: string;
  url?: string;
  durationBusinessDays: number;
  startBy: Timestamp;
  completeBy: Timestamp;
  note?: string;
}

export interface IRegistrationTimeline {
  mode: 'deadline' | 'earliest-ready';
  closeDate?: Timestamp;
  submitBy?: Timestamp;
  steps: IRegistrationStep[];
  feasible: boolean;
  slackBusinessDays: number;
  headline: string;
}

export interface IDocumentItem {
  id: string;
  label: string;
  required: boolean;
  note?: string;
  formUrl?: string;
}

export interface INarrativeStarter {
  section: 'innovation' | 'commercialization' | 'team' | 'alignment';
  heading: string;
  draft: string;
}

export interface IApplicantDetails {
  legalName: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  county?: string;
  contactFirstName: string;
  contactLastName: string;
  contactTitle?: string;
  contactEmail: string;
  contactPhone: string;
  projectTitle: string;
  projectStartDate?: Timestamp;
  projectEndDate?: Timestamp;
  fundingRequested?: number;
}

export interface IPortalLink {
  name: string;
  url?: string;
}

export interface ISubmissionMechanic {
  label: string;
  detail: string;
}

export interface IStarterKit {
  id?: string;
  uid: string;
  routeId: string;
  stopId: string;
  opportunityTitle: string;
  agency: string;
  aln?: string;
  timeline: IRegistrationTimeline;
  documents: IDocumentItem[];
  portals: IPortalLink[];
  submissionMechanics: ISubmissionMechanic[];
  narratives: INarrativeStarter[];
  sf424?: { storagePath: string; generatedAt: Timestamp };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type NotificationKind = 'route-ready' | 'new-stops' | 'demo-test';
export type NotifyChannel = 'inbox' | 'email' | 'telegram' | 'whatsapp' | 'sms';
export type DeliveryStatus = 'inbox-only' | 'sent' | 'failed';

export interface INotification {
  id?: string;
  uid: string;
  routeId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  stopIds: string[];
  channel: NotifyChannel;
  deliveryStatus: DeliveryStatus;
  providerMessageId?: string;
  errorMessage?: string;
  createdAt: Timestamp;
  readAt?: Timestamp;
}
