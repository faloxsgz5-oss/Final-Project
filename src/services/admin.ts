import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';

import { db } from '@/lib/firebase';
import type {
  Announcement,
  Category,
  Feedback,
  ScanKind,
  ScanLog,
  ScanStatus,
  SystemStatus,
  WithId,
} from '@/types/smartlife';

function withId<T>(snapshot: { id: string; data: () => unknown }) {
  return { id: snapshot.id, ...(snapshot.data() as T) } as WithId<T>;
}

export const adminCategories = {
  list: async (domain?: Category['domain']) => {
    const reference = collection(db, 'categories');
    const snapshot = await getDocs(domain
      ? query(reference, where('domain', '==', domain), orderBy('sortOrder'))
      : query(reference, orderBy('sortOrder')));
    return snapshot.docs.map((item) => withId<Category>(item));
  },
  create: async (data: Omit<Category, 'createdAt' | 'updatedAt'>) => {
    const reference = await addDoc(collection(db, 'categories'), {
      ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    return reference.id;
  },
  update: (id: string, data: Partial<Omit<Category, 'createdAt' | 'updatedAt'>>) =>
    updateDoc(doc(db, 'categories', id), { ...data, updatedAt: serverTimestamp() }),
  remove: (id: string) => deleteDoc(doc(db, 'categories', id)),
};

export const adminAnnouncements = {
  list: async () => {
    const snapshot = await getDocs(query(collection(db, 'announcements'), orderBy('createdAt', 'desc'), limit(100)));
    return snapshot.docs.map((item) => withId<Announcement>(item));
  },
  create: async (uid: string, data: Omit<Announcement, 'createdAt' | 'createdBy' | 'updatedAt'>) => {
    const reference = await addDoc(collection(db, 'announcements'), {
      ...data, createdBy: uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    return reference.id;
  },
  update: (id: string, data: Partial<Omit<Announcement, 'createdAt' | 'createdBy' | 'updatedAt'>>) =>
    updateDoc(doc(db, 'announcements', id), { ...data, updatedAt: serverTimestamp() }),
  remove: (id: string) => deleteDoc(doc(db, 'announcements', id)),
};

export const adminMonitoring = {
  scanLogs: async ({ kind, status }: { kind?: ScanKind; status?: ScanStatus } = {}) => {
    const reference = collectionGroup(db, 'scanLogs');
    const filters = kind
      ? [where('kind', '==', kind)]
      : status
        ? [where('status', '==', status)]
        : [];
    const snapshot = await getDocs(query(reference, ...filters, orderBy('createdAt', 'desc'), limit(100)));
    return snapshot.docs.map((item) => withId<ScanLog>(item));
  },
  feedback: async (status: Feedback['status'] = 'new') => {
    const snapshot = await getDocs(query(
      collectionGroup(db, 'feedback'), where('status', '==', status), orderBy('createdAt', 'desc'), limit(100),
    ));
    return snapshot.docs.map((item) => withId<Feedback>(item));
  },
  systemStatus: async () => {
    const snapshot = await getDocs(collection(db, 'systemStatus'));
    return snapshot.docs.map((item) => withId<SystemStatus>(item));
  },
};
