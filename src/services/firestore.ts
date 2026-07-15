import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  DocumentData,
  endAt,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  QueryConstraint,
  query,
  QueryDocumentSnapshot,
  serverTimestamp,
  startAt,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

import { db } from '@/lib/firebase';
import type {
  Activity,
  AiRecommendation,
  Feedback,
  Note,
  Notification,
  ScanLog,
  Schedule,
  Transaction,
  WithId,
} from '@/types/smartlife';

type UserCollection =
  | 'activities'
  | 'aiRecommendations'
  | 'feedback'
  | 'notes'
  | 'notifications'
  | 'scanLogs'
  | 'schedules'
  | 'transactions';

type CreateFields = { createdAt: ReturnType<typeof serverTimestamp>; ownerId: string; updatedAt: ReturnType<typeof serverTimestamp> };

function userCollection(uid: string, name: UserCollection) {
  return collection(db, 'users', uid, name);
}

function mapDocument<T>(snapshot: QueryDocumentSnapshot<DocumentData>): WithId<T> {
  return { id: snapshot.id, ...snapshot.data() } as WithId<T>;
}

function timestampMillis(value: unknown) {
  if (value instanceof Timestamp) return value.toMillis();
  if (value && typeof value === 'object' && 'toMillis' in value && typeof (value as {toMillis?: unknown}).toMillis === 'function') {
    return (value as {toMillis: () => number}).toMillis();
  }
  return 0;
}

function sortNewestFirst<T extends {createdAt?: unknown}>(items: T[]) {
  return [...items].sort((first, second) => timestampMillis(second.createdAt) - timestampMillis(first.createdAt));
}

