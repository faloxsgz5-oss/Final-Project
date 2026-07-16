# SmartLife Native Screen Map

The Expo router sends every app route to readable native TypeScript screens.
The old `src/screens/legacy` files are preserved as visual reference only.

| Area | Native screen | Routes handled |
| --- | --- | --- |
| Login and registration | `src/screens/auth/auth-portal.tsx` | `login/login`, `login/register` |
| User dashboard | `src/screens/native/user/dashboard-screen.tsx` | `user/index` |
| User calendar | `src/screens/native/user/calendar-screen.tsx` | Day, week and month calendar |
| User finance | `src/screens/native/user/finance-screen.tsx` | Day, week, month, income and expense |
| User notes | `src/screens/native/user/notes-screen.tsx` | Notes, study, work and ideas |
| Add note | `src/screens/native/user/note-form-screen.tsx` | `smartlife_add_note` |
| AI Assistant | `src/screens/native/user/assistant-screen.tsx` | AI Assistant and all AI recommendation variants |
| Notifications | `src/screens/native/user/notifications-screen.tsx` | All, urgent, AI, finance and schedule notifications |
| Profile and feedback | `src/screens/native/user/profile-screen.tsx` | Profile, feedback and logout |
| Add activity / task / appointment / income | `src/screens/native/user/activity-form-screen.tsx` | Manual save forms |
| Smart Scan | `src/screens/native/user/scan-screen.tsx` | Schedule and receipt scan/result routes |
| Schedule-finance connection | `src/screens/native/user/schedule-finance-screen.tsx` | Day, week and month budget suggestions |
| Onboarding | `src/screens/native/user/onboarding-screen.tsx` | All onboarding steps |
| Common User UI | `src/screens/native/user/user-ui.tsx` | Shared native shell, tab bar, card and buttons |
| Miscellaneous User routes | `src/screens/native/user/misc-screen.tsx` | Temporary native fallback for routes without a dedicated feature yet |
| Admin app | `src/screens/admin/admin-portal.tsx` | Every `admin/*` route: dashboard, users, AI monitor, OCR logs, announcements, feedback, categories and system health |
| Route access control | `src/app/[section]/[page]/index.tsx` | Selects Login, User or Admin portal after Firebase Authentication checks |

## Data code

- `src/services/auth.ts`: Firebase Authentication
- `src/services/firestore.ts`: user-owned Firestore reads and writes
- `src/services/admin-cloud.ts`: admin-only Cloud Function calls
- `src/services/legacy-data.ts`: shared Firebase data loader and write actions used by native User/Admin screens
- `functions/src/index.ts`: Cloud Functions for admin counts, monitoring, OCR and demo data

## Editing advice

All active User routes are selected in `src/app/[section]/[page]/index.tsx` and now render native React Native TSX components. `src/screens/legacy` is only a visual archive; do not edit it for new product work. Split a domain screen further when one person owns a detailed feature.
