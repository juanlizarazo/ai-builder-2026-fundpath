import { Firestore, Timestamp } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { INotification, IRoute, IStartupProfile, IStop, NotificationKind } from '../firestore';
import { MessageHelper } from './message.helper';
import { SenderService } from './sender.service';

export interface INotifySendParams {
  uid: string;
  routeId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  html?: string;
  stopIds: string[];
}

export class NotifyService {
  private readonly _sender = new SenderService();

  public async send(db: Firestore, params: INotifySendParams): Promise<void> {
    const notifRef = db.collection('notifications').doc();
    const notification: INotification = {
      id: notifRef.id,
      uid: params.uid,
      routeId: params.routeId,
      kind: params.kind,
      title: params.title,
      body: params.body,
      stopIds: params.stopIds,
      channel: 'inbox',
      deliveryStatus: 'inbox-only',
      createdAt: Timestamp.now(),
    };

    try {
      await notifRef.set(notification);
    } catch (err) {
      logger.error('NotifyService failed to write inbox notification', { uid: params.uid, error: (err as Error).message });
      return;
    }

    try {
      const profileSnap = await db.collection('profiles').doc(params.uid).get();
      const profile = profileSnap.data() as IStartupProfile | undefined;

      if (!profile) {
        return;
      }

      // The inbox record tracks one external channel per notification; email is
      // preferred since it's deliverable today, phone only when there's no email.
      if (profile.notifyEmail) {
        const result = await this._sender.send({
          channel: 'email',
          to: profile.notifyEmail,
          subject: params.title,
          body: params.body,
          html: params.html,
        });
        await notifRef.update({
          channel: 'email',
          deliveryStatus: result.delivered ? 'sent' : 'failed',
          providerMessageId: result.providerMessageId,
          errorMessage: result.error,
        });
        return;
      }

      if (profile.smsOptIn === true && profile.notifyPhone) {
        const phoneChannel = process.env['NOTIFY_CHANNEL'] ?? 'email';
        if (phoneChannel === 'whatsapp' || phoneChannel === 'sms' || phoneChannel === 'telegram') {
          const result = await this._sender.send({
            channel: phoneChannel,
            to: profile.notifyPhone,
            subject: params.title,
            body: params.body,
          });
          await notifRef.update({
            channel: phoneChannel,
            deliveryStatus: result.delivered ? 'sent' : 'failed',
            providerMessageId: result.providerMessageId,
            errorMessage: result.error,
          });
        }
      }
    } catch (err) {
      logger.error('NotifyService failed to deliver notification', { uid: params.uid, error: (err as Error).message });
    }
  }

  public async routeReady(db: Firestore, route: IRoute): Promise<void> {
    const firstStop: IStop | undefined = route.stops[0];
    if (!firstStop) {
      return;
    }

    const message = MessageHelper.routeReady(route, firstStop);
    await this.send(db, {
      uid: route.uid,
      routeId: route.id ?? '',
      kind: 'route-ready',
      title: message.subject,
      body: message.body,
      html: message.html,
      stopIds: [firstStop.id],
    });
  }

  public async newStops(db: Firestore, route: IRoute, freshStops: IStop[]): Promise<void> {
    if (freshStops.length === 0) {
      return;
    }

    const message = MessageHelper.newStops(route, freshStops);
    await this.send(db, {
      uid: route.uid,
      routeId: route.id ?? '',
      kind: 'new-stops',
      title: message.subject,
      body: message.body,
      html: message.html,
      stopIds: freshStops.map(stop => stop.id),
    });
  }
}
