import { collection, doc, addDoc, getDocs, updateDoc, query, where, orderBy, limit, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { parseLineBankNotification, BankNotificationParsed } from './line-bank-parser';
import { WithId } from '@/types/smartlife';
import { isDemoMode } from '@/lib/demo-mode';

export type BankNotification = BankNotificationParsed & {
  id: string;
  status: 'pending' | 'confirmed' | 'rejected';
  createdAt: any;
  updatedAt: any;
};

export const submitBankText = async (
  uid: string,
  text: string
): Promise<{parsed: BankNotificationParsed | null, docId: string | null, isDuplicate: boolean}> => {
  const parsed = parseLineBankNotification(text);
  if (!parsed) return { parsed: null, docId: null, isDuplicate: false };

  if (isDemoMode) {
    return { parsed, docId: 'demo-doc-id', isDuplicate: false };
  }

  const notificationsRef = collection(db, `users/${uid}/bankNotifications`);

  // Check duplicate
  const q = query(
    notificationsRef,
    where('deduplicationHash', '==', parsed.deduplicationHash),
    orderBy('createdAt', 'desc'),
    limit(1)
  );

  const querySnapshot = await getDocs(q);
  if (!querySnapshot.empty) {
    return { parsed, docId: querySnapshot.docs[0].id, isDuplicate: true };
  }

  // Save new
  const docRef = await addDoc(notificationsRef, {
    ...parsed,
    status: 'pending',
    ownerId: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  return { parsed, docId: docRef.id, isDuplicate: false };
};

export const listPendingNotifications = async (uid: string): Promise<WithId<BankNotification>[]> => {
  if (isDemoMode) {
    return [];
  }

  const notificationsRef = collection(db, `users/${uid}/bankNotifications`);
  const q = query(
    notificationsRef,
    where('status', '==', 'pending'),
    orderBy('createdAt', 'desc')
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as WithId<BankNotification>[];
};

export const confirmNotification = async (uid: string, id: string): Promise<string> => {
  if (isDemoMode) return 'demo-tx-id';

  const docRef = doc(db, `users/${uid}/bankNotifications`, id);
  await updateDoc(docRef, {
    status: 'confirmed',
    updatedAt: serverTimestamp()
  });

  // Now create the actual transaction
  const txRef = collection(db, `users/${uid}/transactions`);
  const txDoc = await addDoc(txRef, {
    ownerId: uid,
    notificationId: id,
    status: 'completed',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  return txDoc.id;
};

export const rejectNotification = async (uid: string, id: string): Promise<void> => {
  if (isDemoMode) return;

  const docRef = doc(db, `users/${uid}/bankNotifications`, id);
  await updateDoc(docRef, {
    status: 'rejected',
    updatedAt: serverTimestamp()
  });
};

export const autoConfirmHighConfidence = async (uid: string): Promise<number> => {
  if (isDemoMode) return 0;

  const notificationsRef = collection(db, `users/${uid}/bankNotifications`);
  const q = query(
    notificationsRef,
    where('status', '==', 'pending'),
    where('confidence', '>=', 0.95)
  );

  const snapshot = await getDocs(q);
  let count = 0;

  for (const doc of snapshot.docs) {
    await confirmNotification(uid, doc.id);
    count++;
  }

  return count;
};
