import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { Timestamp } from 'firebase-admin/firestore';
import { CallableGuardHelper } from '../shared/callable-guard.helper';
import { FirebaseHelper } from '../shared/firebase.helper';
import { INotification, IRoute, IStartupProfile } from '../firestore';
import { ISimulateNotificationResponse } from '../types';
import { MessageHelper } from './message.helper';
import { SenderService } from './sender.service';

/**
 * A real send through the real pipeline (Resend), triggered on demand from
 * the account menu — so the notification story is provable at any moment
 * on stage, not only when the daily sync happens to find something new.
 */
export const simulateNotification = onCall(
  {
    region: 'us-central1',
    timeoutSeconds: 60,
    memory: '256MiB',
    secrets: ['RESEND_API_KEY'],
  },
  async (request): Promise<ISimulateNotificationResponse> => {
    const uid = CallableGuardHelper.requireAuth(request);
    const db = FirebaseHelper.getDb();

    await CallableGuardHelper.checkRateLimit(uid, 'simulateNotification', 10, db);

    const routesSnapshot = await db.collection('routes').where('uid', '==', uid).orderBy('createdAt', 'desc').limit(1).get();
    const routeDoc = routesSnapshot.docs[0];
    const route = routeDoc?.data() as IRoute | undefined;
    const stop = route?.stops[0];

    if (!route || !stop) {
      throw new HttpsError('failed-precondition', 'Build a path first — then you can preview what a real alert looks like.');
    }

    const profileSnapshot = await db.collection('profiles').doc(uid).get();
    const profile = profileSnapshot.data() as IStartupProfile | undefined;
    const to = profile?.notifyEmail || request.auth?.token.email;

    if (!to) {
      throw new HttpsError('failed-precondition', 'Add a notification email to your path first.');
    }

    const message = MessageHelper.demoTest(route, stop);

    const notifRef = db.collection('notifications').doc();
    const notification: INotification = {
      id: notifRef.id,
      uid,
      routeId: route.id ?? routeDoc.id,
      kind: 'demo-test',
      title: message.subject,
      body: message.body,
      stopIds: [stop.id],
      channel: 'email',
      deliveryStatus: 'inbox-only',
      createdAt: Timestamp.now(),
    };

    await notifRef.set(notification);

    const sender = new SenderService();
    const result = await sender.send({ channel: 'email', to, subject: message.subject, body: message.body, html: message.html });

    await notifRef.update({
      deliveryStatus: result.delivered ? 'sent' : 'failed',
      providerMessageId: result.providerMessageId,
      errorMessage: result.error,
    });

    if (!result.delivered) {
      logger.error('simulateNotification failed to send', { uid, error: result.error });
      throw new HttpsError('internal', 'We could not send the test email just now. Please try again in a moment.');
    }

    return { sentTo: to, message: `Test alert sent to ${to} — check your inbox.` };
  }
);
