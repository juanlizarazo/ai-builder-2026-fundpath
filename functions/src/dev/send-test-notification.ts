import { SenderService } from '../watch/sender.service';
import { SecretsHelper } from './secrets.helper';

async function main(): Promise<void> {
  const to = process.argv[2];

  if (!to) {
    throw new Error('Usage: yarn dev:notify <email-address>');
  }

  await SecretsHelper.loadResendKey();

  const sender = new SenderService();
  const result = await sender.send({
    channel: 'email',
    to,
    subject: 'FundPath test notification',
    body: 'This is a test send from send-test-notification.ts — sender service is wired up correctly.',
  });

  console.log('SenderService.send result:', result);

  if (!result.delivered) {
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Harness failed:', error);
  process.exit(1);
});
