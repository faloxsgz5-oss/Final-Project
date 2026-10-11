// USER-003 regression test, against the Auth and Firestore emulators with the
// production rules. The notes screen used to read `limit(100)` once, so a user
// with more notes could neither see nor search for anything older. This seeds
// 250 notes and requires the screen's data layer to reach every one of them
// and to find a word that exists only in the oldest note.
import assert from 'node:assert/strict';

import {doc, serverTimestamp, setDoc, writeBatch} from 'firebase/firestore';

import {__signIn, db} from '@/lib/firebase';
import * as legacy from '@/services/legacy-data';

const TOTAL = Number(process.env.NOTES_TOTAL ?? 250);
const RARE_WORD = 'มะละกอสีม่วง';
const email = `notes-pagination-${Date.now()}@smartlife.test`;
const {user} = await __signIn(email, 'notes-pagination-password');
const uid = user.uid;
await setDoc(doc(db, 'users', uid), {avatarUrl: '', createdAt: serverTimestamp(), displayName: 'Notes Pagination', email, role: 'user', uid, updatedAt: serverTimestamp()});

// Seeded through the rules like the app writes them; note 0 is the newest,
// note TOTAL-1 the oldest and the only one with the rare word.
const noteData = (index) => ({
  category: ['study', 'work', 'idea', 'personal'][index % 4],
  color: '#6F8F6D',
  content: index === TOTAL - 1 ? `บันทึกเก่าที่สุด มีคำว่า ${RARE_WORD}` : `เนื้อหาโน้ต ${index}`,
  createdAt: serverTimestamp(),
  ownerId: uid,
  relatedScheduleId: '',
  title: `โน้ตหมายเลข ${index}`,
  updatedAt: serverTimestamp(),
});
// The oldest note is written on its own first, so its time is strictly the
// earliest and it cannot tie its way onto the first page.
await setDoc(doc(db, 'users', uid, 'notes', `n${String(TOTAL - 1).padStart(4, '0')}`), noteData(TOTAL - 1));
await new Promise((resolve) => setTimeout(resolve, 50));
for (let start = 0; start < TOTAL - 1; start += 200) {
  const batch = writeBatch(db);
  for (let index = start; index < Math.min(TOTAL - 1, start + 200); index += 1) {
    batch.set(doc(db, 'users', uid, 'notes', `n${String(index).padStart(4, '0')}`), noteData(index));
  }
  await batch.commit();
}
// The rules make `updatedAt` the server time of the write, so each batch of
// 200 shares one timestamp. That is deliberate here: paging must stay exact
// across ties, which only a document cursor (not a timestamp) guarantees.

const pagingAvailable = typeof legacy.loadNotesPage === 'function';
const reachable = new Set();
let pages = 0;
if (pagingAvailable) {
  let cursor = null;
  let hasMore = true;
  while (hasMore && pages < 20) {
    const page = await legacy.loadNotesPage(uid, 'user/smartlife_notes', cursor);
    pages += 1;
    for (const note of page.notes) {
      assert.ok(!reachable.has(note.id), `note ${note.id} appeared on two pages`);
      reachable.add(note.id);
    }
    cursor = page.cursor;
    hasMore = page.hasMore;
  }
} else {
  // The old screen's only data path.
  const data = await legacy.loadLegacyPageData(uid, 'user/smartlife_notes');
  for (const note of data.notes ?? []) reachable.add(note.id);
  pages = 1;
}
console.log(`notes reachable from the notes screen: ${reachable.size}/${TOTAL} (${pages} page${pages === 1 ? '' : 's'})`);

let found = false;
let searched = 0;
if (typeof legacy.searchNotes === 'function') {
  const result = await legacy.searchNotes(uid, 'user/smartlife_notes', RARE_WORD);
  found = result.notes.some((note) => String(note.content).includes(RARE_WORD));
  searched = result.searched;
} else {
  // The old screen searched only what it had loaded.
  const data = await legacy.loadLegacyPageData(uid, 'user/smartlife_notes');
  found = (data.notes ?? []).some((note) => `${note.title} ${note.content}`.toLowerCase().includes(RARE_WORD));
  searched = (data.notes ?? []).length;
}
console.log(`search for a word only in the oldest note: ${found ? 'found' : 'NOT found'} (searched ${searched} notes)`);

assert.equal(reachable.size, TOTAL, 'every note must be reachable from the notes screen');
assert.ok(found, 'search must cover all notes, not just the loaded page');
assert.equal(searched, TOTAL, 'search must report how many notes it searched');

// A category page pages through its own notes only.
const studyIds = new Set();
let cursor = null;
let hasMore = true;
while (hasMore) {
  const page = await legacy.loadNotesPage(uid, 'user/smartlife_notes_study', cursor);
  page.notes.forEach((note) => { assert.equal(note.category, 'study'); studyIds.add(note.id); });
  cursor = page.cursor;
  hasMore = page.hasMore;
}
assert.equal(studyIds.size, Math.ceil(TOTAL / 4), 'the study tab reaches every study note');
console.log(`study tab: ${studyIds.size} notes, all category "study"`);

// The first page is still the newest notes first, as before.
const first = await legacy.loadNotesPage(uid, 'user/smartlife_notes', null);
assert.equal(first.notes.length, legacy.NOTES_PAGE_SIZE);
const times = first.notes.map((note) => Date.parse(note.updatedAt));
assert.ok(times.every((time, index) => index === 0 || times[index - 1] >= time), 'first page is newest first');
console.log('notes pagination tests passed');
process.exit(0);
