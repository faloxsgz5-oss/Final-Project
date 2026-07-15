# Google Calendar setup for SmartLife

The app code uses the Google Calendar REST API with the signed-in user's access token. Tokens are obtained by the native Google Sign-In SDK and are not written to Firestore.

## Which OAuth client is used

SmartLife intentionally uses one implementation per platform:

| Runtime | Authorization code | OAuth client configuration |
| --- | --- | --- |
| Expo web (`localhost:8081`) | Google Identity Services | **Web application** client ID in `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` |
| Android development/production build | `@react-native-google-signin/google-signin` | Android client registered with package/SHA-1; `GoogleSignin.configure()` receives the **Web** client ID as `webClientId` for Google API access |
| Expo Go | Not supported | Use a development build because native Google Sign-In requires native code |

Do not paste the Android client ID into `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`. A client ID string does not reveal its type; open that exact client in Google Cloud Console and verify that **Application type** says **Web application**.

## Fix `401: invalid_client`

1. Open **Google Cloud Console > Google Auth Platform > Clients** in project `smartlife-budget`.
2. Open the client whose ID is currently in `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`.
3. Confirm its application type is **Web application**. If it is Android, create a separate Web application client and replace the environment value.
4. Under **Authorized JavaScript origins**, add these exact values (no path and no trailing slash):
   - `http://localhost:8081`
   - `http://127.0.0.1:8081`
5. Save and wait a few minutes for Google OAuth configuration to propagate.
6. Under **Audience**, add the Google account used for testing while the app is in Testing status.
7. Restart Expo so it reloads `.env.local`:

   ```powershell
   npx expo start --web --clear
   ```

For the Google Identity Services popup token flow, the important field is **Authorized JavaScript origins**. A redirect URI is not used by this web implementation.

## Google Cloud configuration

1. Open the `smartlife-budget` project in Google Cloud Console.
2. Enable **Google Calendar API**.
3. Configure the OAuth consent screen and add the Calendar scope:
   `https://www.googleapis.com/auth/calendar.events`
4. While the consent screen is in testing mode, add every tester's Google email as a test user.
5. Create an **Android OAuth client** with package name `com.smartlife.student` and the SHA-1 from the SmartLife development build.
6. Create a **Web application OAuth client**. Put its client ID in `.env.local`:

   ```env
   EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=000000000000-example.apps.googleusercontent.com
   ```
7. In that Web OAuth client, add these **Authorized JavaScript origins** for local testing:
   - `http://localhost:8081`
   - `http://127.0.0.1:8081`

The web build uses Google Identity Services' OAuth token model. Android/iOS continue to use native Google Sign-In.

## Android development build

Google Sign-In contains native Android code, so this feature cannot run in Expo Go.

```powershell
cd "C:\Users\HP\Documents\Project end\SmartLifeExpo"
npx expo run:android
npx expo start --dev-client --tunnel
```

After the Android folder exists, show the debug SHA-1 with:

```powershell
cd android
.\gradlew signingReport
```

Copy the `SHA1` value from the `debug` variant into the Android OAuth client. Rebuild the development app after changing native configuration.

## Firebase deployment

The course-name parser runs in `analyzeScan`, and the updated Firestore rules allow bounded Google event metadata on owner-only schedule documents.

```powershell
cd "C:\Users\HP\Documents\Project end\SmartLifeExpo"
npx -y firebase-tools@latest deploy --only functions:analyzeScan,firestore:rules --project smartlife-budget
```

## Sync behavior

- **Pull:** Google events from the previous 180 days through the next 365 days are created or updated under `users/{uid}/schedules`.
- **Push:** Unsynced SmartLife schedule series are inserted into the user's primary Google Calendar. OCR course occurrences sharing a `seriesId` become one weekly recurring Google event.
- SmartLife-created Google events carry private extended properties so a later pull does not duplicate them.
- Dates and recurrence use `Asia/Bangkok`.
