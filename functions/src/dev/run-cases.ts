import * as fs from 'fs';
import * as path from 'path';
import { AdminHelper } from './admin.helper';
import { SecretsHelper } from './secrets.helper';
import { CASE_DESCRIPTIONS, CASE_LABELS, HARNESS_UID } from './cases.fixture';
import { CASE_EXPECTATIONS, ICaseExpectation, IProgramExpectation } from './cases.expectations';
import { IRoute, IStop } from '../firestore';
import { IPipelineDrop } from '../route/route.interfaces';

const INTAKE_COMPONENT = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'app',
  'src',
  'app',
  'features',
  'intake',
  'intake.component.ts'
);

interface IFailure {
  caseNumber: number;
  message: string;
}

function assertNoDrift(): void {
  if (!fs.existsSync(INTAKE_COMPONENT)) {
    console.log('  ! intake.component.ts not found — skipping case-string drift check');

    return;
  }

  const source = fs.readFileSync(INTAKE_COMPONENT, 'utf8');
  const missing = CASE_DESCRIPTIONS.filter(description => !source.includes(description));

  if (missing.length > 0) {
    console.log(
      `  ! DRIFT: ${missing.length} harness case string(s) no longer appear in intake.component.ts.`
    );
    console.log('    We would be testing something the UI cannot submit. Re-sync the strings.');
    process.exitCode = 1;

    return;
  }

  console.log('  ✓ case strings match the UI verbatim');
}

function findStop(stops: IStop[], expectation: IProgramExpectation): IStop | undefined {
  return stops.find(stop =>
    expectation.titleContains.some(needle => stop.title.toLowerCase().includes(needle))
  );
}

function checkCase(route: IRoute, expectation: ICaseExpectation): IFailure[] {
  const failures: IFailure[] = [];
  const stops = route.stops ?? [];
  const nonGrant = route.nonGrantAlternatives ?? [];
  const everywhere = [...stops, ...(route.offRoute ?? []), ...nonGrant];

  if (expectation.abstain && stops.length !== 0) {
    failures.push({
      caseNumber: expectation.caseNumber,
      message: `expected abstention (stops: []) but got ${stops.length} stops: ${stops
        .map(stop => stop.title)
        .join('; ')}`,
    });
  }

  if (stops.length < expectation.minStops) {
    failures.push({
      caseNumber: expectation.caseNumber,
      message: `expected at least ${expectation.minStops} stops, got ${stops.length}`,
    });
  }

  if (expectation.maxStops !== undefined && stops.length > expectation.maxStops) {
    failures.push({
      caseNumber: expectation.caseNumber,
      message: `expected at most ${expectation.maxStops} stops, got ${stops.length}`,
    });
  }

  if (nonGrant.length < expectation.minNonGrantAlternatives) {
    failures.push({
      caseNumber: expectation.caseNumber,
      message: `expected at least ${expectation.minNonGrantAlternatives} non-grant alternatives, got ${nonGrant.length}`,
    });
  }

  if (expectation.verdictPattern && !expectation.verdictPattern.test(route.verdictLine)) {
    failures.push({
      caseNumber: expectation.caseNumber,
      message: `verdict line did not match ${expectation.verdictPattern}: "${route.verdictLine}"`,
    });
  }

  if (expectation.requireStackingNote && !route.stackingNote) {
    failures.push({
      caseNumber: expectation.caseNumber,
      message: 'expected a stacking note (no single award covers the ask) but none was produced',
    });
  }

  for (const program of expectation.programs) {
    const stop = findStop(everywhere, program);

    if (!stop) {
      if (program.required) {
        failures.push({
          caseNumber: expectation.caseNumber,
          message: `required program missing from route: ${program.label}`,
        });
      }

      continue;
    }

    if (program.expectedTier && stop.fitTier !== program.expectedTier) {
      failures.push({
        caseNumber: expectation.caseNumber,
        message: `${program.label}: expected tier ${program.expectedTier}, got ${stop.fitTier}`,
      });
    }

    if (program.expectedFlagCode) {
      const flag = (stop.eligibilityFlags ?? []).find(
        entry => entry.code === program.expectedFlagCode
      );

      if (!flag) {
        failures.push({
          caseNumber: expectation.caseNumber,
          message: `${program.label}: expected flag ${program.expectedFlagCode}, flags were [${(
            stop.eligibilityFlags ?? []
          )
            .map(entry => entry.code)
            .join(', ')}]`,
        });
      } else if (program.expectedFlagSeverity && flag.severity !== program.expectedFlagSeverity) {
        failures.push({
          caseNumber: expectation.caseNumber,
          message: `${program.label}: flag ${flag.code} severity expected ${program.expectedFlagSeverity}, got ${flag.severity}`,
        });
      }
    }
  }

  for (const stop of everywhere) {
    if (!Array.isArray(stop.eligibilityFlags) || !Array.isArray(stop.tasks)) {
      failures.push({
        caseNumber: expectation.caseNumber,
        message: `stop "${stop.title}" has non-array eligibilityFlags/tasks — the UI template will throw`,
      });
    }

    if (stop.historicalProof) {
      const proof = stop.historicalProof;
      const complete =
        typeof proof.medianAward === 'number' &&
        typeof proof.countUtah === 'number' &&
        typeof proof.countVertical === 'number' &&
        typeof proof.countTotal === 'number' &&
        Array.isArray(proof.namedWinners);

      if (!complete) {
        failures.push({
          caseNumber: expectation.caseNumber,
          message: `stop "${stop.title}" has a partial historicalProof — the UI dereferences it with !`,
        });
      }
    }
  }

  const primaryMonths = new Set(
    stops.filter(stop => stop.placement === 'primary').map(stop => stop.sequenceMonth)
  );

  for (const stop of stops) {
    if (
      stop.placement === 'alongside' &&
      stop.sequenceMonth !== undefined &&
      !primaryMonths.has(stop.sequenceMonth)
    ) {
      failures.push({
        caseNumber: expectation.caseNumber,
        message: `alongside stop "${stop.title}" has sequenceMonth ${stop.sequenceMonth} matching no primary — it would render nowhere`,
      });
    }
  }

  return failures;
}

