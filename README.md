# SmartLife

SmartLife is an Expo and React Native application for students. It combines class schedules, notes, personal finance, OCR document scanning, notifications, Google Calendar synchronization, and an AI assistant in one mobile experience.

This repository contains the complete application source, Firebase configuration and security rules, Cloud Functions, Google Cloud Vision OCR integration, and the User and Admin interfaces.

## Main features

- Firebase Email/Password and Google authentication
- User and Admin applications with role-based access
- Day, week, month, and year schedule views
- Google Calendar two-way synchronization
- Notes and personal finance tracking
- Cloud Vision OCR for receipts and class schedules
- AI schedule extraction and assistant features
- Firebase Storage, Firestore, Cloud Functions, rules, and indexes
- Thailand date and time formatting (`Asia/Bangkok`)

## Technology stack

- Expo SDK 57 and React Native
- TypeScript and Expo Router
- Firebase Authentication, Firestore, Storage, and Cloud Functions
- Google Cloud Vision API
- Google Calendar API and Google OAuth 2.0
- OpenAI fallback extraction through Firebase Secret Manager

## Requirements

- Node.js 20 or newer
- npm
- Git
- Android Studio and an Android emulator, or a physical Android device
- Access to the team's Firebase and Google Cloud projects for backend deployment

Google Login and voice input use native modules. Test those features with a SmartLife Development Build; they are not available in Expo Go.

## Clone and install

```bash
git clone https://github.com/faloxsgz5-oss/Final-Project.git
cd Final-Project
npm install
cd functions
npm install
cd ..
```

## Local setup and environment variables

Sensitive local configuration is intentionally excluded from Git. Create your own `.env.local` from the safe template:

Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

macOS or Linux:

```bash
cp .env.example .env.local
```

Fill in the following values in `.env.local`:

```env
EXPO_PUBLIC_FIREBASE_API_KEY=your_api_key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
EXPO_PUBLIC_FIREBASE_APP_ID=your_web_app_id
EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID=your_measurement_id

EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your_web_oauth_client_id.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=your_android_oauth_client_id.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=your_ios_oauth_client_id.apps.googleusercontent.com

EXPO_PUBLIC_FACEBOOK_APP_ID=your_facebook_app_id
EXPO_PUBLIC_SMARTLIFE_DEMO=false
```

The Firebase values are available under Firebase Console > Project settings > Your apps. The Google OAuth values are available under Google Cloud Console > Google Auth Platform > Clients.

Never commit `.env`, `.env.local`, service-account JSON files, signing keys, `google-services.json`, or `GoogleService-Info.plist`.

## Firebase and Google Cloud setup

The shared backend currently uses Firebase project `smartlife-budget` in `asia-southeast1` (Singapore). A teammate needs the appropriate Firebase IAM role before deploying backend resources.

Enable these services in the Firebase or Google Cloud project:

- Firebase Authentication: Email/Password and Google providers
- Cloud Firestore
- Cloud Storage
- Cloud Functions and Secret Manager
- Google Cloud Vision API
- Google Calendar API

While the OAuth consent screen is in Testing mode, add each teammate's Google account as a test user. The Android OAuth client must use package `com.smartlife.student` and the SHA-1 certificate of the development build.

The OpenAI key belongs in Firebase Secret Manager, not in `.env.local`:

```bash
npx -y firebase-tools@latest functions:secrets:set OPENAI_API_KEY --project smartlife-budget
```

Only a project owner or authorized backend teammate needs to set this shared secret.

## Check the local configuration

```bash
npm run doctor
npm run typecheck
npm run lint
```

## Run the application

Start the installed SmartLife Development Build on the same network:

```bash
npm start
```

Start through a tunnel when the phone and computer are on different networks:

```bash
npm run start:tunnel
```

Build and install the native Android development application:

```bash
npm run android
```

Run the web version:

```bash
npm run web
```

Expo Go can be used for limited UI testing with `npm run start:expo-go`, but native Google Login and voice input require the Development Build.

## Firebase deployment

Log in and select the project:

```bash
npx -y firebase-tools@latest login
npx -y firebase-tools@latest use smartlife-budget
```

Deploy rules, indexes, Storage rules, and Cloud Functions:

```bash
npx -y firebase-tools@latest deploy --only firestore:rules,firestore:indexes,storage,functions --project smartlife-budget
```

Do not deploy backend changes without coordinating with the team because these resources are shared by every developer.

## Project structure

```text
src/app/                 Expo Router routes
src/screens/             User, Admin, Login, and legacy screens
src/components/          Shared visual and interactive components
src/services/            Firebase, OCR, Google Calendar, and AI services
src/providers/           Authentication and application context
src/types/               Shared TypeScript models
functions/src/           Firebase Cloud Functions and OCR parsers
firestore.rules          Firestore security rules
firestore.indexes.json   Firestore indexes
storage.rules            Cloud Storage security rules
docs/                    Detailed setup and architecture notes
```

## Team workflow

Create a separate branch for each task:

```bash
git switch master
git pull origin master
git switch -c feature/short-description
```

After completing and checking the work:

```bash
git add <changed-files>
git commit -m "feat: describe the completed work"
git push -u origin feature/short-description
```

Open a Pull Request into `master`. Avoid committing directly to `master`, and do not share passwords, API secrets, private keys, or personal `.env.local` files in GitHub issues or chat.

## Additional documentation

- [Firebase setup](docs/FIREBASE_SETUP.md)
- [Google Calendar setup](docs/google-calendar-setup.md)
- [Screen map](docs/SCREEN_MAP.md)

## Repository

<https://github.com/faloxsgz5-oss/Final-Project>
