// Run via `npm run test:sleep-widget-text`. The widget's "too short to record"
// line counts down to the recordable moment and never reads "0 minutes".
import assert from 'node:assert/strict';

import {minutesUntilRecordable, shortNightToastText, shortNightWidgetText} from '../src/lib/sleep-widget-text.ts';

const bed = new Date('2026-10-10T15:00:00Z');
const at = (minutes) => new Date(bed.getTime() + minutes * 60000);

assert.equal(minutesUntilRecordable(bed, at(0)), 120);
assert.equal(minutesUntilRecordable(bed, at(40)), 80);
assert.equal(minutesUntilRecordable(bed, at(119.5)), 1);
// Past the threshold the rule in finishSleepLog records instead; the floor keeps the text sane.
assert.equal(minutesUntilRecordable(bed, at(200)), 1);

assert.equal(shortNightWidgetText(bed, at(40)), 'ยังไม่บันทึก นอนไม่ถึง 2 ชม. (อีก 1 ชม. 20 นาที)');
assert.equal(shortNightWidgetText(bed, at(60)), 'ยังไม่บันทึก นอนไม่ถึง 2 ชม. (อีก 1 ชม.)');
assert.equal(shortNightWidgetText(bed, at(95)), 'ยังไม่บันทึก นอนไม่ถึง 2 ชม. (อีก 25 นาที)');
assert.match(shortNightToastText(bed, at(40)), /จึงยังไม่บันทึกการตื่น.*1 ชม\. 20 นาที$/);

console.log('sleep widget text passed: short-night countdown and wording');
