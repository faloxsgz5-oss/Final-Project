// In-memory stand-in for the Firestore budget collection, so the sync,
// carry-forward and migration logic can be driven without a live backend.
// Keyed `uid/monthKey`, mirroring `users/{uid}/monthlyBudgets/{monthKey}`.
// The document shape itself is covered by the emulator rules test.
const server = new Map();

let readsFail = false;
let writesFail = false;

/** Simulates losing the network for reads, writes, or both. */
export function __setOffline({reads = false, writes = false} = {}) {
  readsFail = reads;
  writesFail = writes;
}

export function __reset() {
  server.clear();
  readsFail = false;
  writesFail = false;
}

/** Everything the "server" holds, for asserting on what actually synced. */
export function __dump() {
  return [...server.entries()].map(([key, value]) => ({key, ...value}));
}

export async function readRemoteBudget(uid, monthKey) {
  if (readsFail) throw new Error('offline');
  return server.get(`${uid}/${monthKey}`) ?? null;
}

export async function readLatestRemoteBudgetBefore(uid, monthKey, earliestKey) {
  if (readsFail) throw new Error('offline');
  return [...server.entries()]
    .filter(([key]) => key.startsWith(`${uid}/`))
    .map(([, value]) => value)
    .filter((value) => value.monthKey < monthKey && value.monthKey >= earliestKey)
    .sort((a, b) => (a.monthKey < b.monthKey ? 1 : -1))[0] ?? null;
}

export async function writeRemoteBudget(uid, budget) {
  if (writesFail) throw new Error('offline');
  server.set(`${uid}/${budget.monthKey}`, {
    amount: budget.amount,
    monthKey: budget.monthKey,
    source: budget.source,
    updatedAt: new Date().toISOString(),
  });
}
