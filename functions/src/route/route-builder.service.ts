import { Firestore, Timestamp } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { IHistoricalProof, IOpportunity, IRoute, IStartupProfile, IStop, ITask } from '../firestore';
import { ExpansionHelper } from './expansion.helper';
import { RetrievalService } from './retrieval.service';
import { EligibilityRulesHelper } from './eligibility.rules';
import { ScoringHelper } from './scoring.helper';
import { SequencingHelper } from './sequencing.helper';
import { StackingHelper } from './stacking.helper';
import { AbstentionHelper } from './abstention.helper';
import { TieringHelper } from './tiering.helper';
import { HistoricalHelper } from './historical.helper';
import { ResourcesHelper } from './resources.helper';
import { ExtractionService } from './extraction.service';
import { ExplanationService } from './explanation.service';
import {
  IAbstentionVerdict,
  ICandidate,
  IExpansion,
  IPipelineDrop,
  ISequencedCandidate,
  IStackingPlan,
} from './route.interfaces';
import { REGISTRATION_LEAD_BUSINESS_DAYS, ROUTE_LIMITS } from './retrieval.constants';

interface IAssembledRoute {
  stops: IStop[];
  offRoute: IStop[];
  nonGrantAlternatives: IStop[];
  verdict: IAbstentionVerdict;
  stacking: IStackingPlan;
}

export interface IBuildResult {
  profileId: string;
  routeId: string;
  route: IRoute;
  drops: IPipelineDrop[];
}

export class RouteBuilderService {
  private readonly _retrieval = new RetrievalService();
  private readonly _extraction = new ExtractionService();
  private readonly _explanation = new ExplanationService();

  private static _registrationDeadline(now: Date = new Date()): Timestamp {
    const deadline = new Date(now.getTime());
    let remaining = REGISTRATION_LEAD_BUSINESS_DAYS;

    while (remaining > 0) {
      deadline.setDate(deadline.getDate() + 1);

      const day = deadline.getDay();

      if (day !== 0 && day !== 6) {
        remaining--;
      }
    }

    return Timestamp.fromDate(deadline);
  }

  private static _tasksFor(opportunity: IOpportunity, index: number): ITask[] {
    const tasks: ITask[] = [
      {
        id: `${opportunity.sourceId}-uei`,
        label: 'Confirm an active SAM.gov UEI registration (allow 10–15 business days)',
        completed: false,
        category: 'registration',
      },
      {
        id: `${opportunity.sourceId}-eligibility`,
        label: 'Verify eligibility against the official solicitation text',
        completed: false,
        category: 'document',
      },
    ];

    if (opportunity.isSbir || opportunity.isSttr) {
      tasks.push({
        id: `${opportunity.sourceId}-registry`,
        label: 'Register in the SBA Company Registry and obtain your SBC control ID',
        completed: false,
        category: 'registration',
      });
    }

    if (index === 0) {
      tasks.push({
        id: `${opportunity.sourceId}-outline`,
        label: 'Draft a one-page technical outline to review with Nucleus (free Utah counseling)',
        completed: false,
        category: 'narrative',
      });
    }

    return tasks;
  }

  private _toStop(entry: ISequencedCandidate, index: number): IStop {
    const opportunity = entry.candidate.opportunity;

    return {
      id: opportunity.sourceId,
      opportunityId: opportunity.id ?? opportunity.sourceId,
      title: opportunity.title,
      agency: opportunity.agency,
      aln: opportunity.aln,
      fitTier: entry.candidate.tier,
      fitTierLabel: TieringHelper.label(entry.candidate.tier),
      minAward: opportunity.minAward,
      maxAward: opportunity.maxAward,
      openDate: opportunity.openDate,
      closeDate: opportunity.closeDate,
      registrationDeadline: RouteBuilderService._registrationDeadline(),
      placement: entry.placement,
      sequenceMonth: entry.sequenceMonth,
      eligibilityFlags: entry.candidate.flags,
      tasks: RouteBuilderService._tasksFor(opportunity, index),
      isSbir: opportunity.isSbir,
      isSttr: opportunity.isSttr,
      programPhase: opportunity.programPhase,
      programUrl: opportunity.programUrl,
      curated: opportunity.curated,
      provenanceNote: opportunity.provenance?.note,
    };
  }

