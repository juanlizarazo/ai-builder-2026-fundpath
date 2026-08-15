import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import { FirebaseHelper } from '../shared/firebase.helper';
import { RouteBuilderService } from './route-builder.service';

const routeBuilder = new RouteBuilderService();

export const deepPass = onDocumentCreated(
  {
    document: 'routes/{routeId}',
    region: 'us-central1',
    timeoutSeconds: 300,
    memory: '1GiB',
    secrets: ['ANTHROPIC_API_KEY'],
  },
  async event => {
    const routeId = event.params['routeId'];

    try {
      await routeBuilder.deepPass(FirebaseHelper.getDb(), routeId);
    } catch (err) {
      logger.error('Deep pass failed', { routeId, error: (err as Error).message });

      try {
        await FirebaseHelper.getDb()
          .collection('routes')
          .doc(routeId)
          .update({ deepPassStatus: 'complete', deepPassFoundNew: false });
      } catch (updateErr) {
        logger.error('Deep pass could not clear running status', {
          routeId,
          error: (updateErr as Error).message,
        });
      }
    }
  }
);
