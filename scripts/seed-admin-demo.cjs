const fs = require('fs');
const path = require('path');
const {initializeApp} = require('firebase/app');
const {getAuth, signInWithEmailAndPassword, signOut} = require('firebase/auth');
const {getFunctions, httpsCallable} = require('firebase/functions');

const [email, password] = process.argv.slice(2);
if (!email || !password) throw new Error('Usage: node scripts/seed-admin-demo.cjs <email> <password>');

const env = Object.fromEntries(
  fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const [key, ...rest] = line.split('=');
      return [key, rest.join('=').replace(/^['"]|['"]$/g, '')];
    }),
);

const app = initializeApp({
  apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY,
  appId: env.EXPO_PUBLIC_FIREBASE_APP_ID,
  authDomain: env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  messagingSenderId: env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
});

async function main() {
  const auth = getAuth(app);
  await signInWithEmailAndPassword(auth, email, password);
  await auth.currentUser.getIdToken(true);
  const functions = getFunctions(app, 'asia-southeast1');
  const seed = httpsCallable(functions, 'adminSeedDemoData');
  const result = await seed({});
  const dashboardCounts = httpsCallable(functions, 'adminDashboardCounts');
  const monitoring = httpsCallable(functions, 'adminMonitoringData');
  const counts = await dashboardCounts({});
  const [recommendations, scans] = await Promise.all([
    monitoring({view: 'recommendations'}),
    monitoring({view: 'scanLogs'}),
  ]);
  console.log(result.data.seeded ? 'Firebase demo data created.' : 'Firebase demo data already exists.');
  console.log(JSON.stringify(counts.data.counts));
  console.log(`recommendations=${recommendations.data.items.length} scans=${scans.data.items.length}`);
  await signOut(auth);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
