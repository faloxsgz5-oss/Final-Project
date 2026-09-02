const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const expoCli = path.join(projectRoot, 'node_modules', 'expo', 'bin', 'cli');
const outputDir = path.join(projectRoot, 'dist');
if (path.dirname(outputDir) !== projectRoot || path.basename(outputDir) !== 'dist') {
  throw new Error('Refusing to clear an unexpected web output directory.');
}
fs.rmSync(outputDir, {force: true, recursive: true});
const env = {
  ...process.env,
  // This token belongs only to local Android Development Builds. Defining an
  // empty value prevents Expo's dotenv loader from embedding it in web assets.
  EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN: '',
};

// `--clear` is mandatory, not an optimisation to skip. Metro caches transformed
// modules, and `process.env.EXPO_PUBLIC_*` is inlined *during* that transform.
// A module cached from a run where the variable was absent keeps its baked-in
// `undefined` forever, so a stale cache silently ships a build with no Firebase
// config while the CLI still prints "env: load .env.local".
const result = spawnSync(
  process.execPath,
  [expoCli, 'export', '--platform', 'web', '--output-dir', 'dist', '--clear'],
  {cwd: projectRoot, env, stdio: 'inherit'},
);

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

verifyRuntimeConfigWasInlined();

/**
 * Fails the build when the exported bundle does not actually contain the
 * Firebase config, so a misconfigured export can never reach `firebase deploy`.
 */
function verifyRuntimeConfigWasInlined() {
  const required = [
    'EXPO_PUBLIC_FIREBASE_API_KEY',
    'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
    'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
    'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
    'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
    'EXPO_PUBLIC_FIREBASE_APP_ID',
  ];

  const envFile = path.join(projectRoot, '.env.local');
  if (!fs.existsSync(envFile)) {
    fail(['.env.local is missing, so the web build has no Firebase config to embed.']);
  }

  const values = Object.fromEntries(
    fs.readFileSync(envFile, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const [key, ...rest] = line.split('=');
        return [key.trim(), rest.join('=').trim().replace(/^['"]|['"]$/g, '')];
      }),
  );

  const bundleDir = path.join(outputDir, '_expo', 'static', 'js', 'web');
  if (!fs.existsSync(bundleDir)) fail([`No web bundle was produced at ${bundleDir}.`]);
  const bundles = fs.readdirSync(bundleDir).filter((name) => name.endsWith('.js'));
  if (!bundles.length) fail([`No .js bundle was produced in ${bundleDir}.`]);
  const source = bundles
    .map((name) => fs.readFileSync(path.join(bundleDir, name), 'utf8'))
    .join('\n');

  const problems = [];
  required.forEach((key) => {
    const value = values[key];
    if (!value) {
      problems.push(`${key} is missing or empty in .env.local`);
      return;
    }
    if (!source.includes(value)) {
      problems.push(`${key} was not inlined into the exported bundle (stale Metro cache?)`);
    }
  });

  if (problems.length) fail(problems);
  console.log(`\nRuntime config verified: all ${required.length} Firebase values are present in the web bundle.`);
}

function fail(problems) {
  console.error('\nWeb export aborted — the build would ship without a usable Firebase config:');
  problems.forEach((problem) => console.error(`  - ${problem}`));
  console.error('\nFix .env.local, then run this command again.');
  process.exit(1);
}