function describeRoute(route: IRoute, drops: IPipelineDrop[], showStage: string | null): void {
  console.log(`  verdict: ${route.verdictLine}`);

  if (route.stackingNote) {
    console.log(`  stacking: ${route.stackingNote}`);
  }

  const render = (label: string, stops: IStop[]): void => {
    if (stops.length === 0) {
      return;
    }

    console.log(`  ${label} (${stops.length}):`);

    for (const stop of stops) {
      const flags = (stop.eligibilityFlags ?? []).map(flag => `${flag.code}:${flag.severity}`);
      const month = stop.sequenceMonth === undefined ? '' : ` m${stop.sequenceMonth}`;
      console.log(
        `    [${stop.fitTier}]${month} ${stop.title.substring(0, 62)} — ${stop.agency.substring(0, 32)}`
      );

      if (flags.length > 0) {
        console.log(`        flags: ${flags.join(', ')}`);
      }

      if (stop.whyFit) {
        console.log(`        why: ${stop.whyFit.split(/(?<=\.)\s/)[0]}`);
      }
    }
  };

  render('stops', route.stops ?? []);
  render('non-grant alternatives', route.nonGrantAlternatives ?? []);
  render('off-route (ruled out)', route.offRoute ?? []);

  if (route.utahResources && route.utahResources.length > 0) {
    console.log(`  utah resources (${route.utahResources.length}): ${route.utahResources.map(resource => resource.title).join(', ')}`);
  }

  if (showStage) {
    const staged = drops.filter(drop => drop.stage === showStage);
    console.log(`  drops at stage "${showStage}" (${staged.length}):`);

    for (const drop of staged.slice(0, 25)) {
      console.log(`    ${drop.sourceId} ${drop.title.substring(0, 50)} — ${drop.reason}`);
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const caseArgIndex = args.indexOf('--case');
  const stageArgIndex = args.indexOf('--stage');
  const onlyCase = caseArgIndex >= 0 ? Number(args[caseArgIndex + 1]) : null;
  const showStage = stageArgIndex >= 0 ? args[stageArgIndex + 1] : null;

  if (!process.env['FUNDPATH_LLM_CACHE']) {
    process.env['FUNDPATH_LLM_CACHE'] = '1';
  }

  console.log('FundPath 5-case harness');
  console.log(`  project: ${AdminHelper.getProjectId()} (production database)`);
  console.log(`  uid: ${HARNESS_UID}`);
  console.log(`  llm cache: ${process.env['FUNDPATH_LLM_CACHE'] === '1' ? 'on' : 'off'}`);
  assertNoDrift();

  await SecretsHelper.loadAnthropicKey();

  const db = AdminHelper.getDb();
  const { RouteBuilderService } = await import('../route/route-builder.service');
  const builder = new RouteBuilderService();

  const allFailures: IFailure[] = [];

  for (let index = 0; index < CASE_DESCRIPTIONS.length; index++) {
    const expectation = CASE_EXPECTATIONS[index];

    if (onlyCase !== null && expectation.caseNumber !== onlyCase) {
      continue;
    }

    console.log(`\n${'='.repeat(78)}\n${CASE_LABELS[index]}\n${'='.repeat(78)}`);

    const startedAt = Date.now();

    try {
      const result = await builder.build(db, HARNESS_UID, CASE_DESCRIPTIONS[index]);
      console.log(`  built in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
      describeRoute(result.route, result.drops, showStage);

      const failures = checkCase(result.route, expectation);
      allFailures.push(...failures);

      if (failures.length === 0) {
        console.log('  ✅ PASS');
      } else {
        console.log('  ❌ FAIL');

        for (const failure of failures) {
          console.log(`     - ${failure.message}`);
        }
      }
    } catch (err) {
      console.log(`  ❌ THREW: ${(err as Error).message}`);
      allFailures.push({ caseNumber: expectation.caseNumber, message: (err as Error).message });
    }
  }

  console.log(`\n${'='.repeat(78)}`);

  if (allFailures.length === 0) {
    console.log('ALL CASES GREEN');
  } else {
    console.log(`${allFailures.length} failure(s):`);

    for (const failure of allFailures) {
      console.log(`  Case ${failure.caseNumber}: ${failure.message}`);
    }

    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error('Harness failed:', error);
  process.exit(1);
});
