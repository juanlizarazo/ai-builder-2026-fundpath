import * as logger from 'firebase-functions/logger';

const RESEND_API_URL = 'https://api.resend.com/emails';
const FROM_ADDRESS = 'FundPath <noreply@dev.juanlizarazo.com>';

export interface IEmailPayload {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendEmail(payload: IEmailPayload): Promise<void> {
  const apiKey = process.env['RESEND_API_KEY'];

  if (!apiKey) {
    throw new Error('RESEND_API_KEY secret is not set');
  }

  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error('Resend API error', { status: response.status, error });
    throw new Error(`Email send failed: ${response.status}`);
  }
}
