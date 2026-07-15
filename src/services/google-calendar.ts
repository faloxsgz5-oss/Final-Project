import {Platform} from 'react-native';
import {FirebaseError} from 'firebase/app';
import {
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import {GoogleAuthProvider, reauthenticateWithPopup} from 'firebase/auth';

import {isExpoGo} from '@/lib/expo-runtime';
import {auth, db} from '@/lib/firebase';
import {schedules} from '@/services/firestore';
import type {Schedule, WithId} from '@/types/smartlife';

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const GOOGLE_IDENTITY_SCRIPT = 'https://accounts.google.com/gsi/client';
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const BANGKOK_TIME_ZONE = 'Asia/Bangkok';

type GoogleEventDate = {date?: string; dateTime?: string; timeZone?: string};
type GoogleCalendarEvent = {
  end?: GoogleEventDate;
  extendedProperties?: {private?: Record<string, string>};
  id?: string;
  location?: string;
  recurringEventId?: string;
  start?: GoogleEventDate;
  status?: string;
  summary?: string;
};

type GoogleEventsResponse = {items?: GoogleCalendarEvent[]; nextPageToken?: string};

export type GoogleCalendarSyncResult = {
  email: string;
  pulled: number;
  pushed: number;
  recentTitles: string[];
};

export type GoogleCalendarConnection = {
  calendarId: 'primary';
  connected: true;
  connectedAt: Timestamp;
  email: string;
  lastSyncedAt?: Timestamp;
  ownerId: string;
  provider: 'google';
  updatedAt: Timestamp;
};

let configuredClientId = '';
let webSession: {accessToken: string; email: string; expiresAt: number} | null = null;
let loggedOAuthConfiguration = false;

function assertCalendarOwner(uid: string) {
  const authenticatedUid = auth.currentUser?.uid;
  if (!authenticatedUid) throw new Error('กรุณาเข้าสู่ระบบก่อนอ่านสถานะ Google Calendar');
  if (authenticatedUid !== uid) throw new Error('บัญชีที่เข้าสู่ระบบไม่ตรงกับเจ้าของข้อมูล Google Calendar');
}

export function googleCalendarErrorMessage(error: unknown) {
  if (error instanceof FirebaseError && error.code === 'permission-denied') {
    return 'Firestore ยังไม่อนุญาตข้อมูล Google Calendar ของบัญชีนี้ กรุณา deploy firestore.rules เวอร์ชันล่าสุด แล้วเปิดแอปใหม่';
  }
  return error instanceof Error ? error.message : String(error ?? 'เกิดข้อผิดพลาดกับ Google Calendar');
}

function googleCalendarConnectionRef(uid: string) {
  assertCalendarOwner(uid);
  return doc(db, 'users', uid, 'integrations', 'google-calendar');
}

export function watchGoogleCalendarConnection(
  uid: string,
  onValue: (connection: GoogleCalendarConnection | null) => void,
  onError?: (error: Error) => void,
) {
  try {
    return onSnapshot(googleCalendarConnectionRef(uid), (snapshot) => {
      onValue(snapshot.exists() ? snapshot.data() as GoogleCalendarConnection : null);
    }, (error) => onError?.(new Error(googleCalendarErrorMessage(error))));
  } catch (error) {
    onError?.(new Error(googleCalendarErrorMessage(error)));
    return () => undefined;
  }
}

async function saveGoogleCalendarConnection(uid: string, email: string) {
  const reference = googleCalendarConnectionRef(uid);
  const snapshot = await getDoc(reference);
  const common = {
    calendarId: 'primary' as const,
    connected: true as const,
    email: email.trim().slice(0, 254) || 'Google Account',
    ownerId: uid,
    provider: 'google' as const,
    updatedAt: serverTimestamp(),
  };

  if (snapshot.exists()) {
    await updateDoc(reference, common);
    return;
  }

  await setDoc(reference, {...common, connectedAt: serverTimestamp()});
}

async function markGoogleCalendarSynced(uid: string) {
  await updateDoc(googleCalendarConnectionRef(uid), {
    lastSyncedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

type GoogleWebTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
  expires_in?: number;
};

type GoogleWebTokenClient = {requestAccessToken: (options?: {prompt?: string}) => void};
type GoogleWebIdentity = {
  accounts: {oauth2: {initTokenClient: (options: {
    callback: (response: GoogleWebTokenResponse) => void;
    client_id: string;
    error_callback?: (error: {message?: string; type?: string}) => void;
    scope: string;
  }) => GoogleWebTokenClient}};
};

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error ?? 'Unknown Google Calendar error');
}

function currentWebOrigin() {
  return typeof window === 'undefined' ? '' : window.location.origin;
}

function webOAuthConfigurationError(detail?: string) {
  const origin = currentWebOrigin() || 'the current website origin';
  const suffix = detail ? ` (${detail})` : '';
  return new Error(
    `Google OAuth Client ใช้งานกับเว็บนี้ไม่ได้${suffix}\n` +
    `ตรวจว่า EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID เป็น Client ประเภท Web application ` +
    `และเพิ่ม ${origin} ใน Authorized JavaScript origins ของ Client เดียวกัน`,
  );
}

function isWebOAuthConfigurationError(value: string) {
  return /invalid_client|origin_mismatch|not a valid origin|registered origin|client id/i.test(value);
}

function maskedClientId(value?: string) {
  if (!value) return '<missing>';
  const match = value.match(/^(\d+)-(.+)\.apps\.googleusercontent\.com$/i);
  if (!match) return '<invalid-client-id>';
  const client = match[2];
  return `${match[1]}-${client.slice(0, 6)}…${client.slice(-4)}.apps.googleusercontent.com`;
}

function logGoogleOAuthConfiguration() {
  if (!__DEV__ || loggedOAuthConfiguration) return;
  loggedOAuthConfiguration = true;
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
  const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID?.trim();
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
  console.info('[Google OAuth] configuration', {
    androidClientId: maskedClientId(androidClientId),
    iosClientId: maskedClientId(iosClientId),
    origin: currentWebOrigin() || '<native>',
    platform: Platform.OS,
    webClientId: maskedClientId(webClientId),
  });
}

function asDate(value?: GoogleEventDate) {
  if (value?.dateTime) {
    const parsed = new Date(value.dateTime);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (value?.date) {
    const parsed = new Date(`${value.date}T00:00:00+07:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function toDate(value: unknown) {
  if (value instanceof Timestamp) return value.toDate();
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as {toDate?: unknown}).toDate === 'function') {
    return (value as {toDate: () => Date}).toDate();
  }
  return new Date(String(value ?? ''));
}

function rruleUntil(value: Date) {
  return value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

async function loadGoogleIdentityServices() {
  if (typeof window === 'undefined' || typeof document === 'undefined') throw new Error('Google OAuth ต้องเปิดในเว็บเบราว์เซอร์');
  const googleWindow = window as typeof window & {google?: GoogleWebIdentity};
  if (googleWindow.google?.accounts.oauth2) return googleWindow.google;

  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_IDENTITY_SCRIPT}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(), {once: true});
      existing.addEventListener('error', () => reject(new Error('โหลด Google Identity Services ไม่สำเร็จ')), {once: true});
      return;
    }
    const script = document.createElement('script');
    script.async = true;
    script.defer = true;
    script.src = GOOGLE_IDENTITY_SCRIPT;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('โหลด Google Identity Services ไม่สำเร็จ'));
    document.head.appendChild(script);
  });

  if (!googleWindow.google?.accounts.oauth2) throw new Error('Google Identity Services ยังไม่พร้อมใช้งาน');
  return googleWindow.google;
}

export async function preloadGoogleCalendarAuth() {
  logGoogleOAuthConfiguration();
  if (Platform.OS === 'web') await loadGoogleIdentityServices();
}

export async function clearGoogleCalendarSession() {
  webSession = null;
  configuredClientId = '';
  if (Platform.OS === 'web' || isExpoGo()) return;

  try {
    const {GoogleSignin} = await import('@react-native-google-signin/google-signin');
    if (GoogleSignin.hasPreviousSignIn()) await GoogleSignin.signOut();
  } catch (error) {
    if (__DEV__) console.warn('[Google OAuth] Native session cleanup skipped', errorMessage(error));
  }
}

export async function disconnectGoogleCalendar(uid: string) {
  await clearGoogleCalendarSession();
  await deleteDoc(googleCalendarConnectionRef(uid));
}

async function authorizeGoogleCalendarWeb(webClientId: string) {
  if (webSession && webSession.expiresAt > Date.now() + 60_000) return webSession;

  const firebaseUser = auth.currentUser;
  const usesGoogle = firebaseUser?.providerData.some(({providerId}) => providerId === GoogleAuthProvider.PROVIDER_ID);
  if (firebaseUser && usesGoogle) {
    const provider = new GoogleAuthProvider();
    provider.addScope(CALENDAR_SCOPE);
    provider.addScope('email');
    provider.setCustomParameters({
      login_hint: firebaseUser.email ?? '',
      prompt: 'consent',
    });

    const result = await reauthenticateWithPopup(firebaseUser, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) throw new Error('Google ไม่ได้ส่ง Calendar access token กลับมา');

    webSession = {
      accessToken: credential.accessToken,
      email: result.user.email ?? 'Google Account',
      expiresAt: Date.now() + 3_600_000,
    };
    return webSession;
  }

  const google = await loadGoogleIdentityServices();
  const token = await new Promise<{accessToken: string; expiresIn: number}>((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      callback: (response) => {
        if (response.error || !response.access_token) {
          const detail = response.error_description || response.error || '';
          reject(isWebOAuthConfigurationError(detail)
            ? webOAuthConfigurationError(detail)
            : new Error(detail || 'Google ไม่ได้ส่ง access token กลับมา'));
          return;
        }
        resolve({accessToken: response.access_token, expiresIn: response.expires_in ?? 3600});
      },
      client_id: webClientId,
      error_callback: (error) => {
        const detail = error.message || error.type || '';
        reject(isWebOAuthConfigurationError(detail)
          ? webOAuthConfigurationError(detail)
          : new Error(detail || 'เปิดหน้าต่าง Google Sign-In ไม่สำเร็จ'));
      },
      scope: `${CALENDAR_SCOPE} openid email`,
    });
    client.requestAccessToken({prompt: ''});
  });

  let email = 'Google Account';
  try {
    const profile = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: {Authorization: `Bearer ${token.accessToken}`},
    });
    if (profile.ok) email = String((await profile.json() as {email?: string}).email ?? email);
  } catch {
    // Calendar sync can continue even if the optional profile request fails.
  }
  webSession = {accessToken: token.accessToken, email, expiresAt: Date.now() + token.expiresIn * 1000};
  return webSession;
}

async function authorizeGoogleCalendar() {
  logGoogleOAuthConfiguration();
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
  if (!webClientId) throw new Error('ยังไม่ได้ตั้งค่า EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ใน .env.local');
  if (!/^\d+-[a-z0-9-]+\.apps\.googleusercontent\.com$/i.test(webClientId)) {
    throw new Error('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID มีรูปแบบไม่ถูกต้อง กรุณาคัดลอก Client ID โดยไม่ใส่เครื่องหมายคำพูด');
  }
  if (Platform.OS === 'web') return authorizeGoogleCalendarWeb(webClientId);
  if (isExpoGo()) {
    throw new Error('Google Calendar บนมือถือใช้ไม่ได้ใน Expo Go กรุณาเปิดด้วย SmartLife development build');
  }

  try {
    const {GoogleSignin, isSuccessResponse} = await import('@react-native-google-signin/google-signin');
    if (configuredClientId !== webClientId) {
      GoogleSignin.configure({offlineAccess: false, scopes: [CALENDAR_SCOPE], webClientId});
      configuredClientId = webClientId;
    }
    await GoogleSignin.hasPlayServices({showPlayServicesUpdateDialog: true});

    let response = GoogleSignin.hasPreviousSignIn() ? await GoogleSignin.signInSilently() : await GoogleSignin.signIn();
    if (response.type === 'noSavedCredentialFound') response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) throw new Error('ยกเลิกการเชื่อมต่อ Google Calendar');

    const tokens = await GoogleSignin.getTokens();
    if (!tokens.accessToken) throw new Error('Google ไม่ได้ส่ง access token กลับมา');
    return {accessToken: tokens.accessToken, email: response.data.user.email};
  } catch (error) {
    const message = errorMessage(error);
    if (/native module|null|TurboModule|RNGoogleSignin/i.test(message)) {
      throw new Error('Google Calendar ต้องเปิดด้วย SmartLife development build ไม่รองรับ Expo Go');
    }
    throw error;
  }
}

async function googleRequest<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${CALENDAR_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Google Calendar ${response.status}: ${detail.slice(0, 300)}`);
  }
  return response.json() as Promise<T>;
}

async function fetchUpcomingEvents(accessToken: string, from: Date, to: Date) {
  const all: GoogleCalendarEvent[] = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({
      maxResults: '250',
      orderBy: 'startTime',
      showDeleted: 'false',
      singleEvents: 'true',
      timeMax: to.toISOString(),
      timeMin: from.toISOString(),
      timeZone: BANGKOK_TIME_ZONE,
    });
    if (pageToken) params.set('pageToken', pageToken);
    const response = await googleRequest<GoogleEventsResponse>(accessToken, `/calendars/primary/events?${params}`);
    all.push(...(response.items ?? []));
    pageToken = response.nextPageToken ?? '';
  } while (pageToken);
  return all.filter((event) => event.status !== 'cancelled');
}

async function insertRecurringEvent(accessToken: string, series: WithId<Schedule>[]) {
  const sorted = [...series].sort((a, b) => toDate(a.startAt).getTime() - toDate(b.startAt).getTime());
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const startAt = toDate(first.startAt);
  const endAt = toDate(first.endAt);
  const recurrenceEnd = new Date(toDate(last.endAt).getTime() + 24 * 60 * 60 * 1000);
  const response = await googleRequest<GoogleCalendarEvent>(accessToken, '/calendars/primary/events?sendUpdates=none', {
    body: JSON.stringify({
      description: `ซิงก์จาก SmartLife${first.courseCode ? ` • รหัสวิชา ${first.courseCode}` : ''}`,
      end: {dateTime: endAt.toISOString(), timeZone: BANGKOK_TIME_ZONE},
      extendedProperties: {private: {smartlifeSeriesId: first.seriesId ?? first.id, smartlifeSource: 'schedule'}},
      location: first.location,
      recurrence: [`RRULE:FREQ=WEEKLY;UNTIL=${rruleUntil(recurrenceEnd)}`],
      start: {dateTime: startAt.toISOString(), timeZone: BANGKOK_TIME_ZONE},
      summary: first.title,
    }),
    method: 'POST',
  });
  if (!response.id) throw new Error(`Google Calendar ไม่คืน Event ID สำหรับ ${first.title}`);
  return response.id;
}

export async function syncGoogleCalendar(uid: string): Promise<GoogleCalendarSyncResult> {
  if (!uid) throw new Error('กรุณาเข้าสู่ระบบ SmartLife ก่อนซิงก์ปฏิทิน');
  const {accessToken, email} = await authorizeGoogleCalendar();
  await saveGoogleCalendarConnection(uid, email);
  const now = new Date();
  const from = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
  const to = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  const [googleEvents, localSchedules] = await Promise.all([
    fetchUpcomingEvents(accessToken, from, to),
    schedules.between(uid, from, to),
  ]);

  const byGoogleId = new Map(localSchedules.filter((item) => item.googleEventId).map((item) => [item.googleEventId, item]));
  const newGoogleSchedules: Parameters<typeof schedules.createMany>[1] = [];
  const changedGoogleSchedules: Parameters<typeof schedules.updateMany>[1] = [];
  for (const event of googleEvents) {
    if (!event.id || event.extendedProperties?.private?.smartlifeSource === 'schedule') continue;
    const startAt = asDate(event.start);
    const endAt = asDate(event.end);
    if (!startAt || !endAt || endAt <= startAt) continue;
    const existing = byGoogleId.get(event.id);
    const data = {
      color: '#9297BB',
      courseCode: existing?.courseCode ?? '',
      courseName: existing?.courseName ?? '',
      endAt: Timestamp.fromDate(endAt),
      googleCalendarId: 'primary',
      googleEventId: event.id,
      location: event.location?.slice(0, 120) ?? '',
      seriesId: `google-${event.recurringEventId ?? event.id}`.slice(0, 128),
      source: 'google-calendar' as const,
      startAt: Timestamp.fromDate(startAt),
      title: event.summary?.trim().slice(0, 120) || 'กิจกรรมจาก Google Calendar',
    };
    if (existing) changedGoogleSchedules.push({data, id: existing.id});
    else newGoogleSchedules.push(data);
  }
  await Promise.all([
    schedules.createMany(uid, newGoogleSchedules),
    schedules.updateMany(uid, changedGoogleSchedules),
  ]);
  const pulled = newGoogleSchedules.length + changedGoogleSchedules.length;

  const groups = new Map<string, WithId<Schedule>[]>();
  localSchedules
    .filter((item) => item.source !== 'google-calendar' && !item.googleEventId)
    .forEach((item) => {
      const key = item.seriesId || item.id;
      groups.set(key, [...(groups.get(key) ?? []), item]);
    });

  let pushed = 0;
  for (const [seriesId, items] of groups) {
    const googleEventId = await insertRecurringEvent(accessToken, items);
    if (items[0].seriesId) await schedules.updateSeries(uid, seriesId, {googleCalendarId: 'primary', googleEventId});
    else await schedules.update(uid, items[0].id, {googleCalendarId: 'primary', googleEventId});
    pushed += 1;
  }

  await markGoogleCalendarSynced(uid);

  return {
    email,
    pulled,
    pushed,
    recentTitles: googleEvents.slice(0, 3).map((event) => event.summary?.trim()).filter((value): value is string => Boolean(value)),
  };
}
