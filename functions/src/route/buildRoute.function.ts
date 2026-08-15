import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { CallableGuardHelper } from '../shared/callable-guard.helper';
import { FirebaseHelper } from '../shared/firebase.helper';
import { IBuildRouteRequest, IBuildRouteResponse } from '../types';
import { NotifyService } from '../watch/notify.service';
import { RouteBuilderService } from './route-builder.service';

const routeBuilder = new RouteBuilderService();
const notifyService = new NotifyService();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizePhone(rawPhone: string): string {
  const digits = rawPhone.replace(/\D/g, '');

  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  throw new HttpsError('invalid-argument', 'That phone number does not look like a valid US number.');
}

export const buildRoute = onCall(
  {
    region: 'us-central1',
    timeoutSeconds: 300,
    memory: '1GiB',
    secrets: ['ANTHROPIC_API_KEY', 'RESEND_API_KEY'],
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

    const notifyEmail = payload.notifyEmail?.trim() || request.auth?.token.email;
    if (notifyEmail && !EMAIL_PATTERN.test(notifyEmail)) {
      throw new HttpsError('invalid-argument', 'That email address does not look valid.');
    }

    const notifyPhone = payload.notifyPhone?.trim() ? normalizePhone(payload.notifyPhone.trim()) : undefined;
    const smsOptIn = payload.smsOptIn === true;

    try {
      const db = FirebaseHelper.getDb();
      const result = await routeBuilder.build(db, uid, description, {
        notifyEmail,
        notifyPhone,
        smsOptIn,
      });

      if (result.route.stops.length > 0) {
        await notifyService.routeReady(db, result.route);
      }

      return {
        profileId: result.profileId,
        routeId: result.routeId,
        route: result.route,
      };
    } catch (err) {
      if (err instanceof HttpsError) {
        throw err;
      }

      logger.error('buildRoute failed', { uid, error: (err as Error).message });

      throw new HttpsError(
        'internal',
        'We could not build your funding route just now. Please try again in a moment.'
      );
    }
  }
);
