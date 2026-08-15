import { DocumentReference, Firestore, Timestamp } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { ClaudeService } from '../ai/claude.service';
import {
  IOpportunity,
  IPortalLink,
  IRoute,
  IStarterKit,
  IStartupProfile,
  IStop,
  ISubmissionMechanic,
  INarrativeStarter,
  ITask,
} from '../firestore';
import {
  AGENCY_PORTAL_BY_ALN_PREFIX,
  GRANTS_GOV_PORTAL,
  IAgencyPortalEntry,
  NARRATIVE_FALLBACK,
  NARRATIVE_SECTIONS,
  NARRATIVE_SECTION_HEADINGS,
  NARRATIVE_SYSTEM_PROMPT,
  NARRATIVE_USER_PROMPT_PREFIX,
  resolveDocuments,
} from './application.constants';
import { INarrativeRequestPayload, INarrativeStopPayload, NarrativeSection } from './application.interfaces';
import { RegistrationTimelineHelper } from './registration-timeline.helper';

/**
 * Assembles the "starter kit" for a single route stop: the registration timeline
 * (Task 2's helper), a deterministic documents checklist, portal/submission
 * mechanics, and four Claude-drafted narrative starters with a deterministic
 * fallback. Instantiated class (not static-only) since it owns a ClaudeService.
 *
 * Mirrors RouteBuilderService.build for how it reads/writes Firestore.
 */
export class StarterKitService {
  private readonly _claude = new ClaudeService();

