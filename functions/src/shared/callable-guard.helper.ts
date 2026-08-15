import { CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { Firestore } from 'firebase-admin/firestore';

export class CallableGuardHelper {
  public static requireAuth(request: CallableRequest): string {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    return request.auth.uid;
  }

  public static validateSchema<T>(data: unknown, requiredKeys: (keyof T)[]): T {
    if (typeof data !== 'object' || data === null) {
      throw new HttpsError('invalid-argument', 'Request data must be an object');
    }

    const obj = data as Record<string, unknown>;

    for (const key of requiredKeys) {
      if (obj[key as string] === undefined) {
        throw new HttpsError('invalid-argument', `Missing required field: ${String(key)}`);
      }
    }

    return data as T;
  }

  public static async checkRateLimit(
    uid: string,
    action: string,
    maxPerHour: number,
    db: Firestore
  ): Promise<void> {
    const now = Date.now();
    const windowStart = now - 60 * 60 * 1000;
    const ref = db.collection('rateLimits').doc(uid).collection('actions').doc(action);

    await db.runTransaction(async tx => {
      const doc = await tx.get(ref);
      const docData = doc.data() as { count: number; windowStart: number } | undefined;

      if (!docData || docData.windowStart < windowStart) {
        tx.set(ref, { count: 1, windowStart: now });

        return;
      }

      if (docData.count >= maxPerHour) {
        throw new HttpsError('resource-exhausted', 'Rate limit exceeded');
      }

      tx.update(ref, { count: docData.count + 1 });
    });
  }
}
