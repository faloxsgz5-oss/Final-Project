// `firebase/auth` with one change: `updateProfile` can be made slower, the way
// a real network round-trip to Auth is slower than a write to the local
// Firestore emulator. That reopens the sign-up race (USER-001) deterministically
// in Node instead of only on some runs in a browser. Everything else is the
// real SDK. The delay is read per call from SIGNUP_PROFILE_DELAY_MS.
import {updateProfile as realUpdateProfile} from 'firebase/auth';

export * from 'firebase/auth';

export async function updateProfile(...args) {
  const delay = Number(process.env.SIGNUP_PROFILE_DELAY_MS ?? 0);
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
  return realUpdateProfile(...args);
}