  public async assemble(db: Firestore, uid: string, routeId: string, stopId: string): Promise<IStarterKit> {
    const routeRef = db.collection('routes').doc(routeId);
    const routeSnapshot = await routeRef.get();
    const route = routeSnapshot.data() as IRoute | undefined;

    if (!route) {
      throw new Error(`Route not found: ${routeId}`);
    }

    if (route.uid !== uid) {
      throw new Error(`Route ${routeId} does not belong to user ${uid}`);
    }

    const stops = route.stops ?? [];
    const stop = stops.find(candidate => candidate.id === stopId);

    if (!stop) {
      throw new Error(`Stop ${stopId} not found on route ${routeId}`);
    }

    const profileSnapshot = await db.collection('profiles').doc(route.profileId).get();
    const profile = profileSnapshot.data() as IStartupProfile | undefined;

    if (!profile) {
      throw new Error(`Profile not found: ${route.profileId}`);
    }

    const timeline = RegistrationTimelineHelper.build({
      closeDate: stop.closeDate,
      isSbir: stop.isSbir,
      isSttr: stop.isSttr,
      aln: stop.aln,
    });
    const documents = resolveDocuments({
      isSbir: stop.isSbir,
      isSttr: stop.isSttr,
      programPhase: stop.programPhase,
    });
    const portals = this._resolvePortals(stop.aln);
    const submissionMechanics = this._resolveSubmissionMechanics(stop, portals);
    const narratives = await this._buildNarratives(db, profile, stop);

    const id = `${uid}_${routeId}_${stopId}`;
    const kitRef = db.collection('starterKits').doc(id);
    const existingSnapshot = await kitRef.get();
    const existing = existingSnapshot.data() as IStarterKit | undefined;

    const kit: IStarterKit = {
      id,
      uid,
      routeId,
      stopId,
      opportunityTitle: stop.title,
      agency: stop.agency,
      aln: stop.aln,
      timeline,
      documents,
      portals,
      submissionMechanics,
      narratives,
      createdAt: existing?.createdAt ?? Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    await kitRef.set(kit, { merge: true });
    await this._appendTasksToStop(routeRef, route, stop, timeline, documents);

    logger.info('Starter kit assembled', { uid, routeId, stopId, documents: documents.length });

    return kit;
  }

  // ---- portals & submission mechanics ------------------------------------------

  private _resolvePortals(aln?: string): IPortalLink[] {
    const portals: IPortalLink[] = [{ name: GRANTS_GOV_PORTAL.name, url: GRANTS_GOV_PORTAL.url }];
    const agencyPortal = this._agencyPortalFor(aln);

    if (agencyPortal) {
      portals.push({ name: agencyPortal.system, url: agencyPortal.url });
    }

    return portals;
  }

  private _agencyPortalFor(aln?: string): IAgencyPortalEntry | undefined {
    if (!aln) {
      return undefined;
    }

    const match = aln.match(/^\d+/);

    if (!match) {
      return undefined;
    }

    return AGENCY_PORTAL_BY_ALN_PREFIX[match[0]];
  }

  private _resolveSubmissionMechanics(stop: IStop, portals: IPortalLink[]): ISubmissionMechanic[] {
    const mechanics: ISubmissionMechanic[] = [
      {
        label: 'SF-424 application package',
        detail: `Submitted through Grants.gov to ${stop.agency}.`,
      },
    ];
    const agencyPortal = portals.find(portal => portal.name !== GRANTS_GOV_PORTAL.name);

    if (agencyPortal) {
      mechanics.push({
        label: `${agencyPortal.name} registration`,
        detail: `${stop.agency} requires registration in ${agencyPortal.name} before you can submit through Grants.gov — start it early given the lead time in your timeline.`,
      });
    }

    return mechanics;
  }

  // ---- narratives ---------------------------------------------------------------

  private async _buildNarratives(db: Firestore, profile: IStartupProfile, stop: IStop): Promise<INarrativeStarter[]> {
    const solicitationDescription = await this._fetchSolicitationDescription(db, stop);
    const payload: INarrativeRequestPayload = {
      profile: {
        industry: profile.industry,
        technologyKeywords: profile.technologyKeywords,
        stage: profile.stage,
        targetCustomer: profile.targetCustomer,
        productMaturity: profile.productMaturity,
        useOfFunds: profile.useOfFunds,
      },
      stop: this._buildNarrativeStopPayload(stop),
      solicitationDescription,
    };

    const entries = await this._requestNarratives(payload);
    const bySection = new Map<NarrativeSection, INarrativeStarter>();

    for (const entry of entries) {
      const candidate = this._sanitizeNarrativeEntry(entry);

      if (candidate) {
        bySection.set(candidate.section, candidate);
      }
    }

    const fallbackSections: NarrativeSection[] = [];
    const narratives: INarrativeStarter[] = NARRATIVE_SECTIONS.map(section => {
      const candidate = bySection.get(section);

      if (candidate) {
        return candidate;
      }

      fallbackSections.push(section);

      return this._buildNarrativeFallback(section, profile, stop);
    });

    if (fallbackSections.length > 0) {
      logger.warn('Falling back to deterministic narrative starters', {
        stopId: stop.id,
        fallbackSections,
      });
    }

    return narratives;
  }

  private async _fetchSolicitationDescription(db: Firestore, stop: IStop): Promise<string | undefined> {
    if (!stop.opportunityId) {
      return undefined;
    }

    try {
      const snapshot = await db.collection('corpus').doc(stop.opportunityId).get();
      const opportunity = snapshot.data() as IOpportunity | undefined;

      if (!opportunity) {
        logger.warn('Opportunity doc unexpectedly missing for narrative grounding', {
          opportunityId: stop.opportunityId,
        });
      }

      return opportunity?.description;
    } catch (error) {
      logger.warn('Could not fetch opportunity for narrative grounding', {
        opportunityId: stop.opportunityId,
        error: (error as Error).message,
      });

      return undefined;
    }
  }

  private _buildNarrativeStopPayload(stop: IStop): INarrativeStopPayload {
    return {
      title: stop.title,
      agency: stop.agency,
      whyFit: stop.whyFit,
      isSbir: stop.isSbir === true,
      isSttr: stop.isSttr === true,
      eligibilityFlags: stop.eligibilityFlags.map(flag => ({
        code: flag.code,
        severity: flag.severity,
        message: flag.message,
      })),
    };
  }

  private async _requestNarratives(payload: INarrativeRequestPayload): Promise<unknown[]> {
    try {
      const raw = await this._claude.completeJson<unknown>(
        `${NARRATIVE_USER_PROMPT_PREFIX}${JSON.stringify(payload)}`,
        NARRATIVE_SYSTEM_PROMPT,
      );

      return this._asEntryArray(raw);
    } catch (error) {
      logger.error('Narrative call failed; every section will use its deterministic fallback', {
        error: (error as Error).message,
      });

      return [];
    }
  }

  private _asEntryArray(raw: unknown): unknown[] {
    if (Array.isArray(raw)) {
      return raw;
    }

    if (typeof raw === 'object' && raw !== null) {
      const wrapper = raw as Record<string, unknown>;

      for (const key of ['narratives', 'sections', 'results', 'data']) {
        const nested = wrapper[key];

        if (Array.isArray(nested)) {
          return nested;
        }
      }
    }

    logger.warn('Narrative model returned a shape that was not a JSON array');

    return [];
  }

  private _sanitizeNarrativeEntry(entry: unknown): INarrativeStarter | undefined {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      return undefined;
    }

    const record = entry as Record<string, unknown>;
    const section = this._asSection(record['section']);
    const heading = this._asProse(record['heading']);
    const draft = this._asProse(record['draft']);

    if (!section || !heading || !draft) {
      return undefined;
    }

    return { section, heading, draft };
  }

