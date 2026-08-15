import { IUtahResource } from '../firestore';
import { Normalizer } from './normalizer';

export class UtahResourcesHelper {
  public static loadSeedResources(): IUtahResource[] {
    const raw = require('../../resources/utah-resources.json') as Record<string, unknown>[];

    return raw.map(record => Normalizer.fromUtahResource(record));
  }
}
