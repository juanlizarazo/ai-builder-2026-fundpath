import * as fs from 'fs';
import * as path from 'path';
import { Timestamp } from 'firebase-admin/firestore';
import { AdminHelper } from './admin.helper';

const SNAPSHOT_PATH = path.join(__dirname, '..', '..', '..', 'seed', 'corpus.snapshot.json');
const WRITE_BATCH_SIZE = 400;

interface ISnapshot {
  exportedAt: string;
  docCount: number;
  docs: Record<string, unknown>[];
}

function reviveTimestamps(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(reviveTimestamps);
  }

  if (value === null || typeof value !== 'object') {
    return value;
  }

  const record = value as Record<string, unknown>;

  if (typeof record['_seconds'] === 'number' && typeof record['_nanoseconds'] === 'number') {
    return new Timestamp(record['_seconds'], record['_nanoseconds']);
  }

  const revived: Record<string, unknown> = {};

  for (const [key, nested] of Object.entries(record)) {
    revived[key] = reviveTimestamps(nested);
  }

  return revived;
}

async function main(): Promise<void> {
  if (!fs.existsSync(SNAPSHOT_PATH)) {
    throw new Error('No snapshot at seed/corpus.snapshot.json — run `yarn seed:export` first.');
  }

  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8')) as ISnapshot;
  const db = AdminHelper.getDb();
  const liveCount = (await db.collection('corpus').count().get()).data().count;

  console.log(`Snapshot: ${snapshot.docCount} docs (exported ${snapshot.exportedAt})`);
  console.log(`Live corpus: ${liveCount} docs`);
  console.log(`Restore would write ${snapshot.docCount} docs (delta ${snapshot.docCount - liveCount}).`);

  if (!process.argv.includes('--confirm')) {
    console.log('\nDRY RUN. This is a destructive write to the only database we have.');
    console.log('Re-run with --confirm to actually restore.');

    return;
  }

  let batch = db.batch();
  let pending = 0;
  let written = 0;

  for (const doc of snapshot.docs) {
    const { __id, ...data } = doc as { __id: string } & Record<string, unknown>;
    batch.set(db.collection('corpus').doc(__id), reviveTimestamps(data) as Record<string, unknown>);
    pending++;
    written++;

    if (pending >= WRITE_BATCH_SIZE) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  }

  if (pending > 0) {
    await batch.commit();
  }

  console.log(`Restored ${written} corpus docs.`);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Restore failed:', error);
    process.exit(1);
  });
