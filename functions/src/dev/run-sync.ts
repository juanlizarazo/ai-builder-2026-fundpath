import { AdminHelper } from './admin.helper';

async function main(): Promise<void> {
  AdminHelper.getDb();

  const { runSync } = await import('../ingest/sync.function');

  console.log('Starting corpus sync against project', AdminHelper.getProjectId());
  const startedAt = Date.now();
  await runSync();
  console.log(`Sync finished in ${Math.round((Date.now() - startedAt) / 1000)}s`);

  const stats = await AdminHelper.getDb().collection('corpusMeta').doc('stats').get();
  console.log('corpusMeta/stats:', JSON.stringify(stats.data(), null, 2));
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Sync failed:', error);
    process.exit(1);
  });
