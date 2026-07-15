import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createUserWithEmailAndPassword,
  deleteUser,
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
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Platform } from 'react-native';

import { auth, db } from '@/lib/firebase';
import {isExpoGo} from '@/lib/expo-runtime';
import { clearGoogleCalendarSession } from '@/services/google-calendar';

export type AppRole = 'user' | 'admin';

type RegisterInput = {
  displayName: string;
  email: string;
  password: string;
};

export async function registerWithEmail({ displayName, email, password }: RegisterInput) {
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);

  try {
    await updateProfile(credential.user, { displayName: displayName.trim() });
    await setDoc(doc(db, 'users', credential.user.uid), {
      uid: credential.user.uid,
      email: credential.user.email,
      displayName: displayName.trim(),
      avatarUrl: '',
      role: 'user',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    await deleteUser(credential.user);
    throw error;
  }

  return credential.user;
}

export async function signInWithEmail(email: string, password: string) {
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  return credential.user;
}

function logGoogleLoginConfiguration() {
  if (!__DEV__) return;
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
  const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID?.trim();
  console.info('[Google Login] OAuth environment', {
    androidClientIdLoaded: Boolean(androidClientId),
    platform: Platform.OS,
    webClientIdLoaded: Boolean(webClientId),
    webClientProject: webClientId?.split('-')[0] ?? '<missing>',
  });
}

async function createGoogleUserProfile(user: User) {
  const reference = doc(db, 'users', user.uid);
  if ((await getDoc(reference)).exists()) return;

  await setDoc(reference, {
    uid: user.uid,
    email: user.email ?? '',
    displayName: user.displayName?.trim() || user.email?.split('@')[0] || 'ผู้ใช้ SmartLife',
    avatarUrl: user.photoURL?.startsWith('https://') ? user.photoURL : '',
    role: 'user',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function signInWithGoogle() {
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

    const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
    if (!webClientId) throw new Error('ยังไม่ได้ตั้งค่า EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ใน .env.local');

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
      throw error;
    }
  }

  await createGoogleUserProfile(user);
  return user;
}

export async function sendResetEmail(email: string) {
  await sendPasswordResetEmail(auth, email.trim());
}

export async function signOutCurrentUser() {
  await signOut(auth);
  await Promise.allSettled([
    AsyncStorage.removeItem('smartlife:last-ocr:receipt'),
    AsyncStorage.removeItem('smartlife:last-ocr:schedule'),
    clearGoogleCalendarSession(),
  ]);
}

export async function getUserRole(user: User): Promise<AppRole> {
  const token = await getIdTokenResult(user, true);
  return token.claims.admin === true ? 'admin' : 'user';
}
