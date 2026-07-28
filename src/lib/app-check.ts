import {NativeModules, Platform} from 'react-native';
import {CustomProvider, initializeAppCheck as initializeWebAppCheck} from 'firebase/app-check';

import {isDemoMode} from '@/lib/demo-mode';
import {firebaseApp} from '@/lib/firebase';

const APP_CHECK_TOKEN_LIFETIME_MS = 50 * 60 * 1000;

let appCheckReadyPromise: Promise<void> | null = null;

export class AppCheckUnavailableError extends Error {
  readonly code = 'app-check/native-module-missing';

  constructor() {
    super('Firebase App Check native module is missing. Rebuild and reinstall the Android app.');
    this.name = 'AppCheckUnavailableError';
  }
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

  const debugToken = process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN?.trim();
  const nativeProvider = new ReactNativeFirebaseAppCheckProvider();
  nativeProvider.configure({
    android: debugToken
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
      if (!token) {
        throw new Error('Firebase App Check did not return a token.');
      }
      return {
        expireTimeMillis: Date.now() + APP_CHECK_TOKEN_LIFETIME_MS,
        token,
      };
    },
  });

  initializeWebAppCheck(firebaseApp, {
    isTokenAutoRefreshEnabled: true,
    provider: webProvider,
  });
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
    appCheckReadyPromise = initializeAndroidAppCheck();
  }
  return appCheckReadyPromise;
}