  private _asSection(value: unknown): NarrativeSection | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    return (NARRATIVE_SECTIONS as readonly string[]).includes(value) ? (value as NarrativeSection) : undefined;
  }

  private _asProse(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();

    return trimmed.length === 0 ? undefined : trimmed;
  }

  private _buildNarrativeFallback(section: NarrativeSection, profile: IStartupProfile, stop: IStop): INarrativeStarter {
    const heading = NARRATIVE_SECTION_HEADINGS[section];
    const keywords = profile.technologyKeywords.slice(0, 3).join(', ') || profile.industry;
    const prompt = NARRATIVE_FALLBACK.prompts[section];
    let context: string;

    switch (section) {
      case 'innovation':
        context = `${stop.title} at ${stop.agency} calls for a technical narrative. Your profile is ${profile.industry}, focused on ${keywords}.`;
        break;
      case 'commercialization':
        context = `${stop.title} will want to see your commercialization path. Your profile lists${
          profile.targetCustomer ? ` ${profile.targetCustomer} as your target customer` : ' your target customer'
        }${profile.useOfFunds ? ` and use of funds around ${profile.useOfFunds}` : ''}.`;
        break;
      case 'team':
        context = `${stop.title} at ${stop.agency} will ask about your team's ability to execute this project.`;
        break;
      case 'alignment':
      default:
        context = `${stop.title} is run by ${stop.agency}${stop.whyFit ? ` — noted fit: ${stop.whyFit}` : ''}.`;
        break;
    }

    return {
      section,
      heading,
      draft: `${context} ${prompt} ${NARRATIVE_FALLBACK.unavailableNote}`,
    };
  }

  // ---- kit items -> tasks --------------------------------------------------------

  private async _appendTasksToStop(
    routeRef: DocumentReference,
    route: IRoute,
    stop: IStop,
    timeline: ReturnType<typeof RegistrationTimelineHelper.build>,
    documents: ReturnType<typeof resolveDocuments>,
  ): Promise<void> {
    const newTasks = StarterKitService.buildKitTasks(stop, timeline, documents);
    const dedupedTasks = StarterKitService.dedupeTasks(stop.tasks ?? [], newTasks);
    const updatedStops = (route.stops ?? []).map(candidate =>
      candidate.id === stop.id ? { ...candidate, tasks: dedupedTasks } : candidate,
    );

    await routeRef.update({ stops: updatedStops, updatedAt: Timestamp.now() });
  }

  /**
   * `RouteBuilderService._tasksFor` already emits a legacy task for these two
   * registration-timeline steps (`${stop.id}-uei` for SAM.gov, and — for
   * SBIR/STTR stops — `${stop.id}-registry` for the SBA Company Registry).
   * `stop.id` is always the opportunity's `sourceId` (see
   * `RouteBuilderService._toStop`), which is the same id those legacy tasks are
   * built from, so a plain string comparison against `stop.tasks` is enough to
   * detect the overlap without needing a separate sourceId lookup.
   */
  private static readonly _LEGACY_TASK_ID_SUFFIX_BY_STEP_KEY: Record<string, string> = {
    'sam-gov-registration': 'uei',
    'sba-company-registry': 'registry',
  };

  /**
   * Builds the kit-derived tasks for a stop: one per registration-timeline step
   * (category 'registration', due on that step's own completeBy) and one per
   * required document (category 'document', due on the timeline's submitBy —
   * documents should be ready by submission). Ids are `${stopId}-kit-<key>` so
   * they are deterministic and safe to dedupe against on kit regeneration.
   *
   * Two of the registration steps (SAM.gov UEI and, for SBIR/STTR, the SBA
   * Company Registry) duplicate a task `RouteBuilderService` already put on the
   * stop when the route was built (see `_LEGACY_TASK_ID_SUFFIX_BY_STEP_KEY`
   * above). Rather than removing/rewriting that legacy task in place (which
   * would risk losing its `completed` state or its id if some other part of
   * the app already references it), we simply skip emitting the kit-side
   * duplicate whenever the legacy task is present — the founder still sees
   * exactly one entry for that obligation, and if they'd already checked off
   * the legacy task its `completed: true` is untouched.
   */
  public static buildKitTasks(
    stop: IStop,
    timeline: ReturnType<typeof RegistrationTimelineHelper.build>,
    documents: ReturnType<typeof resolveDocuments>,
  ): ITask[] {
    const existingTaskIds = new Set((stop.tasks ?? []).map(task => task.id));
    const tasks: ITask[] = [];

    for (const step of timeline.steps) {
      const legacySuffix = StarterKitService._LEGACY_TASK_ID_SUFFIX_BY_STEP_KEY[step.key];
      const legacyId = legacySuffix ? `${stop.id}-${legacySuffix}` : undefined;

      if (legacyId && existingTaskIds.has(legacyId)) {
        continue;
      }

      tasks.push({
        id: `${stop.id}-kit-${step.key}`,
        label: step.label,
        completed: false,
        category: 'registration',
        source: 'kit',
        dueDate: step.completeBy,
      });
    }

    for (const document of documents) {
      tasks.push({
        id: `${stop.id}-kit-${document.id}`,
        label: `Prepare: ${document.label}`,
        completed: false,
        category: 'document',
        source: 'kit',
        dueDate: timeline.submitBy,
      });
    }

    return tasks;
  }

  /** Appends `newTasks` to `existingTasks`, skipping any id already present. Pure function. */
  public static dedupeTasks(existingTasks: ITask[], newTasks: ITask[]): ITask[] {
    const seen = new Set(existingTasks.map(task => task.id));
    const toAdd = newTasks.filter(task => !seen.has(task.id));

    return [...existingTasks, ...toAdd];
  }
}