  private static _dedupeStopIds(stops: IStop[]): IStop[] {
    const seen = new Set<string>();

    return stops.filter(stop => {
      if (seen.has(stop.id)) {
        return false;
      }

      seen.add(stop.id);

      return true;
    });
  }

  private async _assemble(
    db: Firestore,
    profile: IStartupProfile,
    expansion: IExpansion,
    drops: IPipelineDrop[],
    deep: boolean
  ): Promise<IAssembledRoute> {
    const retrieved = await this._retrieval.retrieve(db, expansion, drops, deep);
    const candidates: ICandidate[] = [];
    const proofBySourceId = new Map<string, IHistoricalProof | undefined>();

    for (const opportunity of retrieved) {
      const outcome = EligibilityRulesHelper.evaluate(profile, opportunity);
      const proof = await HistoricalHelper.proofFor(db, expansion, opportunity);
      proofBySourceId.set(opportunity.sourceId, proof);

      const density = proof ? proof.countVertical : 0;
      const { score, breakdown } = ScoringHelper.score(
        profile,
        opportunity,
        expansion,
        density,
        new Date(),
        outcome.tier
      );

      candidates.push({
        opportunity,
        tier: outcome.tier,
        flags: outcome.flags,
        score,
        breakdown,
      });
    }

    const ranked = ScoringHelper.rank(candidates);
    const sequenced = SequencingHelper.sequence(ranked);

    const primaryEntries = sequenced
      .filter(entry => entry.placement === 'primary')
      .slice(0, deep ? ROUTE_LIMITS.deepMaxPrimary : ROUTE_LIMITS.maxPrimary);
    const primaryMonths = new Set(primaryEntries.map(entry => entry.sequenceMonth));
    const alongsideEntries = sequenced
      .filter(
        entry =>
          entry.placement === 'alongside' &&
          (entry.sequenceMonth === undefined || primaryMonths.has(entry.sequenceMonth))
      )
      .slice(0, deep ? ROUTE_LIMITS.deepMaxAlongside : ROUTE_LIMITS.maxAlongside);
    const stopEntries = [...primaryEntries, ...alongsideEntries];
    const offRouteEntries = sequenced
      .filter(entry => entry.placement === 'off-route')
      .slice(0, ROUTE_LIMITS.maxOffRoute);
    const nonGrantEntries = sequenced
      .filter(entry => entry.placement === 'non-grant')
      .slice(0, ROUTE_LIMITS.maxNonGrant);

    const stops = RouteBuilderService._dedupeStopIds(
      stopEntries.map((entry, index) => this._toStop(entry, index))
    );
    const offRoute = RouteBuilderService._dedupeStopIds(
      offRouteEntries.map((entry, index) => this._toStop(entry, index))
    );
    const nonGrantAlternatives = RouteBuilderService._dedupeStopIds(
      nonGrantEntries.map((entry, index) => this._toStop(entry, index))
    );

    for (const stop of stops) {
      const proof = proofBySourceId.get(stop.id);

      if (proof) {
        stop.historicalProof = proof;
      }
    }

    const kept = [...stopEntries, ...offRouteEntries, ...nonGrantEntries];

    return {
      stops,
      offRoute,
      nonGrantAlternatives,
      verdict: AbstentionHelper.decide(kept),
      stacking: StackingHelper.plan(profile, kept),
    };
  }

