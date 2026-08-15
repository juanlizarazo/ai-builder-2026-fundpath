import { AdminHelper } from './admin.helper';
import { CASE_DESCRIPTIONS, CASE_LABELS } from './cases.fixture';

const PROJECT_ID = AdminHelper.getProjectId();
const CALLABLE_URL = `https://us-central1-${PROJECT_ID}.cloudfunctions.net/buildRoute`;
const IDENTITY_TOOLKIT_KEY = process.env['FIREBASE_WEB_API_KEY'] ?? '';

interface IAnonymousSignIn {
  idToken: string;
  localId: string;
}

async function signInAnonymously(): Promise<IAnonymousSignIn> {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${IDENTITY_TOOLKIT_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnSecureToken: true }),
    }
  );

  if (!response.ok) {
    throw new Error(`Anonymous sign-in failed: ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as IAnonymousSignIn;
}

async function main(): Promise<void> {
  if (!IDENTITY_TOOLKIT_KEY) {
    throw new Error('Set FIREBASE_WEB_API_KEY to the project web API key before running --live.');
  }

  const caseArgIndex = process.argv.indexOf('--case');
  const onlyCase = caseArgIndex >= 0 ? Number(process.argv[caseArgIndex + 1]) : null;

  const auth = await signInAnonymously();
  console.log(`Signed in anonymously as ${auth.localId}`);
  console.log(`Calling ${CALLABLE_URL}\n`);

  let failures = 0;

  for (let index = 0; index < CASE_DESCRIPTIONS.length; index++) {
    if (onlyCase !== null && index + 1 !== onlyCase) {
      continue;
    }

    const startedAt = Date.now();
    console.log(`${'='.repeat(70)}\n${CASE_LABELS[index]}\n${'='.repeat(70)}`);

    try {
      const response = await fetch(CALLABLE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.idToken}`,
        },
        body: JSON.stringify({ data: { description: CASE_DESCRIPTIONS[index] } }),
      });

      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      const body = await response.text();

      if (!response.ok) {
        console.log(`  ❌ HTTP ${response.status} in ${elapsed}s: ${body.substring(0, 400)}`);
        failures++;

        continue;
      }

      const parsed = JSON.parse(body) as {
        result: {
          routeId: string;
          route: {
            verdictLine: string;
            stops: { title: string; fitTier: string }[];
            nonGrantAlternatives?: unknown[];
            offRoute?: unknown[];
          };
        };
      };
      const route = parsed.result.route;

      console.log(`  ✅ ${elapsed}s · routeId=${parsed.result.routeId}`);
      console.log(`  verdict: ${route.verdictLine}`);
      console.log(
        `  stops=${route.stops.length} nonGrant=${route.nonGrantAlternatives?.length ?? 0} offRoute=${route.offRoute?.length ?? 0}`
      );

      for (const stop of route.stops.slice(0, 3)) {
        console.log(`    [${stop.fitTier}] ${stop.title.substring(0, 62)}`);
      }
    } catch (err) {
      console.log(`  ❌ THREW: ${(err as Error).message}`);
      failures++;
    }
  }

  console.log(`\n${'='.repeat(70)}`);

  if (failures === 0) {
    console.log('LIVE CALLABLE GREEN');
  } else {
    console.log(`${failures} live failure(s)`);
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error('Live harness failed:', error);
  process.exit(1);
});
