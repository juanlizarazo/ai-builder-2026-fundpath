import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { CallableGuardHelper } from '../shared/callable-guard.helper';
import { FirebaseHelper } from '../shared/firebase.helper';
import { IBuildRouteRequest, IBuildRouteResponse } from '../types';
import { RouteBuilderService } from './route-builder.service';

const routeBuilder = new RouteBuilderService();

export const buildRoute = onCall(
  {
    region: 'us-central1',
    timeoutSeconds: 300,
    memory: '1GiB',
    secrets: ['ANTHROPIC_API_KEY'],
  },
  async (request): Promise<IBuildRouteResponse> => {
    const uid = CallableGuardHelper.requireAuth(request);
    const payload = CallableGuardHelper.validateSchema<IBuildRouteRequest>(request.data, [
      'description',
    ]);
    const description = String(payload.description ?? '').trim();

    if (description.length < 20) {
      throw new HttpsError(
        'invalid-argument',
        'Tell us a bit more about your company — a sentence or two works best.'
      );
    }

    try {
      const result = await routeBuilder.build(FirebaseHelper.getDb(), uid, description);

      return {
        profileId: result.profileId,
        routeId: result.routeId,
        route: result.route,
      };
    } catch (err) {
      logger.error('buildRoute failed', { uid, error: (err as Error).message });

      throw new HttpsError(
        'internal',
        'We could not build your funding route just now. Please try again in a moment.'
      );
    }
  }
);
