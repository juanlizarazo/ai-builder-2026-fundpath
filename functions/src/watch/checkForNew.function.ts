import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { CallableGuardHelper } from '../shared/callable-guard.helper';
import { FirebaseHelper } from '../shared/firebase.helper';
import { IRoute } from '../firestore';
import { ICheckForNewRequest, ICheckForNewResponse } from '../types';
import { RouteBuilderService } from '../route/route-builder.service';

const routeBuilder = new RouteBuilderService();

export const checkForNew = onCall(
  {
    region: 'us-central1',
    timeoutSeconds: 300,
    memory: '1GiB',
    secrets: ['ANTHROPIC_API_KEY', 'RESEND_API_KEY'],
  },
  async (request): Promise<ICheckForNewResponse> => {
    const uid = CallableGuardHelper.requireAuth(request);
    const payload = CallableGuardHelper.validateSchema<ICheckForNewRequest>(request.data, ['routeId']);
    const db = FirebaseHelper.getDb();

    await CallableGuardHelper.checkRateLimit(uid, 'checkForNew', 10, db);

    const routeSnapshot = await db.collection('routes').doc(payload.routeId).get();
    const route = routeSnapshot.data() as IRoute | undefined;

    if (!route || route.uid !== uid) {
      throw new HttpsError('permission-denied', 'That route does not belong to you.');
    }

    try {
      const freshStops = await routeBuilder.deepPass(db, payload.routeId, true);

      if (freshStops.length === 0) {
        return {
          foundNew: false,
          addedCount: 0,
          message: 'Checked the full corpus — nothing new since your last route.',
        };
      }

      return {
        foundNew: true,
        addedCount: freshStops.length,
        message: `Found ${freshStops.length} new funding opportunit${freshStops.length === 1 ? 'y' : 'ies'} — check your route.`,
      };
    } catch (err) {
      logger.error('checkForNew failed', { uid, routeId: payload.routeId, error: (err as Error).message });

      throw new HttpsError('internal', 'We could not check for new funding opportunities just now. Please try again in a moment.');
    }
  }
);
