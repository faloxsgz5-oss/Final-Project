# Admin Dashboard Rework

Reworks the SmartLife admin area from a single-file portal into a dashboard with
separated views, and adds three per-user views: **Calendar**, **Notes**, and
**Finance** (with read-only OCR review).

Baseline before this work: commit `46978ed`, git tag `pre-admin-dashboard-rework`.
Verbatim copies of the two most-changed files are in `docs/admin-dashboard/before/`.

```bash
# See exactly what changed
git diff pre-admin-dashboard-rework -- src/screens/admin
```

## Architecture

```text
src/admin/analytics.ts            Pure functions (no React/Firebase) — unit tested
src/admin/__tests__/              18 tests, run by `npm test`

src/services/admin-user-data.ts   Adapts Firestore docs -> analytics inputs

src/screens/admin/
  admin-portal.tsx                Shell: header, tab bar, page -> view routing
  admin-ui.tsx                    Shared presentation primitives
  admin-workspace.ts              Cross-view selection state (user, month, search)
  use-async-data.ts               Keyed loader with stale-response guard
  user-picker.tsx                 Searchable user list shared by the three views
  views/
    calendar-view.tsx   notes-view.tsx    finance-view.tsx      <- new
    dashboard-view.tsx  users-view.tsx    categories-view.tsx
    announcements-view.tsx  ocr-logs-view.tsx  feedback-view.tsx
    system-health-view.tsx  ai-knowledge-view.tsx  more-view.tsx
```

### Why per-user reads need no backend change

`firestore.rules` already grants `isAdmin()` read access to `/users/{userId}` and
every subcollection, so the three new views read the selected user's own data
directly through the existing `src/services/firestore.ts` helpers. No new Cloud
Function, no new composite index, no rules change, no deploy.

The rules contain **no `match /{path=**}/...` block**, so client-side
`collectionGroup` queries are denied for everyone. Cross-user aggregates must
keep going through the `adminMonitoringData` / `adminDashboardCounts` callables.
This is the boundary to respect when extending the dashboard.

### Why selection state lives in a module store

Each admin page is its own expo-router entry, so navigating Calendar -> Notes
unmounts and remounts `AdminPortal`. Component state would be lost on every
switch. `admin-workspace.ts` holds the selected user, month, and search in a
module-level store (mirrored to AsyncStorage), which is what satisfies
"keep the selected month when switching users".

## Data model notes

| Concept | Where it lives |
| --- | --- |
| Activities / events | `users/{uid}/activities` (`Activity`) |
| Class schedule | `users/{uid}/schedules` (`Schedule`) — separate collection, merged in the calendar |
| Notes | `users/{uid}/notes` (`Note`, category: study/work/idea/personal) |
| Income / expense | `users/{uid}/transactions` (`Transaction`) |
| OCR | `users/{uid}/scanLogs` (`ScanLog`) |
| **Savings** | **Not stored.** Derived as income − expense for the selected month. |
| **Accounts** | **Not modelled.** Figures are per user; `bank`/`accountLast4` are free-form LINE metadata. |
| **Budget** | `src/services/monthly-budget.ts` — AsyncStorage, device-local, invisible to admins. |

## OCR scope

Review-only, by decision. Admins see each user's scans (provider, confidence,
status, needs-review) and which transactions came from OCR.

Admins **cannot** upload a receipt on another user's behalf. `analyzeScan`
rejects any `storagePath` outside `users/{callerUid}/`, `saveReviewedReceipt`
writes to `users/{callerUid}/transactions`, and Storage rules allow admin read
but owner-only create. Enabling upload-on-behalf would require a new callable,
a Storage rules change, a Firestore rules change, and an audit trail.

## Verification

```bash
npm test          # 18 admin analytics tests + existing dashboard tests
npm run typecheck # tsc --noEmit
npm run lint
npm run build:web # full web bundle; all 13 admin routes export
```

## Known limits

- Note analysis covers the 100 most recently updated notes (`notes.list` limit);
  the UI says so when the cap is hit.
- The user list is capped at 1000 accounts per `adminListUsers` call.
- Calendar and finance load a whole month unpaginated per user.
- Admin reads of user data are not audit-logged.
