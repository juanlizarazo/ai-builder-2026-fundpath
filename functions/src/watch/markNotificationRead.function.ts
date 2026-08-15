import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { Timestamp } from 'firebase-admin/firestore';
import { CallableGuardHelper } from '../shared/callable-guard.helper';
import { FirebaseHelper } from '../shared/firebase.helper';
import { INotification } from '../firestore';

interface IMarkNotificationReadRequest {
  notificationId: string;
}

export const markNotificationRead = onCall(
  { region: 'us-central1' },
  async (request): Promise<{ success: boolean }> => {
    const uid = CallableGuardHelper.requireAuth(request);
    const payload = CallableGuardHelper.validateSchema<IMarkNotificationReadRequest>(request.data, ['notificationId']);
    const db = FirebaseHelper.getDb();

    const ref = db.collection('notifications').doc(payload.notificationId);
    const snapshot = await ref.get();
    const notification = snapshot.data() as INotification | undefined;

    if (!notification || notification.uid !== uid) {
      throw new HttpsError('permission-denied', 'That notification does not belong to you.');
    }

    await ref.update({ readAt: Timestamp.now() });

    return { success: true };
  }
);
