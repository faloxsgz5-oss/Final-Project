/** An on/off build flag: only the word "true" (any case, spaces ignored) turns it on. */
export function flagEnabled(value: string | undefined) {
  return value?.trim().toLowerCase() === 'true';
}

// Facebook sign-in stays in the code (SDK, auth flow, rules, privacy pages) but
// its button is hidden on web and Android until this is "true", so a build
// without a live Facebook app shows only Google and email sign-in. Read with
// dot notation so Expo inlines it at build time.
export const facebookLoginEnabled = flagEnabled(process.env.EXPO_PUBLIC_FACEBOOK_LOGIN_ENABLED);
