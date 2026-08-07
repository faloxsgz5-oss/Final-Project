const assert = require('node:assert/strict');

const {
  DEFAULT_ADAPTIVE_PREFERENCES,
  calculateSchedulingPatterns,
  findAdaptiveTimeSlots,
  validateCandidateSlot,
  validateMovableScheduleItem,
  zonedDayStart,
} = require('../lib/adaptive-scheduling/engine.js');
const {validateGeminiNaturalLanguageIntent} = require('../lib/adaptive-scheduling/validation.js');
const {applyDeterministicTemporalSemantics, fallbackAdaptiveNaturalLanguageIntent} = require('../lib/adaptive-scheduling/functions.js');

const minute = 60_000;
const day = 24 * 60 * minute;
const ms = (value) => new Date(value).getTime();
const preferences = (patch = {}) => ({
  ...DEFAULT_ADAPTIVE_PREFERENCES,
  ...patch,
  preferredTimeByCategory: patch.preferredTimeByCategory ?? {},
  scoreWeights: {...DEFAULT_ADAPTIVE_PREFERENCES.scoreWeights, ...(patch.scoreWeights ?? {})},
  thresholds: {...DEFAULT_ADAPTIVE_PREFERENCES.thresholds, ...(patch.thresholds ?? {})},
  unavailablePeriods: patch.unavailablePeriods ?? [],
});
const request = (patch = {}) => ({
  category: 'study',
  deadlineMs: null,
  durationMinutes: 60,
  earliestStartMs: ms('2026-08-05T06:00:00+07:00'),
  latestEndMs: ms('2026-08-05T23:00:00+07:00'),
  patterns: [],
  preferences: preferences(),
  priority: 'medium',
  scheduleItems: [],
  slotStepMinutes: 30,
  ...patch,
});

assert.equal(DEFAULT_ADAPTIVE_PREFERENCES.allowAutomaticRescheduling, false, 'automatic scheduling must default to off');
assert.equal(validateMovableScheduleItem({allowAiReschedule: true, isFlexible: false, isLocked: false}).code, 'fixed');
assert.equal(validateMovableScheduleItem({allowAiReschedule: true, isFlexible: true, isLocked: true}).code, 'locked');
assert.equal(validateMovableScheduleItem({allowAiReschedule: true, googleEventId: 'external', isFlexible: true, isLocked: false}).code, 'external');

const newYorkDstStart = zonedDayStart(ms('2026-03-08T12:00:00-04:00'), 'America/New_York');
const newYorkNextDay = zonedDayStart(newYorkDstStart, 'America/New_York', 1);
assert.equal(new Date(newYorkDstStart).toISOString(), '2026-03-08T05:00:00.000Z', 'day boundaries must use the saved IANA time zone');
assert.equal(newYorkNextDay - newYorkDstStart, 23 * 60 * minute, 'day ranges must remain correct through daylight-saving changes');

const conflictStart = ms('2026-08-05T13:00:00+07:00');
const conflictRequest = request({scheduleItems: [{category: 'study', endMs: conflictStart + 60 * minute, id: 'fixed-class', isDifficult: true, isFixed: true, startMs: conflictStart}]});
assert.equal(validateCandidateSlot(conflictRequest, conflictStart, conflictStart + 60 * minute).code, 'conflict', 'fixed events must block overlapping slots');

const deadlineRequest = request({deadlineMs: ms('2026-08-05T15:00:00+07:00')});
assert.equal(validateCandidateSlot(deadlineRequest, ms('2026-08-05T14:30:00+07:00'), ms('2026-08-05T15:30:00+07:00')).code, 'deadline');

const sleepRequest = request();
assert.equal(validateCandidateSlot(sleepRequest, ms('2026-08-05T23:10:00+07:00'), ms('2026-08-05T23:40:00+07:00')).code, 'outside_availability');

const boundedRequest = request({earliestStartMs: ms('2026-08-05T10:00:00+07:00'), latestEndMs: ms('2026-08-05T18:00:00+07:00')});
assert.equal(validateCandidateSlot(boundedRequest, ms('2026-08-05T09:00:00+07:00'), ms('2026-08-05T10:00:00+07:00')).code, 'outside_availability', 'server validation must reject a slot before the verified search window');

const breakRequest = request({
  preferences: preferences({minimumBreakMinutes: 15, transitionMinutes: 5}),
  scheduleItems: [{category: 'study', endMs: ms('2026-08-05T13:00:00+07:00'), id: 'focus-before', isDifficult: true, isFixed: true, startMs: ms('2026-08-05T12:00:00+07:00')}],
});
assert.equal(validateCandidateSlot(breakRequest, ms('2026-08-05T13:05:00+07:00'), ms('2026-08-05T14:05:00+07:00')).code, 'conflict', 'minimum break must be enforced around adjacent schedule items');

