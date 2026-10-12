// Messages for social sign-in failures. Kept free of Firebase imports so the
// wording can be tested in plain Node.

/** The wording used before the original sign-in method could be named. */
export const EXISTING_ACCOUNT_FALLBACK = 'อีเมลนี้มีบัญชีอยู่แล้ว กรุณาเข้าสู่ระบบด้วยวิธีเดิมก่อน';
export const SOCIAL_NETWORK_MESSAGE = 'เชื่อมต่ออินเทอร์เน็ตไม่ได้ กรุณาตรวจสอบเครือข่ายแล้วลองอีกครั้ง';

// Most specific first: an email registered with Google and a password is
// reported as Google, the method that keeps working for it.
const METHOD_NAMES: readonly (readonly [string, string])[] = [
  ['google.com', 'Google'],
  ['password', 'อีเมลและรหัสผ่าน'],
  ['facebook.com', 'Facebook'],
];

/**
 * Names the method an email already signs in with, from Firebase's sign-in
 * methods for that email. `attempted` is the provider that just failed and is
 * never suggested back. Firebase returns no methods when email enumeration
 * protection is on, and the generic wording is used then.
 */
export function existingAccountMessage(methods: readonly string[], attempted = 'facebook.com') {
  const found = METHOD_NAMES.find(([id]) => id !== attempted && methods.includes(id));
  if (!found) return EXISTING_ACCOUNT_FALLBACK;
  const name = found[1];
  // Thai runs on without a space; a Latin name is set off by one.
  const spaced = /^[A-Za-z]/.test(name) ? ` ${name}` : name;
  return `อีเมลนี้สมัครไว้ด้วย${spaced} กรุณาเข้าสู่ระบบด้วย${spaced}`;
}

/** Recognises a failed connection in an error from Firebase or the Facebook SDK. */
export function isNetworkFailure(code: string | undefined, message: string) {
  return code === 'auth/network-request-failed'
    || /network|connection|internet|timed? ?out|unreachable|offline/i.test(message);
}
