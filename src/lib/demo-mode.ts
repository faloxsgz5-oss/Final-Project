const firebaseConfigValues = [
  process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
];

export function hasRealPublicConfigValue(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return Boolean(
    normalized &&
      !normalized.startsWith('your_') &&
      !normalized.includes('your_project') &&
      !normalized.includes('your_web_oauth_client_id') &&
      !normalized.includes('your_android_oauth_client_id') &&
      !normalized.includes('your_ios_oauth_client_id') &&
      !normalized.includes('your_facebook_app_id') &&
      !normalized.includes('from_firebase_console') &&
      !normalized.includes('demo-'),
  );
}

export const hasFirebaseConfig = firebaseConfigValues.every(hasRealPublicConfigValue);
export const isDemoMode =
  process.env.EXPO_PUBLIC_SMARTLIFE_DEMO === '1' ||
  process.env.EXPO_PUBLIC_SMARTLIFE_DEMO?.toLowerCase() === 'true';
export const demoUid = 'demo-user';
