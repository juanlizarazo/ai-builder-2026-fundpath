import { onRequest } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import * as logger from 'firebase-functions/logger';

setGlobalOptions({ region: 'us-central1', maxInstances: 10, minInstances: 1 });

export { triggerSync } from './ingest/sync.function';
export { buildRoute } from './route/buildRoute.function';
export { deepPass } from './route/deepPass.function';
export { generateStarterKit } from './application/generateStarterKit.function';
export { generateSf424 } from './application/generateSf424.function';
export { checkForNew } from './watch/checkForNew.function';
export { markNotificationRead } from './watch/markNotificationRead.function';

export const hello = onRequest({ cors: true }, async (req, res) => {
  try {
    logger.info('hello called');
    res.json({ message: 'FundPath is alive' });
  } catch (err) {
    logger.error('hello error', { error: (err as Error).message });
    res.status(500).json({ error: (err as Error).message });
  }
});
