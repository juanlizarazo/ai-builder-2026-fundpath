import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { CallableGuardHelper } from '../shared/callable-guard.helper';
import { FirebaseHelper } from '../shared/firebase.helper';
import { IGenerateStarterKitRequest, IGenerateStarterKitResponse } from '../types';
import { StarterKitService } from './starter-kit.service';

const starterKitService = new StarterKitService();

/** Per-uid cap: this calls Claude (four narrative drafts) so it is capped the
 * same order of magnitude as `buildRoute`-style narrative work — 10/hour is
 * generous for a demo/founder workflow (a handful of stops per session) while
 * still bounding worst-case Claude spend if a client retries in a loop. */
const RATE_LIMIT_PER_HOUR = 100;

export const generateStarterKit = onCall(
  {
    region: 'us-central1',
    timeoutSeconds: 120,
    memory: '512MiB',
    secrets: ['ANTHROPIC_API_KEY'],
  },
  async (request): Promise<IGenerateStarterKitResponse> => {
    const uid = CallableGuardHelper.requireAuth(request);
    const payload = CallableGuardHelper.validateSchema<IGenerateStarterKitRequest>(request.data, [
      'routeId',
      'stopId',
    ]);
    const db = FirebaseHelper.getDb();

    await CallableGuardHelper.checkRateLimit(uid, 'generateStarterKit', RATE_LIMIT_PER_HOUR, db);

    try {
      const kit = await starterKitService.assemble(db, uid, payload.routeId, payload.stopId);

      return { routeId: payload.routeId, stopId: payload.stopId, kit };
    } catch (err) {
      logger.error('generateStarterKit failed', {
        uid,
        routeId: payload.routeId,
        stopId: payload.stopId,
        error: (err as Error).message,
      });

      throw new HttpsError(
        'internal',
        'We could not put together your starter kit just now. Please try again in a moment.'
      );
    }
  }
);
