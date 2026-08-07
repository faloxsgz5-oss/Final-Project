import {NativeModules, Platform} from 'react-native';
import {
  type AppCheck,
  CustomProvider,
  getToken as getWebAppCheckToken,
  initializeAppCheck as initializeWebAppCheck,
} from 'firebase/app-check';

import {isDemoMode} from '@/lib/demo-mode';
import {firebaseApp} from '@/lib/firebase';

const APP_CHECK_TOKEN_LIFETIME_MS = 50 * 60 * 1000;
const APP_CHECK_RETRY_DELAY_MS = 60 * 1000;

type SmartLifeAppCheckRuntime = {
  nativeAppCheckInstance: unknown | null;
  readyPromise: Promise<void> | null;
  retryAfterMs: number;
  webAppCheckInstance: AppCheck | null;
};

const appCheckGlobal = globalThis as typeof globalThis & {
  __smartLifeAppCheckRuntime?: SmartLifeAppCheckRuntime;
};

const appCheckRuntime = appCheckGlobal.__smartLifeAppCheckRuntime ?? {
  nativeAppCheckInstance: null,
  readyPromise: null,
  retryAfterMs: 0,
  webAppCheckInstance: null,
};

appCheckGlobal.__smartLifeAppCheckRuntime = appCheckRuntime;

export class AppCheckUnavailableError extends Error {
  readonly code = 'app-check/native-module-missing';

  constructor() {
    super('Firebase App Check native module is missing. Rebuild and reinstall the Android app.');
    this.name = 'AppCheckUnavailableError';
  }
}

export class AppCheckDebugTokenMissingError extends Error {
  readonly code = 'app-check/debug-token-missing';

  constructor() {
    super('Firebase App Check debug token is missing from the local Development Build configuration.');
    this.name = 'AppCheckDebugTokenMissingError';
  }
}

export class AppCheckTemporarilyUnavailableError extends Error {
  readonly code = 'app-check/retry-later';

  constructor(readonly retryAfterSeconds: number) {
    super(`Firebase App Check is cooling down. Retry in ${retryAfterSeconds} seconds.`);
    this.name = 'AppCheckTemporarilyUnavailableError';
  }
}

function appCheckErrorText(error: unknown) {
  if (error && typeof error === 'object') {
    const candidate = error as {code?: unknown; message?: unknown};
    return `${String(candidate.code ?? '')} ${String(candidate.message ?? '')}`.trim();
  }
  return String(error ?? '');
}

export function isAppCheckError(error: unknown) {
  if (error instanceof AppCheckUnavailableError || error instanceof AppCheckDebugTokenMissingError || error instanceof AppCheckTemporarilyUnavailableError) return true;
  return /(app.?check|token-error|too many attempts|play integrity|debug token)/i.test(appCheckErrorText(error));
}

export function appCheckErrorMessage(error: unknown) {
  if (error instanceof AppCheckUnavailableError) return 'Development Build ตัวนี้ยังไม่มี Firebase App Check กรุณาติดตั้งบิลด์ล่าสุดแล้วเปิดแอปใหม่';
  if (error instanceof AppCheckDebugTokenMissingError) return 'Development Build ยังไม่ได้ตั้งค่า App Check สำหรับเครื่องนี้ กรุณาปิดและเปิดแอปใหม่หลังซิงก์ค่าล่าสุด';
  if (error instanceof AppCheckTemporarilyUnavailableError) return `ระบบยืนยันแอปกำลังพักการขอโทเคน กรุณารอประมาณ ${error.retryAfterSeconds} วินาทีแล้วลองใหม่`;
  if (/too many attempts|token-error/i.test(appCheckErrorText(error))) return 'ระบบยืนยันแอปถูกจำกัดชั่วคราวจากการขอโทเคนซ้ำ กรุณารอสักครู่แล้วลองใหม่';
  return 'ยังยืนยัน Development Build กับ Firebase ไม่สำเร็จ กรุณาปิดและเปิดแอปใหม่แล้วลองอีกครั้ง';
}

