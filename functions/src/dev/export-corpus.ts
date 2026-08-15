import * as fs from 'fs';
import * as path from 'path';
import { AdminHelper } from './admin.helper';

const SNAPSHOT_PATH = path.join(__dirname, '..', '..', '..', 'seed', 'corpus.snapshot.json');

interface ISnapshot {
  exportedAt: string;
  docCount: number;
  docs: Record<string, unknown>[];
}

async function main(): Promise<void> {
  const db = AdminHelper.getDb();
  const snapshotDocs: Record<string, unknown>[] = [];

  const corpus = await db.collection('corpus').get();

  for (const doc of corpus.docs) {
    snapshotDocs.push({ __id: doc.id, ...doc.data() });
  }

  const previousCount = fs.existsSync(SNAPSHOT_PATH)
    ? (JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8')) as ISnapshot).docCount
    : 0;

  const snapshot: ISnapshot = {
    exportedAt: new Date().toISOString(),
    docCount: snapshotDocs.length,
    docs: snapshotDocs,
  };

  fs.mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true });
  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 1), 'utf8');

  console.log(`Exported ${snapshot.docCount} corpus docs → seed/corpus.snapshot.json`);
  console.log(`Previous snapshot had ${previousCount} docs (delta ${snapshot.docCount - previousCount}).`);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Export failed:', error);
    process.exit(1);
  });
