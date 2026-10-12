// Web signs in to Facebook through Firebase's popup, so the native SDK is never
// bundled here.
export class FacebookLoginCancelledError extends Error {
  constructor() {
    super('ยกเลิกการเข้าสู่ระบบด้วย Facebook');
    this.name = 'FacebookLoginCancelledError';
  }
}

export function isFacebookSdkConfigured() {
  return false;
}

export async function getFacebookAccessToken(): Promise<string> {
  throw new Error('Facebook native login is not available on web');
}

export async function signOutFacebook() {}