const unavailableRequest = request({preferences: preferences({unavailablePeriods: [{days: [3], endTime: '16:00', startTime: '14:00'}]})});
assert.equal(validateCandidateSlot(unavailableRequest, ms('2026-08-05T14:30:00+07:00'), ms('2026-08-05T15:30:00+07:00')).code, 'outside_availability');

const overloadRequest = request({durationMinutes: 90, preferences: preferences({maximumDailyWorkMinutes: 120}), scheduleItems: [{category: 'assignment', endMs: ms('2026-08-05T10:00:00+07:00'), id: 'work', isDifficult: true, isFixed: true, startMs: ms('2026-08-05T09:00:00+07:00')}]});
assert.equal(validateCandidateSlot(overloadRequest, ms('2026-08-05T15:00:00+07:00'), ms('2026-08-05T16:30:00+07:00')).code, 'overload');

const explicitPreferenceRequest = request({
  patterns: [{activityCategory: 'study', averageDurationMinutes: 60, averageStartDelayMinutes: 0, completionRate: 1, confidenceLevel: 'high', confidenceScore: .95, dayOfWeek: 3, observationCount: 20, postponementRate: 0, preferredEndHour: 10, preferredStartHour: 8, suggestionAcceptanceRate: .8}],
  preferences: preferences({preferredTimeByCategory: {study: {endTime: '17:00', startTime: '13:00'}}}),
});
const preferredSlots = findAdaptiveTimeSlots(explicitPreferenceRequest, 3);
assert.ok(preferredSlots.length > 0);
assert.ok(preferredSlots.every((slot) => new Date(slot.startMs).toLocaleString('en-US', {hour: 'numeric', hour12: false, timeZone: 'Asia/Bangkok'}).match(/13|14|15|16/)), 'explicit preference must outrank learned morning pattern');

const requiredEveningRequest = request({
  patterns: [{activityCategory: 'gaming', averageDurationMinutes: 60, averageStartDelayMinutes: 0, completionRate: 1, confidenceLevel: 'high', confidenceScore: .99, dayOfWeek: 3, observationCount: 30, postponementRate: 0, preferredEndHour: 8, preferredStartHour: 6, suggestionAcceptanceRate: 1}],
  category: 'gaming',
  requiredLocalTimeWindow: {endTime: '21:00', startTime: '17:00'},
});
const requiredEveningSlots = findAdaptiveTimeSlots(requiredEveningRequest, 8);
assert.ok(requiredEveningSlots.length > 0, 'an evening gaming request must produce an evening option when one is free');
assert.ok(requiredEveningSlots.every((slot) => {
  const hour = Number(new Intl.DateTimeFormat('en-US', {hour: '2-digit', hour12: false, timeZone: 'Asia/Bangkok'}).format(new Date(slot.startMs)));
  return hour >= 17 && hour < 21;
}), 'an explicit evening request must never be moved to the morning by learned behavior');

const observations = [
  ...Array.from({length: 6}, (_, index) => ({actualDurationMinutes: 55, actualStartMs: ms('2026-08-03T14:00:00+07:00') + index * 7 * day, category: 'study', eventType: 'task_completed', originalStartMs: null, updatedStartMs: null})),
  ...Array.from({length: 3}, (_, index) => ({actualDurationMinutes: 40, actualStartMs: ms('2026-08-04T19:00:00+07:00') + index * 7 * day, category: 'exercise', eventType: 'task_completed', originalStartMs: null, updatedStartMs: null})),
];
const patterns = calculateSchedulingPatterns(observations, DEFAULT_ADAPTIVE_PREFERENCES.thresholds, 'Asia/Bangkok');
assert.equal(patterns.find((item) => item.activityCategory === 'study').preferredStartHour, 14, 'patterns must use the configured time zone');
assert.equal(patterns.find((item) => item.activityCategory === 'study').confidenceLevel, 'medium');
assert.equal(patterns.find((item) => item.activityCategory === 'exercise').confidenceLevel, 'low');

const naturalIntent = (patch = {}) => ({
  activityCategory: null,
  deadline: null,
  durationMinutes: null,
  earliestLocalStartExclusive: false,
  earliestLocalStartTime: null,
  intent: 'unknown',
  latestLocalStartTime: null,
  preferredPeriod: null,
  preferenceMode: null,
  requestedLocalDate: null,
  requiresConfirmation: true,
  taskTitle: null,
  ...patch,
});

