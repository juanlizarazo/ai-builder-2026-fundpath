import { Firestore, Timestamp } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { IHistoricalProof, IOpportunity, IRoute, IStop, ITask } from '../firestore';
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
import { ICandidate, IPipelineDrop, ISequencedCandidate } from './route.interfaces';
import { REGISTRATION_LEAD_BUSINESS_DAYS, ROUTE_LIMITS } from './retrieval.constants';

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

    const retrieved = await this._retrieval.retrieve(db, expansion, drops);

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
      .slice(0, ROUTE_LIMITS.maxPrimary);
    const primaryMonths = new Set(primaryEntries.map(entry => entry.sequenceMonth));
    const alongsideEntries = sequenced
      .filter(
        entry =>
          entry.placement === 'alongside' &&
          (entry.sequenceMonth === undefined || primaryMonths.has(entry.sequenceMonth))
      )
      .slice(0, ROUTE_LIMITS.maxAlongside);
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
    const verdict = AbstentionHelper.decide(kept);
    const stacking = StackingHelper.plan(profile, kept);

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
      deepPassStatus: 'complete',
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
