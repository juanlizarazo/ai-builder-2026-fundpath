import * as fs from 'fs';
import { AdminHelper } from './admin.helper';

interface IAuthorizedUser {
  client_id: string;
  client_secret: string;
  refresh_token: string;
}

export class SecretsHelper {
  private static async _accessToken(): Promise<string> {
    AdminHelper.getDb();

    const credentialsPath = process.env['GOOGLE_APPLICATION_CREDENTIALS'];

    if (!credentialsPath || !fs.existsSync(credentialsPath)) {
      throw new Error('No local credentials available for Secret Manager access.');
    }

    const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8')) as IAuthorizedUser;

    if (!credentials.refresh_token) {
      throw new Error('Local credentials are not an authorized_user file with a refresh token.');
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

  public static async loadAnthropicKey(): Promise<void> {
    if (process.env['ANTHROPIC_API_KEY']) {
      return;
    }

    const token = await SecretsHelper._accessToken();
    const url = `https://secretmanager.googleapis.com/v1/projects/${AdminHelper.getProjectId()}/secrets/ANTHROPIC_API_KEY/versions/latest:access`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

    if (!response.ok) {
      throw new Error(`Secret Manager read failed: ${response.status}`);
    }

    const json = (await response.json()) as { payload: { data: string } };
    process.env['ANTHROPIC_API_KEY'] = Buffer.from(json.payload.data, 'base64').toString('utf8');
  }
}