async function createOwned<T extends object>(uid: string, name: UserCollection, data: T) {
  const timestamps: CreateFields = { ownerId: uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
  const reference = await addDoc(userCollection(uid, name), { ...data, ...timestamps });
  return reference.id;
}

async function createOwnedMany<T extends object>(uid: string, name: UserCollection, items: T[]) {
  if (!items.length) return [];
  if (items.length > 500) throw new Error('A Firestore batch can contain at most 500 documents.');
  const batch = writeBatch(db);
  const ids = items.map((data) => {
    const reference = doc(userCollection(uid, name));
    batch.set(reference, {...data, ownerId: uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp()});
    return reference.id;
  });
  await batch.commit();
  return ids;
}

async function updateOwned(uid: string, name: UserCollection, id: string, data: object) {
  await updateDoc(doc(db, 'users', uid, name, id), { ...data, updatedAt: serverTimestamp() });
}

async function updateOwnedMany(uid: string, name: UserCollection, items: {data: object; id: string}[]) {
  if (!items.length) return 0;
  if (items.length > 500) throw new Error('A Firestore batch can contain at most 500 documents.');
  const batch = writeBatch(db);
  items.forEach((item) => batch.update(doc(db, 'users', uid, name, item.id), {...item.data, updatedAt: serverTimestamp()}));
  await batch.commit();
  return items.length;
}

async function removeOwned(uid: string, name: UserCollection, id: string) {
  await deleteDoc(doc(db, 'users', uid, name, id));
}

async function listOwned<T>(uid: string, name: UserCollection, constraints: QueryConstraint[] = []) {
  const snapshot = await getDocs(query(userCollection(uid, name), ...constraints));
  return snapshot.docs.map((item) => mapDocument<T>(item));
}

export async function deleteCourseSeries(uid: string, courseCode: string, seriesId?: string) {
  const normalizedCourseCode = courseCode.replace(/\s+/g, '').toUpperCase();
  const normalizedSeriesId = seriesId?.trim();
  if (!uid || (!normalizedSeriesId && !normalizedCourseCode)) {
    throw new Error('A user ID and course series identifier are required.');
  }

  const schedulesRef = userCollection(uid, 'schedules');
  const matchingSchedules = normalizedSeriesId
    ? query(schedulesRef, where('seriesId', '==', normalizedSeriesId))
    : query(schedulesRef, where('courseCode', '==', normalizedCourseCode));
  const snapshot = await getDocs(matchingSchedules);

  if (snapshot.empty) return 0;
  if (snapshot.size > 500) {
    throw new Error('This course series exceeds the Firestore batch limit of 500 schedules.');
  }

  const batch = writeBatch(db);
  snapshot.docs.forEach((scheduleDocument) => batch.delete(scheduleDocument.ref));
  await batch.commit();
  return snapshot.size;
}

export const schedules = {
  create: (uid: string, data: Omit<Schedule, keyof CreateFields | 'ownerId'>) => createOwned(uid, 'schedules', data),
  createMany: (uid: string, data: Omit<Schedule, keyof CreateFields | 'ownerId'>[]) => createOwnedMany(uid, 'schedules', data),
  update: (uid: string, id: string, data: Partial<Omit<Schedule, keyof CreateFields | 'ownerId'>>) => updateOwned(uid, 'schedules', id, data),
  updateMany: (uid: string, items: {data: Partial<Omit<Schedule, keyof CreateFields | 'ownerId'>>; id: string}[]) => updateOwnedMany(uid, 'schedules', items),
  remove: (uid: string, id: string) => removeOwned(uid, 'schedules', id),
  between: (uid: string, from: Date, to: Date) => listOwned<Schedule>(uid, 'schedules', [
    orderBy('startAt'), startAt(Timestamp.fromDate(from)), endAt(Timestamp.fromDate(to)),
  ]),
  updateSeries: async (uid: string, seriesId: string, data: Partial<Omit<Schedule, keyof CreateFields | 'ownerId'>>) => {
    const snapshot = await getDocs(query(userCollection(uid, 'schedules'), where('seriesId', '==', seriesId)));
    if (snapshot.size > 500) throw new Error('This schedule series exceeds the Firestore batch limit.');
    const batch = writeBatch(db);
    snapshot.docs.forEach((item) => batch.update(item.ref, {...data, updatedAt: serverTimestamp()}));
    await batch.commit();
    return snapshot.size;
  },
};

export const activities = {
  create: (uid: string, data: Omit<Activity, keyof CreateFields | 'ownerId'>) => createOwned(uid, 'activities', data),
  update: (uid: string, id: string, data: Partial<Omit<Activity, keyof CreateFields | 'ownerId'>>) => updateOwned(uid, 'activities', id, data),
  remove: (uid: string, id: string) => removeOwned(uid, 'activities', id),
  between: (uid: string, from: Date, to: Date) => listOwned<Activity>(uid, 'activities', [
    orderBy('startAt'), startAt(Timestamp.fromDate(from)), endAt(Timestamp.fromDate(to)),
  ]),
};

export const notes = {
  create: (uid: string, data: Omit<Note, keyof CreateFields | 'ownerId'>) => createOwned(uid, 'notes', data),
  update: (uid: string, id: string, data: Partial<Omit<Note, keyof CreateFields | 'ownerId'>>) => updateOwned(uid, 'notes', id, data),
  remove: (uid: string, id: string) => removeOwned(uid, 'notes', id),
  list: (uid: string, category?: Note['category']) => listOwned<Note>(uid, 'notes', [
    ...(category ? [where('category', '==', category)] : []), orderBy('updatedAt', 'desc'), limit(100),
  ]),
};

export const transactions = {
  create: (uid: string, data: Omit<Transaction, keyof CreateFields | 'ownerId'>) => createOwned(uid, 'transactions', data),
  update: (uid: string, id: string, data: Partial<Omit<Transaction, keyof CreateFields | 'ownerId'>>) => updateOwned(uid, 'transactions', id, data),
  remove: (uid: string, id: string) => removeOwned(uid, 'transactions', id),
  between: (uid: string, from: Date, to: Date, type?: Transaction['type']) => listOwned<Transaction>(uid, 'transactions', [
    ...(type ? [where('type', '==', type)] : []),
    where('occurredAt', '>=', Timestamp.fromDate(from)),
    where('occurredAt', '<=', Timestamp.fromDate(to)),
    orderBy('occurredAt', 'desc'),
  ]),
};

export const scanLogs = {
  create: (uid: string, data: Omit<ScanLog, keyof CreateFields | 'ownerId'>) => createOwned(uid, 'scanLogs', data),
  list: async (uid: string) => sortNewestFirst(await listOwned<ScanLog>(uid, 'scanLogs')).slice(0, 100),
  remove: (uid: string, id: string) => removeOwned(uid, 'scanLogs', id),
  get: async (uid: string, id: string) => {
    const snapshot = await getDoc(doc(db, 'users', uid, 'scanLogs', id));
    return snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as WithId<ScanLog>) : null;
  },
  watch: (uid: string, id: string, onChange: (value: WithId<ScanLog> | null) => void) =>
    onSnapshot(doc(db, 'users', uid, 'scanLogs', id), (snapshot) => {
      onChange(snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as WithId<ScanLog>) : null);
    }),
  watchList: (uid: string, onChange: (value: WithId<ScanLog>[]) => void, onError?: (error: Error) => void) =>
    onSnapshot(userCollection(uid, 'scanLogs'), (snapshot) => {
      const items = snapshot.docs.map((item) => mapDocument<ScanLog>(item));
      onChange(sortNewestFirst(items).slice(0, 100));
    }, onError),
};

export const notifications = {
  list: (uid: string, kind?: Notification['kind']) => listOwned<Notification>(uid, 'notifications', [
    ...(kind ? [where('kind', '==', kind)] : []), orderBy('createdAt', 'desc'), limit(100),
  ]),
  markRead: (uid: string, id: string, read = true) => updateOwned(uid, 'notifications', id, { read }),
};

export const aiRecommendations = {
  list: (uid: string, kind?: AiRecommendation['kind']) => listOwned<AiRecommendation>(uid, 'aiRecommendations', [
    ...(kind ? [where('kind', '==', kind)] : []), orderBy('createdAt', 'desc'), limit(100),
  ]),
};

export const feedback = {
  create: (uid: string, data: Pick<Feedback, 'message' | 'type'>) => createOwned(uid, 'feedback', { ...data, status: 'new' }),
};
