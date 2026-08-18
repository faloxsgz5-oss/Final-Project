// Native Development Builds use this registered token. Web builds resolve the
// platform-specific .web file instead so the token is never shipped publicly.
export const appCheckDebugToken = process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN?.trim();
