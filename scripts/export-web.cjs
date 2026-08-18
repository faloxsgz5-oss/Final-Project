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

const result = spawnSync(process.execPath, [expoCli, 'export', '--platform', 'web', '--output-dir', 'dist'], {
  cwd: projectRoot,
  env,
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
