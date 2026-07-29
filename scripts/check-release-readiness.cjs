const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (file) => {
  try {
    return fs.readFileSync(path.join(root, file), 'utf8');
  } catch {
    return '';
  }
};
const json = (file) => {
  try {
    return JSON.parse(read(file));
  } catch {
    return null;
  }
};
const env = {};
for (const file of ['.env', '.env.local']) {
  for (const line of read(file).split(/\r?\n/)) {
    const match = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) env[match[1]] = match[2].replace(/^['"]|['"]$/g, '').trim();
  }
}

let failures = 0;
let warnings = 0;
const pass = (message) => console.log(`[ok]   ${message}`);
const warn = (message) => {
  warnings += 1;
  console.log(`[warn] ${message}`);
};
const fail = (message) => {
  failures += 1;
  console.log(`[fail] ${message}`);
};

const app = json('app.json');
const services = json('google-services.json');
const packageName = app?.expo?.android?.package;
const firebasePackage = services?.client?.[0]?.client_info?.android_client_info?.package_name;
const plugins = app?.expo?.plugins ?? [];
const functionSource = read('functions/src/index.ts');

console.log('SmartLife Android release readiness\n');
packageName === 'com.smartlife.student' ? pass(`Android package: ${packageName}`) : fail('Android package must be com.smartlife.student');
firebasePackage === packageName ? pass('google-services.json matches the Android package') : fail('google-services.json package does not match app.json');
plugins.includes('@react-native-firebase/app') ? pass('Native Firebase app plugin is enabled') : fail('Missing @react-native-firebase/app plugin');
plugins.includes('@react-native-firebase/app-check') ? pass('Native Firebase App Check plugin is enabled') : fail('Missing @react-native-firebase/app-check plugin');
/smartLifeAssistantReply[\s\S]*?enforceAppCheck:\s*true/.test(functionSource) ? pass('AI callable enforces App Check') : fail('AI callable does not enforce App Check');
fs.existsSync(path.join(root, 'scripts', 'thai-assistant-intents.json')) ? pass('Thai AI intent dataset is present') : fail('Thai AI intent dataset is missing');
fs.existsSync(path.join(root, 'google-services.json')) ? pass('Firebase Android configuration is present') : fail('google-services.json is missing');

const bundledGoogleWebClient = services?.client
  ?.flatMap((client) => client.oauth_client ?? [])
  ?.find((client) => client.client_type === 3)?.client_id;
if (env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || bundledGoogleWebClient) {
  pass('Google web client ID is configured');
} else {
  warn('Google Login needs EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in .env.local');
}
if (env.EXPO_PUBLIC_FACEBOOK_APP_ID) pass('Facebook app ID is configured');
else warn('Facebook Login needs EXPO_PUBLIC_FACEBOOK_APP_ID in .env.local');
if (read('android/local.properties').match(/sdk\.dir\s*=/)) pass('Local Android SDK path is configured');
else warn('android/local.properties needs sdk.dir before a local release build');

console.log('\nManual release-device checks (cannot be proven by source code):');
console.log('1. Build and install a release APK/AAB signed with the registered SHA-256 certificate.');
console.log('2. Test SmartLife AI on at least 2 real Android devices with App Check metrics open.');
console.log('3. Confirm assistantTelemetry and smartLifeAssistantReply succeed without debug tokens.');

console.log(`\nResult: ${failures} failure(s), ${warnings} warning(s).`);
if (failures) process.exitCode = 1;
