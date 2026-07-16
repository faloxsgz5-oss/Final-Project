const firebaseConfigValues = [
  process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
];

export const hasFirebaseConfig = firebaseConfigValues.every(Boolean);
export const isDemoMode = process.env.EXPO_PUBLIC_SMARTLIFE_DEMO === '1' || !hasFirebaseConfig;
export const demoUid = 'demo-user';
