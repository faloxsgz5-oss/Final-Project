# SmartLife AI release checklist

Run these checks before sharing a release build:

1. Run `npm run doctor`, `npm run doctor:release`, `npm run test:assistant-intents`, and `npm run typecheck`.
2. Run the Functions lint/build checks and deploy `smartLifeAssistantReply` plus `assistantTelemetry`.
3. Build an Android release signed with the same certificate whose SHA-256 fingerprint is registered in Firebase App Check.
4. Install that exact build on at least two real Android phones. Do not use Expo Go for this test.
5. Ask one schedule, finance, note, and free-form Gemini question on every device.
6. Check App Check metrics and Cloud Run logs. Confirm accepted requests and no `unauthenticated`, `resource-exhausted`, or missing native module errors.
7. Open the admin `assistantQuality` monitoring result and verify intent, source, latency, error type, and helpful/not-helpful feedback.

The app never stores raw assistant questions in quality telemetry. It stores only intent, answer source, latency, error category, and optional usefulness feedback.

## Social login

Email/password works independently. Google and Facebook buttons require their real IDs in `.env.local`:

- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
- `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`
- `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`
- `EXPO_PUBLIC_FACEBOOK_APP_ID`

Never commit `.env.local` or API secrets to Git.
