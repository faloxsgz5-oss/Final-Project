// Loader setup for the sign-up profile test (USER-001 / USER-002). The same
// stand-ins as the timetable save test, plus placeholder public Firebase config
// so `registerWithEmail` takes the real (non-demo) path; the stubbed
// `@/lib/firebase` points that path at the local emulators.
import {register} from 'node:module';

process.env.TZ = 'Asia/Bangkok';
for (const [key, value] of Object.entries({
  EXPO_PUBLIC_FIREBASE_API_KEY: 'emulator-api-key',
  EXPO_PUBLIC_FIREBASE_APP_ID: '1:0:web:emulator',
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: 'localhost',
  EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '0',
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'smartlife-budget',
  EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: 'smartlife-budget.appspot.com',
})) process.env[key] ??= value;

register('./ts-alias-loader.mjs', import.meta.url);
register('./scan-save-stub-loader.mjs', import.meta.url);
register('./signup-slow-auth-loader.mjs', import.meta.url);
register('./tsx-transform-loader.mjs', import.meta.url);
