import Constants from 'expo-constants';

/** Thrown when the person closes the Facebook dialog; the login screen stays quiet. */
export class FacebookLoginCancelledError extends Error {
  constructor() {
    super('ยกเลิกการเข้าสู่ระบบด้วย Facebook');
    this.name = 'FacebookLoginCancelledError';
  }
}

/**
 * True only in a build whose app config added the Facebook SDK plugin, which
 * needs both the App ID and the client token. A build with only the App ID has
 * no native Facebook configuration, so login must not be attempted there.
 */
export function isFacebookSdkConfigured() {
  return Constants.expoConfig?.extra?.facebookLoginConfigured === true;
}

/** Opens the native Facebook login and returns its access token. */
export async function getFacebookAccessToken() {
  const {AccessToken, LoginManager, Settings} = await import('react-native-fbsdk-next');
  Settings.initializeSDK();
  const result = await LoginManager.logInWithPermissions(['public_profile', 'email']);
  if (result.isCancelled) throw new FacebookLoginCancelledError();
  const token = await AccessToken.getCurrentAccessToken();
  if (!token?.accessToken) throw new Error('Facebook ไม่ได้ส่ง access token กลับมา');
  return token.accessToken;
}

/** Forgets the Facebook session so the next login can pick another account. */
export async function signOutFacebook() {
  if (!isFacebookSdkConfigured()) return;
  try {
    const {LoginManager} = await import('react-native-fbsdk-next');
    LoginManager.logOut();
  } catch (error) {
    console.warn('[Auth] Could not clear the Facebook session', error);
  }
}
