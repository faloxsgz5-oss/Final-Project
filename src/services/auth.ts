import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createUserWithEmailAndPassword,
  FacebookAuthProvider,
  fetchSignInMethodsForEmail,
  getIdTokenResult,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  User,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { Platform } from 'react-native';

import {demoUid, hasFirebaseConfig, hasRealPublicConfigValue, isDemoMode} from '@/lib/demo-mode';
import { auth, db } from '@/lib/firebase';
import {isExpoGo} from '@/lib/expo-runtime';
import {EXISTING_ACCOUNT_FALLBACK, existingAccountMessage, isNetworkFailure, SOCIAL_NETWORK_MESSAGE} from '@/services/auth-messages';
import {FacebookLoginCancelledError, getFacebookAccessToken, isFacebookSdkConfigured, signOutFacebook} from '@/services/facebook-native';
import { clearGoogleCalendarSession } from '@/services/google-calendar';

export type AppRole = 'user' | 'admin';

type RegisterInput = {
  displayName: string;
  email: string;
  password: string;
};

const demoUser = {
  displayName: 'SmartLife Demo',
  email: 'demo@smartlife.local',
  uid: demoUid,
} as User;

// OAuth client IDs are public identifiers. This Firebase project's web OAuth
// client is kept as a safe fallback so native Google Sign-In remains usable
// when a teammate has not copied the optional value into .env.local yet.
const FIREBASE_GOOGLE_WEB_CLIENT_ID = '302211453614-ui2mf0hqknu0itr8r4g76g1odrfhc6fe.apps.googleusercontent.com';

function requireFirebaseConfig() {
  if (!hasFirebaseConfig) {
    throw new Error('ยังไม่ได้ตั้งค่า Firebase ของโปรเจกต์จริงครับ กรุณาใส่ค่า Firebase config ของ smartlife-budget ในไฟล์ .env.local แล้ว restart แอป');
  }
}

function googleWebClientId() {
  const configured = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
  return hasRealPublicConfigValue(configured) ? configured : FIREBASE_GOOGLE_WEB_CLIENT_ID;
}

/**
 * The longest display name the `users/{uid}` rule accepts. The rule's
 * `size()` counts UTF-16 code units, exactly like JavaScript's `length`: an
 * emoji outside the basic plane counts as 2, each Thai vowel or tone mark as 1.
 */
export const DISPLAY_NAME_MAX_LENGTH = 80;

/** Why a display name cannot be used, in Thai, or null when it is fine. */
export function displayNameProblem(raw: string) {
  const name = raw.trim();
  if (!name) return 'กรุณากรอกชื่อ - นามสกุล';
  if (name.length > DISPLAY_NAME_MAX_LENGTH) {
    return `ชื่อยาวเกิน ${DISPLAY_NAME_MAX_LENGTH} ตัวอักษร (ตอนนี้ ${name.length}; อีโมจิ 1 ตัวนับเป็น 2) กรุณาย่อชื่อลง`;
  }
  return null;
}

/**
 * The account exists, but its `users/{uid}` profile could not be written even
 * after retrying. Nothing is rolled back: the account is kept, the app offers a
 * retry, and the next sign-in creates the missing profile on its own.
 */
export class ProfileSetupError extends Error {
  constructor(readonly reason: unknown) {
    super('สร้างบัญชีแล้ว แต่บันทึกข้อมูลโปรไฟล์ไม่สำเร็จ บัญชีของคุณยังอยู่ครบ กรุณาตรวจสอบอินเทอร์เน็ตแล้วกด "ลองใหม่"');
    this.name = 'ProfileSetupError';
  }
}

/**
 * The name the person typed while their account is being created. The token
 * listener in `AuthProvider` runs as soon as the account exists -- before
 * `registerWithEmail` gets to its own write -- so the shared profile creation
 * below reads the typed name from here rather than from Auth, which may not
 * have it yet.
 */
let registeringName: {email: string; name: string} | null = null;

