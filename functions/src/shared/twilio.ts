import * as logger from 'firebase-functions/logger';

const TWILIO_MESSAGES_URL = (accountSid: string): string =>
  `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

export class TwilioApiError extends Error {
  public readonly code?: number;
  public readonly status: number;

  constructor(message: string, status: number, code?: number) {
    super(message);
    this.name = 'TwilioApiError';
    this.status = status;
    this.code = code;
  }
}

export interface ITwilioWhatsAppPayload {
  mode: 'whatsapp';
  to: string;
  body: string;
}

export interface ITwilioSmsPayload {
  mode: 'sms';
  to: string;
  body: string;
}

export type ITwilioPayload = ITwilioWhatsAppPayload | ITwilioSmsPayload;

export interface ITwilioSendResult {
  sid: string;
}

export async function sendTwilioMessage(payload: ITwilioPayload): Promise<ITwilioSendResult> {
  const accountSid = process.env['TWILIO_ACCOUNT_SID'];
  const authToken = process.env['TWILIO_AUTH_TOKEN'];

  if (!accountSid || !authToken) {
    throw new TwilioApiError('Twilio credentials are not set', 0);
  }

  const form = new URLSearchParams();
  form.set('Body', payload.body);

  if (payload.mode === 'whatsapp') {
    const from = process.env['TWILIO_WHATSAPP_FROM'];
    if (!from) {
      throw new TwilioApiError('TWILIO_WHATSAPP_FROM is not set', 0);
    }
    form.set('From', `whatsapp:${from}`);
    form.set('To', `whatsapp:${payload.to}`);
  } else {
    const messagingServiceSid = process.env['TWILIO_MESSAGING_SERVICE_SID'];
    if (!messagingServiceSid) {
      throw new TwilioApiError('TWILIO_MESSAGING_SERVICE_SID is not set', 0);
    }
    form.set('MessagingServiceSid', messagingServiceSid);
    form.set('To', payload.to);
  }

  const response = await fetch(TWILIO_MESSAGES_URL(accountSid), {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });

  const json = (await response.json().catch(() => ({}))) as { sid?: string; code?: number; message?: string };

  if (!response.ok) {
    logger.error('Twilio API error', { status: response.status, code: json.code, message: json.message });
    throw new TwilioApiError(json.message ?? `Twilio send failed: ${response.status}`, response.status, json.code);
  }

  return { sid: json.sid ?? '' };
}
