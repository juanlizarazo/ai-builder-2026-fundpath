import * as fs from 'fs';
import * as logger from 'firebase-functions/logger';
import { initializeApp, getApps, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'ai-builder-2026-fundpath';

export class FirebaseHelper {
  private static _db: Firestore | null = null;

  private static _clearForeignEmulatorCredentials(): void {
    if (process.env['FUNCTIONS_EMULATOR'] !== 'true') {
      return;
    }

    const credentialsPath = process.env['GOOGLE_APPLICATION_CREDENTIALS'];

    if (!credentialsPath || !fs.existsSync(credentialsPath)) {
      return;
    }

    try {
      const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8')) as {
        project_id?: string;
      };

      if (credentials.project_id && credentials.project_id !== PROJECT_ID) {
        logger.warn('Ignoring GOOGLE_APPLICATION_CREDENTIALS from a different project', {
          credentialProject: credentials.project_id,
          expectedProject: PROJECT_ID,
        });
        delete process.env['GOOGLE_APPLICATION_CREDENTIALS'];
      }
    } catch (err) {
      logger.warn('Could not read GOOGLE_APPLICATION_CREDENTIALS', {
        error: (err as Error).message,
      });
    }
  }

  public static getApp(): App {
    FirebaseHelper._clearForeignEmulatorCredentials();

    return getApps().length ? getApps()[0] : initializeApp();
  }

  public static getDb(): Firestore {
    if (FirebaseHelper._db) {
      return FirebaseHelper._db;
    }

    FirebaseHelper._db = getFirestore(FirebaseHelper.getApp());

    try {
      FirebaseHelper._db.settings({ ignoreUndefinedProperties: true });
    } catch (err) {
      logger.debug('Firestore settings already applied', { error: (err as Error).message });
    }

    return FirebaseHelper._db;
  }
}
