declare module 'firebase/app' {
  export * from '@firebase/app';
}

declare module 'firebase/auth' {
  export * from '@firebase/auth';
}

declare module 'firebase/firestore' {
  export type DocumentData = Record<string, unknown>;
  export type QueryConstraint = unknown;
  export type QueryDocumentSnapshot<T = DocumentData> = {
    id: string;
    ref: any;
    data(): T;
  };
  export type QuerySnapshot<T = DocumentData> = {
    docs: QueryDocumentSnapshot<T>[];
    empty: boolean;
    size: number;
    forEach(callback: (snapshot: QueryDocumentSnapshot<T>) => void): void;
  };
  export type FirestoreError = Error & {code?: string};
  export type Unsubscribe = () => void;
  export class Timestamp {
    static fromDate(date: Date): Timestamp;
    toDate(): Date;
    toMillis(): number;
  }

  export const addDoc: (...args: any[]) => Promise<{id: string}>;
  export const collection: (...args: any[]) => any;
  export const collectionGroup: (...args: any[]) => any;
  export const deleteDoc: (...args: any[]) => Promise<void>;
  export const doc: (...args: any[]) => any;
  export const endAt: (...args: any[]) => QueryConstraint;
  export const getCountFromServer: (...args: any[]) => Promise<{data(): {count: number}}>;
  export const getDoc: (...args: any[]) => Promise<{exists(): boolean; data(): DocumentData; id: string}>;
  export const getDocs: (...args: any[]) => Promise<QuerySnapshot>;
  export const getFirestore: (...args: any[]) => any;
  export const limit: (...args: any[]) => QueryConstraint;
  export const onSnapshot: (reference: any, onNext: (snapshot: any) => void, onError?: (error: any) => void) => Unsubscribe;
  export const orderBy: (...args: any[]) => QueryConstraint;
  export const query: (...args: any[]) => any;
  export const serverTimestamp: () => Timestamp;
  export const setDoc: (...args: any[]) => Promise<void>;
  export const startAt: (...args: any[]) => QueryConstraint;
  export const updateDoc: (...args: any[]) => Promise<void>;
  export const where: (...args: any[]) => QueryConstraint;
  export const writeBatch: (...args: any[]) => {
    set: (...args: any[]) => void;
    update: (...args: any[]) => void;
    delete: (...args: any[]) => void;
    commit: () => Promise<void>;
  };
}

declare module 'firebase/functions' {
  export * from '@firebase/functions';
}

declare module 'firebase/storage' {
  export * from '@firebase/storage';
}
