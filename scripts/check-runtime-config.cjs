const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(file) {
  try {
    return fs.readFileSync(path.join(root, file), 'utf8');
  } catch {
    return '';
  }
}

function readJson(file) {
  try {
    return JSON.parse(read(file));
  } catch {
    return null;
  }
}

function loadEnv() {
  const env = {};
  for (const file of ['.env', '.env.local']) {
    for (const line of read(file).split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      env[match[1]] = match[2].replace(/^['"]|['"]$/g, '').trim();
    }
  }
  return env;
}

function ok(message) {
  console.log(`[ok]   ${message}`);
}

function warn(message) {
  console.log(`[warn] ${message}`);
}

function fail(message) {
  console.log(`[fail] ${message}`);
  failures += 1;
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

let failures = 0;
const env = loadEnv();

console.log('SmartLife runtime configuration');
console.log('');

const firebaseVars = [
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
];

for (const name of firebaseVars) {
  if (env[name]) ok(`${name} is set`);
  else fail(`${name} is missing`);
}

if (env.EXPO_PUBLIC_SMARTLIFE_DEMO === '1') {
  fail('EXPO_PUBLIC_SMARTLIFE_DEMO=1 forces demo mode');
} else {
  ok('demo mode is not forced');
}

const firebaseProjectId = env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
const firebaserc = readJson('.firebaserc');
if (firebaseProjectId && firebaserc?.projects?.default === firebaseProjectId) {
  ok(`.firebaserc default project matches ${firebaseProjectId}`);
} else if (firebaseProjectId) {
  warn(`.firebaserc default project does not match ${firebaseProjectId}`);
}

const firebaseJson = readJson('firebase.json');
if (firebaseJson?.firestore?.rules && exists(firebaseJson.firestore.rules)) ok('Firestore rules file is present');
else fail('Firestore rules are not configured');
if (firebaseJson?.storage?.rules && exists(firebaseJson.storage.rules)) ok('Storage rules file is present');
else fail('Storage rules are not configured');
if (firebaseJson?.functions?.source && exists(path.join(firebaseJson.functions.source, 'package.json'))) ok('Cloud Functions source is present');
else warn('Cloud Functions source is missing');

const googleVars = [
  'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
  'EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID',
  'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID',
];
for (const name of googleVars) {
  if (env[name]) ok(`${name} is set`);
  else warn(`${name} is missing; Google login/calendar will not be fully usable`);
}

if (env.EXPO_PUBLIC_FACEBOOK_APP_ID) ok('EXPO_PUBLIC_FACEBOOK_APP_ID is set');
else warn('EXPO_PUBLIC_FACEBOOK_APP_ID is missing; Facebook login will not be usable');

const localProperties = read('android/local.properties');
if (/sdk\.dir\s*=/.test(localProperties)) ok('Android SDK path is configured for local builds');
else warn('android/local.properties has no sdk.dir');

const appJson = readJson('app.json');
if (appJson?.expo?.android?.package === 'com.smartlife.student') ok('Android package is com.smartlife.student');
else warn('Android package was not found in app.json');

console.log('');
if (failures > 0) {
  console.log(`${failures} required item(s) need attention.`);
  process.exit(1);
}

console.log('Core Firebase runtime config is ready.');