  public async deepPass(db: Firestore, routeId: string): Promise<void> {
    const routeRef = db.collection('routes').doc(routeId);
    const snapshot = await routeRef.get();
    const existing = snapshot.data() as IRoute | undefined;

    if (!existing) {
      logger.warn('Deep pass skipped — route not found', { routeId });

      return;
    }

    if (existing.deepPassStatus === 'complete') {
      return;
    }

    const profileSnapshot = await db.collection('profiles').doc(existing.profileId).get();
    const profile = profileSnapshot.data() as IStartupProfile | undefined;

    if (!profile) {
      logger.warn('Deep pass skipped — profile not found', { routeId });
      await routeRef.update({ deepPassStatus: 'complete', updatedAt: Timestamp.now() });

      return;
    }

    const startedAt = Date.now();
    const drops: IPipelineDrop[] = [];
    const expansion = ExpansionHelper.expand(profile);
    const assembled = await this._assemble(db, profile, expansion, drops, true);

    const knownIds = new Set(
      [
        ...(existing.stops ?? []),
        ...(existing.offRoute ?? []),
        ...(existing.nonGrantAlternatives ?? []),
      ].map(stop => stop.id)
    );
    const freshStops = assembled.stops.filter(stop => !knownIds.has(stop.id));

    if (freshStops.length === 0) {
      await routeRef.update({
        deepPassStatus: 'complete',
        deepPassFoundNew: false,
        updatedAt: Timestamp.now(),
      });
      logger.info('Deep pass complete — nothing new', {
        routeId,
        elapsedMs: Date.now() - startedAt,
      });

      return;
    }

    const explanations = await this._explanation.explain(profile, freshStops);

    for (const stop of freshStops) {
      const explanation = explanations.get(stop.id);

      if (explanation) {
        stop.whyFit = explanation.whyFit;
        stop.whyIneligible = explanation.whyIneligible;
        stop.whatToVerify = explanation.whatToVerify;
        stop.whatToDoNext = explanation.whatToDoNext;
      }
    }

    await routeRef.update({
      stops: [...(existing.stops ?? []), ...freshStops],
      verdictLine: assembled.verdict.verdictLine,
      stackingNote: assembled.stacking.note,
      deepPassStatus: 'complete',
      deepPassFoundNew: true,
      updatedAt: Timestamp.now(),
    });

    logger.info('Deep pass complete — added stops', {
      routeId,
      added: freshStops.length,
      elapsedMs: Date.now() - startedAt,
    });
  }

  public async build(db: Firestore, uid: string, description: string): Promise<IBuildResult> {
    const drops: IPipelineDrop[] = [];
    const startedAt = Date.now();

    const profile = await this._extraction.extract(uid, description);
    const expansion = ExpansionHelper.expand(profile);
    logger.info('Profile extracted', {
      industry: profile.industry,
      vertical: expansion.verticalSlug,
      employees: profile.employees,
      hasRdCore: profile.hasRdCore,
      askMin: profile.askMin,
      askMax: profile.askMax,
    });

    const profileRef = db.collection('profiles').doc(uid);
    await profileRef.set({ ...profile, id: uid }, { merge: true });

    const assembled = await this._assemble(db, profile, expansion, drops, false);
    const { stops, offRoute, nonGrantAlternatives, verdict, stacking } = assembled;

    const explainable = [...stops, ...nonGrantAlternatives, ...offRoute];
    const explanations = await this._explanation.explain(profile, explainable);

    for (const stop of explainable) {
      const explanation = explanations.get(stop.id);

      if (explanation) {
        stop.whyFit = explanation.whyFit;
        stop.whyIneligible = explanation.whyIneligible;
        stop.whatToVerify = explanation.whatToVerify;
        stop.whatToDoNext = explanation.whatToDoNext;
      }
    }

    const utahResources = await ResourcesHelper.match(db, profile);

    const routeRef = db.collection('routes').doc();
    const route: IRoute = {
      id: routeRef.id,
      uid,
      profileId: uid,
      verdictLine: verdict.verdictLine,
      stops,
      offRoute,
      nonGrantAlternatives,
      stackingNote: stops.length > 0 ? stacking.note : undefined,
      utahResources,
      deepPassStatus: 'running',
      deepPassFoundNew: false,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    await routeRef.set(route);

    logger.info('Route built', {
      uid,
      routeId: routeRef.id,
      stops: stops.length,
      offRoute: offRoute.length,
      nonGrant: nonGrantAlternatives.length,
      abstained: verdict.abstain,
      elapsedMs: Date.now() - startedAt,
    });

    return { profileId: uid, routeId: routeRef.id, route, drops };
  }
}
