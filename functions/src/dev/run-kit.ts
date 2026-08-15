import { AdminHelper } from './admin.helper';
import { SecretsHelper } from './secrets.helper';
import { CASE_DESCRIPTIONS, CASE_LABELS, HARNESS_UID } from './cases.fixture';
import { IRoute, IStarterKit, IStop } from '../firestore';

function printTimeline(kit: IStarterKit): void {
  console.log(`\n${'='.repeat(78)}\nREGISTRATION TIMELINE (${kit.timeline.mode})\n${'='.repeat(78)}`);
  console.log(`  ${kit.timeline.headline}`);
  console.log(`  feasible: ${kit.timeline.feasible}  slack: ${kit.timeline.slackBusinessDays} business days`);

  for (const step of kit.timeline.steps) {
    console.log(
      `  [${step.key}] ${step.label} — start by ${step.startBy.toDate().toDateString()}, complete by ${step.completeBy
        .toDate()
        .toDateString()}`,
    );
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const caseArgIndex = args.indexOf('--case');
  const caseNumber = caseArgIndex >= 0 ? Number(args[caseArgIndex + 1]) : 2;
  const caseIndex = caseNumber - 1;

  if (!CASE_DESCRIPTIONS[caseIndex]) {
    throw new Error(`No case ${caseNumber} — valid range is 1-${CASE_DESCRIPTIONS.length}`);
  }

  if (!process.env['FUNDPATH_LLM_CACHE']) {
    process.env['FUNDPATH_LLM_CACHE'] = '1';
  }

  console.log('FundPath starter-kit dev harness');
  console.log(`  project: ${AdminHelper.getProjectId()} (production database)`);
  console.log(`  case: ${CASE_LABELS[caseIndex]}`);
  console.log(`  llm cache: ${process.env['FUNDPATH_LLM_CACHE'] === '1' ? 'on' : 'off'}`);

  await SecretsHelper.loadAnthropicKey();

  const db = AdminHelper.getDb();
  const { RouteBuilderService } = await import('../route/route-builder.service');
  const { StarterKitService } = await import('../application/starter-kit.service');
  const builder = new RouteBuilderService();
  const kitService = new StarterKitService();

  const routeStartedAt = Date.now();
  const result = await builder.build(db, HARNESS_UID, CASE_DESCRIPTIONS[caseIndex]);
  console.log(`  route built in ${((Date.now() - routeStartedAt) / 1000).toFixed(1)}s — routeId ${result.routeId}`);

  const stop: IStop | undefined = (result.route.stops ?? [])[0];

  if (!stop) {
    console.log('  no eligible stops on this route — nothing to assemble a starter kit for.');

    return;
  }

  console.log(`  stop: ${stop.title} (${stop.agency})`);

  const kitStartedAt = Date.now();
  const kit = await kitService.assemble(db, HARNESS_UID, result.routeId, stop.id);
  console.log(`  kit assembled in ${((Date.now() - kitStartedAt) / 1000).toFixed(1)}s — id ${kit.id}`);

  printTimeline(kit);

  console.log(`\n${'='.repeat(78)}\nDOCUMENTS (${kit.documents.length})\n${'='.repeat(78)}`);

  for (const doc of kit.documents) {
    console.log(`  [${doc.required ? 'required' : 'optional'}] ${doc.label}${doc.formUrl ? ` — ${doc.formUrl}` : ''}`);

    if (doc.note) {
      console.log(`      note: ${doc.note}`);
    }
  }

  console.log(`\n${'='.repeat(78)}\nPORTALS & SUBMISSION MECHANICS\n${'='.repeat(78)}`);

  for (const portal of kit.portals) {
    console.log(`  portal: ${portal.name}${portal.url ? ` (${portal.url})` : ''}`);
  }

  for (const mechanic of kit.submissionMechanics) {
    console.log(`  ${mechanic.label}: ${mechanic.detail}`);
  }

  console.log(`\n${'='.repeat(78)}\nNARRATIVE STARTERS\n${'='.repeat(78)}`);

  for (const narrative of kit.narratives) {
    console.log(`  [${narrative.section}] ${narrative.heading}`);
    console.log(`      ${narrative.draft.substring(0, 140)}${narrative.draft.length > 140 ? '…' : ''}`);
  }

  // TODO(Task 4): write /tmp/sf424-case<N>.pdf once SF424Helper exists

  const updatedRouteSnapshot = await db.collection('routes').doc(result.routeId).get();
  const updatedRoute = updatedRouteSnapshot.data() as IRoute | undefined;
  const updatedStop = (updatedRoute?.stops ?? []).find(candidate => candidate.id === stop.id);
  const kitTaskCount = (updatedStop?.tasks ?? []).filter(task => task.source === 'kit').length;

  console.log(`\ntasks on route.stops[].tasks for this stop: ${updatedStop?.tasks.length ?? 0} total, ${kitTaskCount} kit-sourced`);
}

main().catch(error => {
  console.error('Harness failed:', error);
  process.exit(1);
});
