import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { Firestore, Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { CallableGuardHelper } from '../shared/callable-guard.helper';
import { FirebaseHelper } from '../shared/firebase.helper';
import { IGenerateSf424Request, IGenerateSf424Response } from '../types';
import { IApplicantDetails, IOpportunity, IRoute, IStop } from '../firestore';
import { ISf424FillValues } from './application.interfaces';
import { SF424Helper } from './sf424.helper';

/** Per-uid cap: no Claude call here (pure PDF fill + one Storage round-trip),
 * so this can afford to be looser than `generateStarterKit`'s cap — 20/hour
 * comfortably covers a founder iterating on applicant details across a few
 * stops while still bounding Storage writes if a client retries in a loop. */
const RATE_LIMIT_PER_HOUR = 20;

const SIGNED_URL_TTL_MS = 60 * 60 * 1000;

/**
 * Builds the `ISf424FillValues` `SF424Helper.fill` expects from a route stop,
 * its opportunity (for ALN/funding-opportunity fields), and the founder's
 * applicant details — mirrors `dev/run-kit.ts`'s `writeSf424` construction
 * exactly so the callable and the dev harness never disagree about what gets
 * filled. Exported as a pure function so it's unit-testable without Firestore.
 */
export function buildSf424FillValues(
  applicantDetails: IApplicantDetails,
  stop: IStop,
  opportunity: IOpportunity | undefined
): ISf424FillValues {
  return {
    ...applicantDetails,
    alnNumber: stop.aln,
    fundingOpportunityNumber: opportunity?.source === 'grants-gov' ? opportunity.sourceId : undefined,
    fundingOpportunityTitle: stop.title,
    applicantType: 'Small Business',
    typeOfSubmission: 'Application',
    typeOfApplication: 'New',
  };
}

async function loadRouteAndStop(db: Firestore, uid: string, routeId: string, stopId: string): Promise<{ route: IRoute; stop: IStop }> {
  const routeSnapshot = await db.collection('routes').doc(routeId).get();
  const route = routeSnapshot.data() as IRoute | undefined;

  if (!route) {
    throw new Error(`Route not found: ${routeId}`);
  }

  if (route.uid !== uid) {
    throw new Error(`Route ${routeId} does not belong to user ${uid}`);
  }

  const stop = (route.stops ?? []).find(candidate => candidate.id === stopId);

  if (!stop) {
    throw new Error(`Stop ${stopId} not found on route ${routeId}`);
  }

  return { route, stop };
}

async function loadOpportunity(db: Firestore, stop: IStop): Promise<IOpportunity | undefined> {
  if (!stop.opportunityId) {
    return undefined;
  }

  const snapshot = await db.collection('opportunities').doc(stop.opportunityId).get();

  return snapshot.data() as IOpportunity | undefined;
}

/**
 * Uploads `pdfBytes` to Storage and returns a 60-minute v4 signed URL. Any
 * failure anywhere in this sequence — bucket not enabled yet, upload failure,
 * or the signing call itself (e.g. missing `roles/iam.serviceAccountTokenCreator`
 * during IAM propagation) — must be handled by the caller's catch, so this
 * function does not swallow anything itself; it just does the work.
 */
async function uploadAndSign(storagePath: string, pdfBytes: Uint8Array): Promise<{ url: string; expiresAt: string }> {
  const bucket = getStorage(FirebaseHelper.getApp()).bucket();
  const file = bucket.file(storagePath);

  await file.save(Buffer.from(pdfBytes), { contentType: 'application/pdf' });

  const expires = Date.now() + SIGNED_URL_TTL_MS;
  const [url] = await file.getSignedUrl({ action: 'read', expires, version: 'v4' });

  return { url, expiresAt: new Date(expires).toISOString() };
}

export const generateSf424 = onCall(
  {
    region: 'us-central1',
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  async (request): Promise<IGenerateSf424Response> => {
    const uid = CallableGuardHelper.requireAuth(request);
    const payload = CallableGuardHelper.validateSchema<IGenerateSf424Request>(request.data, [
      'routeId',
      'stopId',
      'applicantDetails',
    ]);
    const db = FirebaseHelper.getDb();

    await CallableGuardHelper.checkRateLimit(uid, 'generateSf424', RATE_LIMIT_PER_HOUR, db);

    try {
      await db.collection('profiles').doc(uid).set({ applicantDetails: payload.applicantDetails }, { merge: true });

      const { stop } = await loadRouteAndStop(db, uid, payload.routeId, payload.stopId);
      const opportunity = await loadOpportunity(db, stop);
      const values = buildSf424FillValues(payload.applicantDetails, stop, opportunity);
      const pdfBytes = await SF424Helper.fill(SF424Helper.loadBasePdf(), values);
      const storagePath = `applications/${uid}/${payload.routeId}/${payload.stopId}/sf424.pdf`;

      let signed: { url: string; expiresAt: string } | undefined;

      try {
        signed = await uploadAndSign(storagePath, pdfBytes);
      } catch (storageErr) {
        logger.warn('generateSf424 Storage upload/sign unavailable, falling back to base64', {
          uid,
          routeId: payload.routeId,
          stopId: payload.stopId,
          error: (storageErr as Error).message,
        });

        return { base64: Buffer.from(pdfBytes).toString('base64') };
      }

      // Only reachable once uploadAndSign has genuinely succeeded, so a caller
      // that got a base64 fallback is never pointed at a storagePath it can't
      // itself read. This write is deliberately outside the try/catch above: a
      // failure here (e.g. a transient Firestore error) is a real bug, not a
      // tolerated Storage-provisioning gap, and must not discard an already
      // valid signed URL by falling back to base64 — it should surface as the
      // outer catch's generic HttpsError instead.
      const kitRef = db.collection('starterKits').doc(`${uid}_${payload.routeId}_${payload.stopId}`);

      await kitRef.set({ sf424: { storagePath, generatedAt: Timestamp.now() } }, { merge: true });

      return signed;
    } catch (err) {
      logger.error('generateSf424 failed', {
        uid,
        routeId: payload.routeId,
        stopId: payload.stopId,
        error: (err as Error).message,
      });

      throw new HttpsError(
        'internal',
        'We could not generate your SF-424 just now. Please try again in a moment.'
      );
    }
  }
);
