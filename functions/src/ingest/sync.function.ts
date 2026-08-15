import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { CallableGuardHelper } from '../shared/callable-guard.helper';
import { GrantsGovHelper } from './grants-gov';
import { SbirHelper } from './sbir';
import { AssistanceListingsHelper } from './assistance-listings';
import { USASpendingHelper } from './usaspending';
import { UtahProgramsHelper } from './utah-programs';
import { UtahResourcesHelper } from './utah-resources';
import { Normalizer } from './normalizer';
import { IOpportunity } from '../firestore';
import { AGENCY_ALN_PREFIXES, VERTICAL_NAICS_MAP } from '../route/expansion.constants';

if (!getApps().length) {
  initializeApp();
}

const ALLOWED_ALN_PREFIXES = new Set(Object.values(AGENCY_ALN_PREFIXES));

function isAllowedAln(aln: string | undefined): boolean {
  if (!aln) {
    return true;
  }

  const prefix = aln.split('.')[0];
  return ALLOWED_ALN_PREFIXES.has(prefix);
}

async function runSync(): Promise<void> {
  const db = getFirestore();
  let countGrantsGov = 0;
  let countSbir = 0;
  let countUtah = 0;
  let countAssistanceListings = 0;
  let countUSASpending = 0;

  try {
    const grantsGovRaw = await GrantsGovHelper.fetchPostedOpportunities(
      ['HL', 'ST', 'ED', 'ENV'],
      2000
    );
    logger.info('Grants.gov raw fetched', { count: grantsGovRaw.length });

    for (const raw of grantsGovRaw) {
      try {
        const normalized = Normalizer.fromGrantsGov(raw);

        if (!normalized.sourceId) {
          continue;
        }

        if (!isAllowedAln(normalized.aln)) {
          continue;
        }

        await db.collection('corpus').doc(normalized.sourceId).set(normalized, { merge: true });
        countGrantsGov++;
      } catch (err) {
        logger.warn('Failed to normalize Grants.gov record', { error: (err as Error).message });
      }
    }
    logger.info('Grants.gov upserted', { count: countGrantsGov });
  } catch (err) {
    logger.error('Grants.gov sync failed', { error: (err as Error).message });
  }

  try {
    const [sbirAwards, sbirSolicitations] = await Promise.all([
      SbirHelper.fetchAwardsByState('UT', 2020, 2026),
      SbirHelper.fetchOpenSolicitations(),
    ]);
    logger.info('SBIR raw fetched', {
      awards: sbirAwards.length,
      solicitations: sbirSolicitations.length,
    });

    for (const raw of [...sbirAwards, ...sbirSolicitations]) {
      try {
        const normalized = Normalizer.fromSbir(raw);

        if (!normalized.sourceId) {
          continue;
        }

        await db.collection('corpus').doc(normalized.sourceId).set(normalized, { merge: true });
        countSbir++;
      } catch (err) {
        logger.warn('Failed to normalize SBIR record', { error: (err as Error).message });
      }
    }
    logger.info('SBIR upserted', { count: countSbir });
  } catch (err) {
    logger.error('SBIR sync failed', { error: (err as Error).message });
  }

  try {
    const utahPrograms = UtahProgramsHelper.getSeedPrograms();

    for (const raw of utahPrograms) {
      try {
        const normalized = Normalizer.fromUtahProgram(raw);

        if (!normalized.sourceId) {
          continue;
        }

        const docData: IOpportunity & Record<string, unknown> = {
          ...normalized,
          placement: raw['placement'] ?? undefined,
          programUrl: raw['programUrl'] ?? undefined,
        };

        await db.collection('corpus').doc(normalized.sourceId).set(docData, { merge: true });
        countUtah++;
      } catch (err) {
        logger.warn('Failed to upsert Utah program', { error: (err as Error).message });
      }
    }
    logger.info('Utah programs upserted', { count: countUtah });
  } catch (err) {
    logger.error('Utah programs sync failed', { error: (err as Error).message });
  }

  try {
    const utahResources = UtahResourcesHelper.loadSeedResources();

    for (const resource of utahResources) {
      if (!resource.title) {
        continue;
      }

      const docId = resource.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .substring(0, 64);
      await db.collection('utahResources').doc(docId).set(resource, { merge: true });
    }
    logger.info('Utah resources upserted', { count: utahResources.length });
  } catch (err) {
    logger.error('Utah resources sync failed', { error: (err as Error).message });
  }

  try {
    const samApiKey = process.env['SAM_API_KEY'];
    const listingRaw = await AssistanceListingsHelper.fetchListings(samApiKey);
    logger.info('Assistance listings raw fetched', { count: listingRaw.length });

    for (const raw of listingRaw) {
      try {
        const normalized = Normalizer.fromAssistanceListing(raw);

        if (!normalized.sourceId) {
          continue;
        }

        if (!isAllowedAln(normalized.aln)) {
          continue;
        }

        await db.collection('corpus').doc(`al-${normalized.sourceId}`).set(normalized, { merge: true });
        countAssistanceListings++;
      } catch (err) {
        logger.warn('Failed to normalize assistance listing', { error: (err as Error).message });
      }
    }
    logger.info('Assistance listings upserted', { count: countAssistanceListings });
  } catch (err) {
    logger.error('Assistance listings sync failed', { error: (err as Error).message });
  }

  try {
    const techNaics = [
      ...VERTICAL_NAICS_MAP['health-it'],
      ...VERTICAL_NAICS_MAP['aerospace'],
      ...VERTICAL_NAICS_MAP['cybersecurity'],
      ...VERTICAL_NAICS_MAP['software'],
    ];
    const uniqueNaics = [...new Set(techNaics)];
    const usaRaw = await USASpendingHelper.fetchAwardsByStateAndNaics(
      'UT',
      uniqueNaics,
      ['02', '03', '04', '05', 'A', 'B', 'C', 'D']
    );
    logger.info('USAspending raw fetched', { count: usaRaw.length });

    for (const raw of usaRaw) {
      try {
        const normalized = Normalizer.fromUsaSpending(raw);

        if (!normalized.sourceId) {
          continue;
        }

        await db.collection('corpus').doc(normalized.sourceId).set(normalized, { merge: true });
        countUSASpending++;
      } catch (err) {
        logger.warn('Failed to normalize USAspending record', { error: (err as Error).message });
      }
    }
    logger.info('USAspending upserted', { count: countUSASpending });
  } catch (err) {
    logger.error('USAspending sync failed', { error: (err as Error).message });
  }

  const totalCount = countGrantsGov + countSbir + countUtah + countAssistanceListings + countUSASpending;

  await db
    .collection('corpus')
    .doc('_stats')
    .set({
      lastSyncedAt: Timestamp.now(),
      countGrantsGov,
      countSbir,
      countUtah,
      countAssistanceListings,
      countUSASpending,
      totalCount,
    });

  logger.info('Sync complete', { totalCount, countGrantsGov, countSbir, countUtah, countAssistanceListings, countUSASpending });
}

export const syncCorpus = onSchedule(
  {
    schedule: 'every 24 hours',
    region: 'us-central1',
    timeoutSeconds: 540,
    memory: '1GiB',
  },
  async () => {
    await runSync();
  }
);

export const triggerSync = onCall(
  { region: 'us-central1', timeoutSeconds: 540, memory: '1GiB' },
  async request => {
    CallableGuardHelper.requireAuth(request);
    await runSync();

    return { success: true };
  }
);
