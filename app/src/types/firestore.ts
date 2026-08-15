import { Timestamp } from '@angular/fire/firestore';

export type FitTier = 'likely' | 'potential' | 'adjacent' | 'probably-not';

export const FIT_TIER_LABELS: Record<FitTier, string> = {
  'likely': 'Likely Fit',
  'potential': 'Potential — Verify',
  'adjacent': 'Adjacent',
  'probably-not': 'Probably Not'
};

export const FIT_TIER_ICONS: Record<FitTier, string> = {
  'likely': '🟢',
  'potential': '🟡',
  'adjacent': '🟠',
  'probably-not': '🔴'
};

export namespace FundPath {
  export namespace Firestore {

    export namespace Profiles {
      export interface IStartupProfile {
        id?: string;
        uid: string;
        rawDescription: string;
        industry: string;
        technologyKeywords: string[];
        location: { state: string; county?: string; city?: string };
        employees: number;
        revenueArr?: number;
        stage?: string;
        capitalRaised?: number;
        askMin?: number;
        askMax?: number;
        useOfFunds?: string;
        hasRdCore: boolean;
        targetCustomer?: string;
        productMaturity?: string;
        ownershipSignals?: string[];
        applicantDetails?: Applications.IApplicantDetails;
        createdAt: Timestamp;
        updatedAt: Timestamp;
      }
    }

    export namespace Routes {
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
    }

    export namespace Applications {
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
    }
  }
}
