import * as logger from 'firebase-functions/logger';
import { sendEmail } from '../shared/email';
import { sendTwilioMessage, TwilioApiError } from '../shared/twilio';
import { NotifyChannel } from '../firestore';

export interface ISendPayload {
  channel: NotifyChannel;
  to: string;
  subject: string;
  body: string;
  html?: string;
}

export interface ISendResult {
  delivered: boolean;
  providerMessageId?: string;
  error?: string;
}

const WHATSAPP_WINDOW_EXPIRED_CODE = 63016;

export class SenderService {
  public async send(payload: ISendPayload): Promise<ISendResult> {
    try {
      switch (payload.channel) {
        case 'email':
          return await this._sendEmail(payload);
        case 'whatsapp':
          return await this._sendTwilio({ mode: 'whatsapp', to: payload.to, body: payload.body });
        case 'sms':
          return await this._sendTwilio({ mode: 'sms', to: payload.to, body: payload.body });
        case 'telegram':
          return { delivered: false, error: 'Telegram channel is not implemented' };
        default:
          return { delivered: false, error: `Unsupported channel: ${payload.channel as string}` };
      }
    } catch (err) {
      const error = (err as Error).message;
      logger.error('SenderService.send failed', { channel: payload.channel, error });
      return { delivered: false, error };
    }
  }

  private async _sendEmail(payload: ISendPayload): Promise<ISendResult> {
    await sendEmail({
      to: payload.to,
      subject: payload.subject,
      html: payload.html ?? payload.body,
      text: payload.body,
    });
    return { delivered: true };
  }

  private async _sendTwilio(payload: { mode: 'whatsapp' | 'sms'; to: string; body: string }): Promise<ISendResult> {
    try {
      const result = await sendTwilioMessage(payload);
      return { delivered: true, providerMessageId: result.sid };
    } catch (err) {
      if (err instanceof TwilioApiError && err.code === WHATSAPP_WINDOW_EXPIRED_CODE) {
        return {
          delivered: false,
          error: 'WhatsApp session expired; message the sandbox to reopen.',
        };
      }
      throw err;
    }
  }
}
