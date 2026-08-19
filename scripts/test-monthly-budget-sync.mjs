// Run via `npm run test:monthly-budget-sync`. AsyncStorage and the Firestore
// budget collection are replaced with in-memory stubs, so "device A" and
// "device B" are two independent local stores talking to one shared server --
// the same relationship a phone and the web build have.
import assert from 'node:assert/strict';

import AsyncStorage, {__reset as resetDevices, __useDevice} from '@react-native-async-storage/async-storage';
import {__dump, __reset as resetServer, __setOffline} from '@/services/monthly-budget-remote';
import {loadMonthlyBudget, saveMonthlyBudget} from '../src/services/monthly-budget.ts';

const UID = 'student-1';
const AUG = '2026-08';
const JUL = '2026-07';

function fresh() {
  resetDevices();
  resetServer();
  __useDevice('phone');
}

const localKey = (monthKey) => `smartlife:monthly-budget:${UID}:${monthKey}`;

// --- A budget set on the phone is visible on the web build.
{
  fresh();
  __useDevice('phone');
  const saved = await saveMonthlyBudget(UID, {amount: 4500, monthKey: AUG, source: 'manual'});
  assert.equal(saved.synced, true, 'an online save reports as synced');

  __useDevice('web');
  const onWeb = await loadMonthlyBudget(UID, AUG);
  assert.ok(onWeb, 'the web build sees a budget it never stored locally');
  assert.equal(onWeb.amount, 4500);
  assert.equal(onWeb.source, 'manual');
  assert.equal(onWeb.synced, true);
  assert.equal(onWeb.rolledOverFrom, undefined);
}

// --- Changing it on one device changes it on the other, in both directions.
{
  __useDevice('web');
  await saveMonthlyBudget(UID, {amount: 6000, monthKey: AUG, source: 'ai'});

  __useDevice('phone');
  const backOnPhone = await loadMonthlyBudget(UID, AUG);
  assert.equal(backOnPhone.amount, 6000, 'the phone picks up the edit made on the web');
  assert.equal(backOnPhone.source, 'ai', 'provenance travels with the amount');
}

// --- Carry-forward works off the shared budget, not a device-local copy, so a
// new device still gets last month's limit.
{
  fresh();
  __useDevice('phone');
  await saveMonthlyBudget(UID, {amount: 7777, monthKey: JUL, source: 'manual'});

  __useDevice('tablet');
  const carried = await loadMonthlyBudget(UID, AUG);
  assert.ok(carried, 'a device that never saw July still gets the carried limit');
  assert.equal(carried.amount, 7777);
  assert.equal(carried.monthKey, AUG);
  assert.equal(carried.rolledOverFrom, JUL);
}

// --- A budget saved before this moved to Firestore is uploaded on first read
// instead of being lost.
{
  fresh();
  __useDevice('phone');
  // Exactly what the previous local-only version wrote.
  await AsyncStorage.setItem(localKey(AUG), JSON.stringify({
    amount: 5200, monthKey: AUG, source: 'manual', updatedAt: '2026-08-02T04:00:00.000Z',
  }));
  assert.equal(__dump().length, 0, 'nothing on the server before the migration');

  const migrated = await loadMonthlyBudget(UID, AUG);
  assert.equal(migrated.amount, 5200, 'the pre-existing budget survives');
  assert.equal(migrated.synced, true);
  assert.deepEqual(__dump().map((row) => [row.monthKey, row.amount]), [[AUG, 5200]], 'it was uploaded');

  __useDevice('web');
  const onWeb = await loadMonthlyBudget(UID, AUG);
  assert.equal(onWeb.amount, 5200, 'and is now visible on the other platform');
}

// --- A legacy budget from an earlier month migrates under its own month, so it
// still reads as carried forward rather than as this month's confirmed limit.
{
  fresh();
  __useDevice('phone');
  await AsyncStorage.setItem(localKey(JUL), JSON.stringify({
    amount: 3300, monthKey: JUL, source: 'ai', updatedAt: '2026-07-02T04:00:00.000Z',
  }));

  const migrated = await loadMonthlyBudget(UID, AUG);
  assert.equal(migrated.amount, 3300);
  assert.equal(migrated.rolledOverFrom, JUL, 'still presented as carried forward');
  assert.deepEqual(__dump().map((row) => row.monthKey), [JUL], 'uploaded under July, not August');
}

// --- Offline: an existing budget still shows, flagged as not yet synced.
{
  fresh();
  __useDevice('phone');
  await saveMonthlyBudget(UID, {amount: 4100, monthKey: AUG, source: 'manual'});

  __setOffline({reads: true, writes: true});
  const offline = await loadMonthlyBudget(UID, AUG);
  assert.ok(offline, 'the cached budget is used when the network is down');
  assert.equal(offline.amount, 4100);
  assert.equal(offline.synced, false, 'and is marked as unsynced so the screen can say so');
}

// --- Offline saves are kept on the device and pushed once the network returns,
// rather than being dropped.
{
  fresh();
  __useDevice('phone');
  __setOffline({reads: true, writes: true});
  const savedOffline = await saveMonthlyBudget(UID, {amount: 2800, monthKey: AUG, source: 'manual'});
  assert.equal(savedOffline.amount, 2800, 'the save still succeeds locally');
  assert.equal(savedOffline.synced, false, 'and admits it has not synced');
  assert.equal(__dump().length, 0);

  __setOffline({reads: false, writes: false});
  const afterReconnect = await loadMonthlyBudget(UID, AUG);
  assert.equal(afterReconnect.amount, 2800);
  assert.equal(afterReconnect.synced, true, 'the pending budget syncs on the next successful read');
  assert.deepEqual(__dump().map((row) => [row.monthKey, row.amount]), [[AUG, 2800]]);

  __useDevice('web');
  assert.equal((await loadMonthlyBudget(UID, AUG)).amount, 2800, 'and reaches the other platform');
}

// --- A device with no budget anywhere still reports nothing.
{
  fresh();
  __useDevice('phone');
  assert.equal(await loadMonthlyBudget(UID, AUG), null);
}

// --- The server copy wins over a stale device copy.
{
  fresh();
  __useDevice('phone');
  await saveMonthlyBudget(UID, {amount: 1000, monthKey: AUG, source: 'manual'});
  __useDevice('web');
  await saveMonthlyBudget(UID, {amount: 9000, monthKey: AUG, source: 'manual'});

  __useDevice('phone');
  const refreshed = await loadMonthlyBudget(UID, AUG);
  assert.equal(refreshed.amount, 9000, 'the phone does not keep showing its stale local 1000');
}

console.log('SmartLife monthly budget sync tests passed');