async function initializeAndroidAppCheck() {
  const [
    {getApp: getNativeApp},
    {
      ReactNativeFirebaseAppCheckProvider,
      getToken: getNativeToken,
      initializeAppCheck: initializeNativeAppCheck,
    },
  ] = await Promise.all([
    import('@react-native-firebase/app'),
    import('@react-native-firebase/app-check'),
  ]);

  if (!appCheckRuntime.nativeAppCheckInstance) {
    const debugToken = process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN?.trim();
    // A Development Build uses a registered explicit token so Fast Refresh or
    // reinstalling an emulator does not generate unregistered tokens and
    // trigger Firebase's request throttle. Release builds always use Play
    // Integrity even if a local environment variable exists.
    if (__DEV__ && !debugToken) throw new AppCheckDebugTokenMissingError();
    const useDebugProvider = __DEV__;
    const nativeProvider = new ReactNativeFirebaseAppCheckProvider();
    nativeProvider.configure({
      android: useDebugProvider
        ? {debugToken, provider: 'debug'}
        : {provider: 'playIntegrity'},
    });

    appCheckRuntime.nativeAppCheckInstance = await initializeNativeAppCheck(getNativeApp(), {
      // The JS bridge explicitly fetches a cached token before every protected
      // callable. Leaving both the native and web refresh loops enabled makes
      // development failures retry in parallel and can trigger Firebase's
      // "Too many attempts" throttle.
      isTokenAutoRefreshEnabled: false,
      provider: nativeProvider,
    });
  }

  const nativeAppCheck = appCheckRuntime.nativeAppCheckInstance as Awaited<ReturnType<typeof initializeNativeAppCheck>>;

  if (!appCheckRuntime.webAppCheckInstance) {
    const webProvider = new CustomProvider({
      getToken: async () => {
        const {token} = await getNativeToken(nativeAppCheck, false);
        if (!token) throw new Error('Firebase App Check did not return a token.');
        return {
          expireTimeMillis: Date.now() + APP_CHECK_TOKEN_LIFETIME_MS,
          token,
        };
      },
    });

    appCheckRuntime.webAppCheckInstance = initializeWebAppCheck(firebaseApp, {
      isTokenAutoRefreshEnabled: false,
      provider: webProvider,
    });
  }

  // initializeAppCheck() only registers the provider. Fetch once before the
  // callable request so the Functions SDK cannot race ahead without the token.
  const {token} = await getWebAppCheckToken(appCheckRuntime.webAppCheckInstance, false);
  if (!token) throw new Error('Firebase App Check did not return a bridged token.');
}

export function ensureAppCheckReady() {
  if (isDemoMode || Platform.OS !== 'android') {
    return Promise.resolve();
  }

  // An old development client cannot obtain a valid Play Integrity token.
  // Report the exact cause so the assistant does not disguise it as a Gemini
  // or connectivity failure.
  if (!NativeModules.RNFBAppModule) {
    return Promise.reject(new AppCheckUnavailableError());
  }

  if (Date.now() < appCheckRuntime.retryAfterMs) {
    return Promise.reject(new AppCheckTemporarilyUnavailableError(
      Math.max(1, Math.ceil((appCheckRuntime.retryAfterMs - Date.now()) / 1000)),
    ));
  }

  if (!appCheckRuntime.readyPromise) {
    appCheckRuntime.readyPromise = initializeAndroidAppCheck().then(() => {
      appCheckRuntime.retryAfterMs = 0;
    }).catch((error) => {
      // Do not hammer App Check after a throttled token request. The shared
      // promise also survives Fast Refresh so multiple screens cannot race to
      // initialize the native singleton more than once.
      appCheckRuntime.readyPromise = null;
      appCheckRuntime.retryAfterMs = Date.now() + (isAppCheckError(error) ? APP_CHECK_RETRY_DELAY_MS : 5_000);
      throw error;
    });
  }
  return appCheckRuntime.readyPromise;
}
