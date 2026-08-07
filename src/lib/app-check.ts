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

let appCheckReadyPromise: Promise<void> | null = null;
let webAppCheckInstance: AppCheck | null = null;

export class AppCheckUnavailableError extends Error {
  readonly code = 'app-check/native-module-missing';

  constructor() {
    super('Firebase App Check native module is missing. Rebuild and reinstall the Android app.');
    this.name = 'AppCheckUnavailableError';
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
  if (error instanceof AppCheckUnavailableError) return true;
  return /(app.?check|token-error|too many attempts|play integrity|debug token)/i.test(appCheckErrorText(error));
}

export function appCheckErrorMessage(error: unknown) {
  if (error instanceof AppCheckUnavailableError) {
    return 'Development Build ตัวนี้ยังไม่มี Firebase App Check กรุณาติดตั้งบิลด์ล่าสุดแล้วเปิดแอปใหม่';
  }
  if (/too many attempts|token-error/i.test(appCheckErrorText(error))) {
    return 'ระบบยืนยันแอปถูกจำกัดชั่วคราวจากการขอโทเคนซ้ำ กรุณารอสักครู่แล้วลองใหม่';
  }
  return 'ยังยืนยัน Development Build กับ Firebase ไม่สำเร็จ กรุณาปิดและเปิดแอปใหม่แล้วลองอีกครั้ง';
}

async function initializeAndroidAppCheck() {
  if (!webAppCheckInstance) {
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

    const debugToken = process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN?.trim();
    // Android emulators and locally installed development clients cannot pass
    // Play Integrity. Use Firebase's debug provider only in development; a
    // release build always keeps Play Integrity enabled.
    const useDebugProvider = __DEV__ || Boolean(debugToken);
    const nativeProvider = new ReactNativeFirebaseAppCheckProvider();
    nativeProvider.configure({
      android: useDebugProvider
        ? {debugToken, provider: 'debug'}
        : {provider: 'playIntegrity'},
    });

    const nativeAppCheck = await initializeNativeAppCheck(getNativeApp(), {
      isTokenAutoRefreshEnabled: true,
      provider: nativeProvider,
    });

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

    webAppCheckInstance = initializeWebAppCheck(firebaseApp, {
      isTokenAutoRefreshEnabled: true,
      provider: webProvider,
    });
  }

  // initializeAppCheck() only registers the provider. Fetch once before the
  // callable request so the Functions SDK cannot race ahead without the token.
  const {token} = await getWebAppCheckToken(webAppCheckInstance, false);
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

  if (!appCheckReadyPromise) {
    appCheckReadyPromise = initializeAndroidAppCheck().catch((error) => {
      // A throttled or transient Play Integrity failure must be retryable on
      // the next user request instead of poisoning the app for the session.
      appCheckReadyPromise = null;
      throw error;
    });
  }
  return appCheckReadyPromise;
}
