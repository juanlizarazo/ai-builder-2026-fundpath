import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'ai-builder-2026-fundpath';
const FIREBASE_CLI_CLIENT_ID =
  '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const FIREBASE_CLI_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';
const PREFERRED_ACCOUNT = 'juan@mindignitegroup.com';

interface IFirebaseCliTokens {
  refresh_token?: string;
}

interface IFirebaseCliAccount {
  user?: { email?: string };
  tokens?: IFirebaseCliTokens;
}

interface IFirebaseCliStore {
  user?: { email?: string };
  tokens?: IFirebaseCliTokens;
  additionalAccounts?: IFirebaseCliAccount[];
}

export class AdminHelper {
  private static _db: Firestore | null = null;

  private static _readCliRefreshToken(): string | null {
    const storePath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');

    if (!fs.existsSync(storePath)) {
      return null;
    }

    const store = JSON.parse(fs.readFileSync(storePath, 'utf8')) as IFirebaseCliStore;
    const accounts: IFirebaseCliAccount[] = [
      { user: store.user, tokens: store.tokens },
      ...(store.additionalAccounts ?? []),
    ];
    const preferred = accounts.find(account => account.user?.email === PREFERRED_ACCOUNT);
    const chosen = preferred ?? accounts.find(account => Boolean(account.tokens?.refresh_token));

    return chosen?.tokens?.refresh_token ?? null;
  }

  private static _existingCredentialsMatchProject(): boolean {
    const existingPath = process.env['GOOGLE_APPLICATION_CREDENTIALS'];

    if (!existingPath || !fs.existsSync(existingPath)) {
      return false;
    }

    try {
      const existing = JSON.parse(fs.readFileSync(existingPath, 'utf8')) as {
        project_id?: string;
        quota_project_id?: string;
      };

      return existing.project_id === PROJECT_ID || existing.quota_project_id === PROJECT_ID;
    } catch {
      return false;
    }
  }

  private static _ensureCredentials(): void {
    if (AdminHelper._existingCredentialsMatchProject()) {
      return;
    }

    const refreshToken = AdminHelper._readCliRefreshToken();

    if (!refreshToken) {
      throw new Error(
        'No local Google credentials. Run `firebase login` or set GOOGLE_APPLICATION_CREDENTIALS.'
      );
    }

    const credentialsPath = path.join(os.tmpdir(), 'fundpath-dev-adc.json');
    fs.writeFileSync(
      credentialsPath,
      JSON.stringify({
        type: 'authorized_user',
        client_id: FIREBASE_CLI_CLIENT_ID,
        client_secret: FIREBASE_CLI_CLIENT_SECRET,
        refresh_token: refreshToken,
      }),
      { mode: 0o600 }
    );

    process.env['GOOGLE_APPLICATION_CREDENTIALS'] = credentialsPath;
  }

  public static getDb(): Firestore {
    if (AdminHelper._db) {
      return AdminHelper._db;
    }

    AdminHelper._ensureCredentials();
    process.env['GOOGLE_CLOUD_PROJECT'] = PROJECT_ID;

    const app = getApps().length
      ? getApps()[0]
      : initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });

    AdminHelper._db = getFirestore(app);

    try {
      AdminHelper._db.settings({ ignoreUndefinedProperties: true });
    } catch {
      AdminHelper._db = getFirestore(app);
    }

    return AdminHelper._db;
  }

  public static getProjectId(): string {
    return PROJECT_ID;
  }
}