assert.equal(validateGeminiNaturalLanguageIntent({intent: 'find_time'}), null, 'partial Gemini output must be rejected');
assert.equal(validateGeminiNaturalLanguageIntent(naturalIntent({activityCategory: 'study', durationMinutes: 60, intent: 'find_time', preferredPeriod: 'afternoon', requiresConfirmation: false, taskTitle: 'อ่านหนังสือ'})), null, 'Gemini cannot bypass confirmation');
assert.equal(validateGeminiNaturalLanguageIntent(naturalIntent({activityCategory: 'invented', durationMinutes: 60, intent: 'find_time', taskTitle: 'อ่านหนังสือ'})), null, 'unknown categories must be rejected');
assert.deepEqual(validateGeminiNaturalLanguageIntent(naturalIntent({activityCategory: 'reading', intent: 'create_activity', taskTitle: ' อ่านหนังสือทบทวนบทเรียน '})), naturalIntent({activityCategory: 'reading', intent: 'create_activity', taskTitle: 'อ่านหนังสือทบทวนบทเรียน'}), 'a standalone activity may be proposed without command keywords or invented time data');
assert.deepEqual(validateGeminiNaturalLanguageIntent(naturalIntent({activityCategory: 'study', deadline: '2026-08-07T23:59:00+07:00', durationMinutes: 90, earliestLocalStartTime: '18:00', intent: 'find_time', preferredPeriod: 'evening', requestedLocalDate: '2026-08-07', taskTitle: ' อ่านหนังสือ '})), naturalIntent({activityCategory: 'study', deadline: '2026-08-07T23:59:00+07:00', durationMinutes: 90, earliestLocalStartTime: '18:00', intent: 'find_time', preferredPeriod: 'evening', requestedLocalDate: '2026-08-07', taskTitle: 'อ่านหนังสือ'}));

const keywordFreeActivity = fallbackAdaptiveNaturalLanguageIntent('อ่านหนังสือทบทวนบทเรียน');
assert.equal(keywordFreeActivity.intent, 'create_activity', 'standalone activities must not require an add or schedule keyword');
assert.equal(keywordFreeActivity.taskTitle, 'อ่านหนังสือทบทวนบทเรียน');
assert.equal(keywordFreeActivity.durationMinutes, null, 'missing duration must remain absent until the app applies a visible default');
assert.equal(fallbackAdaptiveNaturalLanguageIntent('มีงานค้างอะไรบ้าง').intent, 'unknown', 'task lookups must not become create operations');
assert.equal(fallbackAdaptiveNaturalLanguageIntent('ควรอ่านวิชาไหนก่อน').intent, 'unknown', 'advice questions must stay read-only');
assert.equal(fallbackAdaptiveNaturalLanguageIntent('หาเวลาอ่านหนังสือ 90 นาที').intent, 'find_time');
assert.equal(fallbackAdaptiveNaturalLanguageIntent('ช่วยจัดทั้งสัปดาห์').intent, 'rebalance_week', 'weekly auto-scheduling must understand natural Thai without a rebalance keyword');
assert.equal(fallbackAdaptiveNaturalLanguageIntent('ช่วยปรับตารางวันนี้ให้สมดุล').intent, 'rebalance_day', 'the daily Adaptive mode must work without technical keywords');
const eveningGaming = fallbackAdaptiveNaturalLanguageIntent('เล่นเกมช่วงเย็น 60 นาที');
assert.equal(eveningGaming.activityCategory, 'gaming', 'gaming must use its own Adaptive mode instead of other');
assert.equal(eveningGaming.preferredPeriod, 'evening', 'evening must remain a hard scheduling request');
const afterSixBedtime = fallbackAdaptiveNaturalLanguageIntent('นอนหลัง 6 โมงเย็น 60 นาที');
assert.equal(afterSixBedtime.earliestLocalStartTime, '18:00', 'an explicit time after 6 PM must not collapse to the 17:00 evening boundary');
assert.equal(afterSixBedtime.earliestLocalStartExclusive, true, 'หลัง/after must exclude the stated clock itself');
assert.equal(afterSixBedtime.latestLocalStartTime, null);
assert.equal(afterSixBedtime.taskTitle, 'นอน', 'timing words must not leak into the activity title');
assert.equal(fallbackAdaptiveNaturalLanguageIntent('นอนหลังหกโมงเย็น').earliestLocalStartTime, '18:00', 'spoken Thai clock words must be understood without spaces');
const exactSixBedtime = fallbackAdaptiveNaturalLanguageIntent('นอนตอน 6 โมงเย็น ๖๐ นาที');
assert.equal(exactSixBedtime.earliestLocalStartTime, '18:00');
assert.equal(exactSixBedtime.latestLocalStartTime, '18:00', 'an exact clock must constrain both sides of the start-time window');
assert.equal(exactSixBedtime.earliestLocalStartExclusive, false);
assert.equal(exactSixBedtime.durationMinutes, 60, 'Thai digits must be accepted for durations');
assert.equal(fallbackAdaptiveNaturalLanguageIntent('การนอน').intent, 'unknown', 'a broad topic must fall through to the flexible general assistant');
assert.equal(fallbackAdaptiveNaturalLanguageIntent('อ่านหนังสือตั้งแต่ 1 ทุ่ม').earliestLocalStartExclusive, false, 'ตั้งแต่/from must include the stated clock');
const fridayNoon = fallbackAdaptiveNaturalLanguageIntent('วันศุกร์อยากทำงาน 1 ชั่วโมงครึ่ง ช่วงเที่ยง', {localDate: '2026-08-05'});
assert.equal(fridayNoon.requestedLocalDate, '2026-08-07', 'a Thai weekday must resolve from verified local date');
assert.equal(fridayNoon.preferredPeriod, 'noon');
assert.equal(fridayNoon.earliestLocalStartTime, '12:00', 'noon must default to 12:00 PM');
assert.equal(fridayNoon.latestLocalStartTime, '12:00', 'plain noon must be an exact 12:00 PM request');
assert.equal(fridayNoon.durationMinutes, 90);
assert.equal(fridayNoon.taskTitle, 'ทำงาน');
const midnightIntent = fallbackAdaptiveNaturalLanguageIntent('วันศุกร์ทำงานตอนเที่ยงคืน 60 นาที', {localDate: '2026-08-05'});
assert.equal(midnightIntent.requestedLocalDate, '2026-08-07');
assert.equal(midnightIntent.preferredPeriod, 'night');
assert.equal(midnightIntent.earliestLocalStartTime, '00:00', 'Thai midnight must mean 00:00');
assert.equal(midnightIntent.latestLocalStartTime, '00:00', 'plain midnight must be exact rather than a broad night period');
const correctedGeminiFridayNoon = applyDeterministicTemporalSemantics(
  naturalIntent({intent: 'create_activity', preferredPeriod: 'morning', requestedLocalDate: '2026-08-06', taskTitle: 'ทำงาน'}),
  'Friday work at noon',
  {localDate: '2026-08-05'},
);
assert.equal(correctedGeminiFridayNoon.requestedLocalDate, '2026-08-07', 'server semantics must correct a wrong weekday date returned by Gemini');
assert.equal(correctedGeminiFridayNoon.earliestLocalStartTime, '12:00');
assert.equal(correctedGeminiFridayNoon.latestLocalStartTime, '12:00');
assert.equal(correctedGeminiFridayNoon.preferredPeriod, 'noon');

