import * as fs from 'fs';
import { GoogleAuth } from 'google-auth-library';
import { AdminHelper } from './admin.helper';

interface IAuthorizedUser {
  type?: string;
  client_id: string;
  client_secret: string;
  refresh_token: string;
}

export class SecretsHelper {
  private static async _cliAccessToken(): Promise<string | null> {
    const refreshToken = AdminHelper.readCliRefreshToken();

    if (!refreshToken) {
      return null;
    }

    const { clientId, clientSecret } = AdminHelper.getCliClientCredentials();
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      return null;
    }

    const json = (await response.json()) as { access_token: string };

    return json.access_token;
  }

  private static async _accessToken(): Promise<string> {
    AdminHelper.getDb();

    // The service account key in GOOGLE_APPLICATION_CREDENTIALS often lacks
    // Secret Manager IAM access; the firebase-tools CLI login usually has it.
    const cliToken = await SecretsHelper._cliAccessToken();

    if (cliToken) {
      return cliToken;
    }

    const credentialsPath = process.env['GOOGLE_APPLICATION_CREDENTIALS'];

    if (!credentialsPath || !fs.existsSync(credentialsPath)) {
      throw new Error('No local credentials available for Secret Manager access.');
    }

    const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8')) as IAuthorizedUser;

    if (credentials.type === 'service_account') {
      const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
      const client = await auth.getClient();
      const token = await client.getAccessToken();

      if (!token.token) {
        throw new Error('Could not mint an access token from the service account key.');
      }

      return token.token;
    }

    if (!credentials.refresh_token) {
      throw new Error('Local credentials are neither a service account key nor an authorized_user file with a refresh token.');
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: credentials.client_id,
        client_secret: credentials.client_secret,
        refresh_token: credentials.refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.status}`);
    }

    const json = (await response.json()) as { access_token: string };

    return json.access_token;
  }

  private static async _loadSecret(name: string): Promise<string> {
    const token = await SecretsHelper._accessToken();
    const url = `https://secretmanager.googleapis.com/v1/projects/${AdminHelper.getProjectId()}/secrets/${name}/versions/latest:access`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

    if (!response.ok) {
      throw new Error(`Secret Manager read failed for ${name}: ${response.status}`);
    }

    const json = (await response.json()) as { payload: { data: string } };

    return Buffer.from(json.payload.data, 'base64').toString('utf8');
  }

  public static async loadAnthropicKey(): Promise<void> {
    if (process.env['ANTHROPIC_API_KEY']) {
      return;
    }

    process.env['ANTHROPIC_API_KEY'] = await SecretsHelper._loadSecret('ANTHROPIC_API_KEY');
  }

  public static async loadResendKey(): Promise<void> {
    if (process.env['RESEND_API_KEY']) {
      return;
    }

    process.env['RESEND_API_KEY'] = await SecretsHelper._loadSecret('RESEND_API_KEY');
  }
}
