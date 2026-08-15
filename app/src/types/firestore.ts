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
    }
  }
}