export async function registerWithEmail({ displayName, email, password }: RegisterInput) {
  // Checked before the account exists: a name the profile rule would refuse
  // used to create the account first and then delete it (USER-002).
  const problem = displayNameProblem(displayName);
  if (problem) throw new Error(problem);
  const name = displayName.trim();
  if (isDemoMode) return {...demoUser, displayName: name, email} as User;
  requireFirebaseConfig();

  registeringName = {email: email.trim().toLowerCase(), name};
  try {
    const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
    // Auth's own copy of the name is cosmetic -- every screen reads the profile
    // document -- so a failure here must not cost the account.
    await updateProfile(credential.user, {displayName: name}).catch((error) => {
      console.warn('[Auth] Could not copy the display name into Firebase Auth', error);
    });
    // Shares the listener's in-flight creation when it got there first, so the
    // two never write over each other. It never deletes the account (USER-001).
    await ensureUserProfile(credential.user, name);
    return credential.user;
  } finally {
    registeringName = null;
  }
}

export async function signInWithEmail(email: string, password: string) {
  if (isDemoMode) return {...demoUser, email} as User;
  requireFirebaseConfig();
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  return credential.user;
}

function logGoogleLoginConfiguration() {
  if (!__DEV__) return;
  const webClientId = googleWebClientId();
  const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID?.trim();
  console.info('[Google Login] OAuth environment', {
    androidClientIdLoaded: hasRealPublicConfigValue(androidClientId),
    platform: Platform.OS,
    webClientIdLoaded: Boolean(webClientId),
    webClientProject: webClientId?.split('-')[0] ?? '<missing>',
  });
}

async function createSocialUserProfile(user: User) {
  await ensureUserProfile(user);
}

/** Attempts and backoff for writing a missing profile (USER-001). */
export const PROFILE_WRITE_ATTEMPTS = 4;
const PROFILE_WRITE_BACKOFF_MS = 400;

/** Clamps a name from Auth or a social provider to what the rule accepts. */
function profileName(user: User, preferred?: string) {
  const fromRegistration = registeringName && user.email?.toLowerCase() === registeringName.email ? registeringName.name : '';
  const candidate = (preferred || fromRegistration || user.displayName || user.email?.split('@')[0] || '').trim();
  // A Google or Facebook name past the limit is shortened, not rejected: the
  // person never typed it, so there is nothing for them to correct.
  const clamped = candidate.length > DISPLAY_NAME_MAX_LENGTH ? Array.from(candidate).reduce((kept, char) => (kept + char).length <= DISPLAY_NAME_MAX_LENGTH ? kept + char : kept, '') : candidate;
  return clamped || 'ผู้ใช้ SmartLife';
}

/**
 * Runs `attempt` until it reports success, waiting longer each time, and
 * throws `ProfileSetupError` once every attempt has failed. Exported so the
 * retry policy can be tested without a network.
 */