const afterSixRequest = request({
  category: 'gaming',
  patterns: requiredEveningRequest.patterns,
  requiredLocalTimeWindow: {endTime: '21:00', startTime: '18:00'},
});
const afterSixSlots = findAdaptiveTimeSlots(afterSixRequest, 5);
assert.ok(afterSixSlots.length > 0);
assert.ok(afterSixSlots.every((slot) => Number(new Intl.DateTimeFormat('en-GB', {hour: '2-digit', hour12: false, timeZone: 'Asia/Bangkok'}).format(new Date(slot.startMs))) >= 18), 'explicit 18:00 lower bound must beat learned morning behavior');

const strictAfterSevenRequest = request({
  earliestStartMs: ms('2026-08-05T06:00:00+07:00'),
  latestEndMs: ms('2026-08-06T00:00:00+07:00'),
  requiredLocalTimeWindow: {endTime: '23:00', startTime: '19:01'},
});
const strictAfterSevenSlots = findAdaptiveTimeSlots(strictAfterSevenRequest, 8);
assert.ok(strictAfterSevenSlots.length > 0);
assert.ok(strictAfterSevenSlots.every((slot) => slot.startMs > ms('2026-08-05T19:00:00+07:00')), 'after 19:00 must never return exactly 19:00');

const fridayNoonRequest = request({
  durationMinutes: 90,
  earliestStartMs: ms('2026-08-05T06:00:00+07:00'),
  latestEndMs: ms('2026-08-10T23:00:00+07:00'),
  requiredLocalDate: '2026-08-07',
  requiredLocalTimeWindow: {endTime: '13:30', startTime: '12:00'},
});
const fridayNoonSlots = findAdaptiveTimeSlots(fridayNoonRequest, 8);
assert.ok(fridayNoonSlots.length > 0);
assert.ok(fridayNoonSlots.every((slot) => new Intl.DateTimeFormat('en-CA', {day: '2-digit', month: '2-digit', timeZone: 'Asia/Bangkok', year: 'numeric'}).format(new Date(slot.startMs)) === '2026-08-07'), 'Friday requests must remain on Friday');
assert.ok(fridayNoonSlots.every((slot) => {
  const hour = Number(new Intl.DateTimeFormat('en-GB', {hour: '2-digit', hour12: false, timeZone: 'Asia/Bangkok'}).format(new Date(slot.startMs)));
  return hour === 12;
}), 'noon requests must default to 12:00 PM and never fall back to 06:00');

console.log('Adaptive Scheduling deterministic tests passed.');