export async function withProfileRetry(attempt: () => Promise<void>, {attempts = PROFILE_WRITE_ATTEMPTS, backoffMs = PROFILE_WRITE_BACKOFF_MS, sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))} = {}) {
  let lastError: unknown = null;
  for (let index = 0; index < attempts; index += 1) {
    if (index) await sleep(backoffMs * 2 ** (index - 1));
    try {
      await attempt();
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw new ProfileSetupError(lastError);
}

/** One creation per account at a time, shared by every caller (USER-001). */
const profileCreations = new Map<string, Promise<void>>();

/**
 * Makes sure `users/{uid}` exists, creating it if it does not. This is the only
 * code that creates a profile: the token listener, sign-up, Google/Facebook
 * sign-in and the scan save path all come through here.
 *
 * - Single-flight: concurrent callers for the same account share one attempt,
 *   so the listener and `registerWithEmail` can no longer race each other into
 *   a rule rejection.
 * - Idempotent: every attempt re-reads first, so a document created by another
 *   device or an earlier attempt ends the work instead of being written over.
 * - Never destructive: on repeated failure it throws `ProfileSetupError` and
 *   leaves the account alone. An account that exists without a profile (for
 *   example one left behind by the old bug) is healed the next time it signs in.
 */
export function ensureUserProfile(user = auth.currentUser, preferredName?: string): Promise<void> {
  // Demo mode has no signed-in user and writes nothing to Firestore; every
  // save path in it stops at this check otherwise.
  if (isDemoMode) return Promise.resolve();
  if (!user) {
    return Promise.reject(new Error('กรุณาเข้าสู่ระบบก่อนบันทึกข้อมูล'));
  }
  const running = profileCreations.get(user.uid);
  if (running) return running;

  const reference = doc(db, 'users', user.uid);
  const creation = withProfileRetry(async () => {
    if ((await getDoc(reference)).exists()) return;
    // Exactly the keys and values the create rule accepts.
    await setDoc(reference, {
      uid: user.uid,
      email: user.email ?? '',
      displayName: profileName(user, preferredName),
      avatarUrl: user.photoURL?.startsWith('https://') && user.photoURL.length <= 2048 ? user.photoURL : '',
      consentHistory: [{changedAt: new Date(), method: 'onboarding', tier: 'manual_only'}],
      consentTier: 'manual_only',
      lineConsentUpdatedAt: serverTimestamp(),
      lineConsentVersion: 1,
      lineListenerStatus: 'not_applicable',
      role: 'user',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }).finally(() => {
    profileCreations.delete(user.uid);
  });
  profileCreations.set(user.uid, creation);
  return creation;
}

export async function signInWithGoogle() {
  if (isDemoMode) return demoUser;
  requireFirebaseConfig();
  logGoogleLoginConfiguration();
  let user: User;

  if (Platform.OS === 'web') {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({prompt: 'select_account'});
    user = (await signInWithPopup(auth, provider)).user;
  } else {
    if (isExpoGo()) {
      throw new Error('Google Login บนมือถือใช้ไม่ได้ใน Expo Go กรุณาเปิดด้วย SmartLife development build');
    }

    const webClientId = googleWebClientId();

    try {
      const {GoogleSignin, isSuccessResponse} = await import('@react-native-google-signin/google-signin');
      GoogleSignin.configure({offlineAccess: false, webClientId});
      await GoogleSignin.hasPlayServices({showPlayServicesUpdateDialog: true});
      let response = GoogleSignin.hasPreviousSignIn()
        ? await GoogleSignin.signInSilently()
        : await GoogleSignin.signIn();
      if (response.type === 'noSavedCredentialFound') response = await GoogleSignin.signIn();
      if (!isSuccessResponse(response)) throw new Error('ยกเลิกการเข้าสู่ระบบด้วย Google');
      if (!response.data.idToken) throw new Error('Google ไม่ได้ส่ง ID token กลับมา');

      const credential = GoogleAuthProvider.credential(response.data.idToken);
      user = (await signInWithCredential(auth, credential)).user;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/native module|null|TurboModule|RNGoogleSignin/i.test(message)) {
        throw new Error('Google Login ต้องเปิดด้วย SmartLife development build ไม่รองรับ Expo Go');
      }
      if (/DEVELOPER_ERROR|code.?10/i.test(message)) {
        throw new Error('ลายเซ็น APK ยังไม่ตรงกับ Firebase กรุณาติดตั้ง SmartLife APK รุ่นล่าสุด');
      }
      throw error;
    }
  }

  await createSocialUserProfile(user);
  return user;
}

export async function signInWithFacebook() {
  if (isDemoMode) return demoUser;
  requireFirebaseConfig();
  let user: User;

  if (Platform.OS === 'web') {
    const provider = new FacebookAuthProvider();
    provider.addScope('email');
    user = (await signInWithPopup(auth, provider)).user;
  } else {
    if (isExpoGo()) {
      throw new Error('Facebook Login ต้องเปิดด้วย SmartLife development build ไม่รองรับ Expo Go');
    }

    const appId = process.env.EXPO_PUBLIC_FACEBOOK_APP_ID?.trim();
    if (!appId) throw new Error('ยังไม่ได้ตั้งค่า EXPO_PUBLIC_FACEBOOK_APP_ID ใน .env.local');
    // The App ID alone is not enough: the SDK is only in builds that also had
    // the client token, and calling it elsewhere would fail natively.
    if (!isFacebookSdkConfigured()) throw new Error('ยังไม่ได้ตั้งค่า Facebook Login ใน build นี้ (ต้องมี EXPO_PUBLIC_FACEBOOK_APP_ID และ FACEBOOK_CLIENT_TOKEN)');

    let accessToken: string;
    try {
      accessToken = await getFacebookAccessToken();
    } catch (error) {
      if (error instanceof FacebookLoginCancelledError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      if (isNetworkFailure(undefined, message)) throw new Error(SOCIAL_NETWORK_MESSAGE);
      throw error;
    }

    const credential = FacebookAuthProvider.credential(accessToken);
    user = (await signInWithCredential(auth, credential)).user;
  }

  await createSocialUserProfile(user);
  return user;
}

/** True when the person closed the Facebook dialog or popup themselves. */
export function isFacebookLoginCancelled(error: unknown) {
  if (error instanceof FacebookLoginCancelledError) return true;
  const code = (error as {code?: string} | null)?.code;
  return code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request';
}

/**
 * The message for a failed Facebook sign-in that the generic auth messages do
 * not cover well, or `null` to fall back to them. For an email that already
 * signs in another way it names that way when Firebase still reports it.
 */
export async function facebookSignInErrorMessage(error: unknown): Promise<string | null> {
  const {code, customData} = (error ?? {}) as {code?: string; customData?: {email?: string}};
  if (code === 'auth/account-exists-with-different-credential') {
    const email = customData?.email;
    if (!email) return EXISTING_ACCOUNT_FALLBACK;
    try {
      return existingAccountMessage(await fetchSignInMethodsForEmail(auth, email));
    } catch {
      return EXISTING_ACCOUNT_FALLBACK;
    }
  }
  if (isNetworkFailure(code, error instanceof Error ? error.message : '')) return SOCIAL_NETWORK_MESSAGE;
  return null;
}

export async function sendResetEmail(email: string) {
  if (isDemoMode) return;
  requireFirebaseConfig();
  await sendPasswordResetEmail(auth, email.trim());
}

export async function signOutCurrentUser() {
  if (!isDemoMode && hasFirebaseConfig) await signOut(auth);
  await Promise.allSettled([
    AsyncStorage.removeItem('smartlife:last-ocr:receipt'),
    AsyncStorage.removeItem('smartlife:last-ocr:schedule'),
    clearGoogleCalendarSession(),
    signOutFacebook(),
  ]);
}

/**
 * The two profile fields the user can change after registering.
 *
 * Each one lives in two places: Firebase Auth, which is what `displayName` and
 * `photoURL` mean to the rest of the SDK, and the `users/{uid}` document, which
 * is what the screens actually read through `loadLegacyPageData`. Writing only
 * one of them leaves the app showing the old value, so both move together here
 * rather than at each call site.
 *
 * The Firestore rule for this document accepts a change to `displayName`,
 * `avatarUrl` and `updatedAt` and nothing else, and requires a name of 1-80
 * characters and an avatar that is empty or an https URL. Both are checked
 * before the write so a rejection surfaces as a readable message rather than a
 * bare permission error.
 */
export async function updateProfileDetails({avatarUrl, displayName, studentId}: {avatarUrl?: string; displayName?: string; studentId?: string}) {
  if (isDemoMode) return;
  requireFirebaseConfig();
  const user = auth.currentUser;
  if (!user) throw new Error('กรุณาเข้าสู่ระบบก่อนแก้ไขโปรไฟล์');

  const name = displayName?.trim();
  if (displayName !== undefined) {
    if (!name) throw new Error('กรุณากรอกชื่อที่แสดง');
    if (name.length > 80) throw new Error('ชื่อที่แสดงต้องยาวไม่เกิน 80 ตัวอักษร');
  }
  if (avatarUrl !== undefined && avatarUrl !== '' && !avatarUrl.startsWith('https://')) {
    throw new Error('ลิงก์รูปโปรไฟล์ไม่ถูกต้อง');
  }
  // Optional: an empty string is how it is cleared, so only the length is
  // checked. It is not a login identifier and nothing requires it.
  const student = studentId?.trim();
  if (student !== undefined && student.length > 32) throw new Error('รหัสนักศึกษาต้องยาวไม่เกิน 32 ตัวอักษร');

  // Firebase Auth has no field for a student ID -- it lives only on the users
  // document -- so a change to it alone skips the Auth round trip.
  if (name !== undefined || avatarUrl !== undefined) {
    await updateProfile(user, {
      ...(name === undefined ? {} : {displayName: name}),
      ...(avatarUrl === undefined ? {} : {photoURL: avatarUrl}),
    });
  }
  await updateDoc(doc(db, 'users', user.uid), {
    ...(name === undefined ? {} : {displayName: name}),
    ...(avatarUrl === undefined ? {} : {avatarUrl}),
    ...(student === undefined ? {} : {studentId: student}),
    updatedAt: serverTimestamp(),
  });
}

export async function getUserRole(user: User): Promise<AppRole> {
  if (isDemoMode) return 'user';
  requireFirebaseConfig();
  const token = await getIdTokenResult(user, true);
  return token.claims.admin === true ? 'admin' : 'user';
}
