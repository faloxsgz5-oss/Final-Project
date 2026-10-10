import {MINIMUM_NIGHT_HOURS} from '@/services/sleep-window';

/**
 * What the Android sleep widget says when "ตื่นนอน" records nothing.
 *
 * The widget runs with no app on screen, so a skipped wake used to look like
 * a dead button: the status line was redrawn with the same "กำลังนอนอยู่"
 * text. Each case now gets a short widget line (two lines at most on a 4x1
 * widget) and a longer toast that says why and what to do. Nothing here
 * writes data; the rule itself stays in `finishSleepLog`.
 */

function waitText(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} นาที`;
  return rest ? `${hours} ชม. ${rest} นาที` : `${hours} ชม.`;
}

/** Minutes until the open night is long enough to record; at least 1. */
export function minutesUntilRecordable(startedAt: Date, now: Date) {
  const elapsed = (now.getTime() - startedAt.getTime()) / 60000;
  return Math.max(1, Math.ceil(MINIMUM_NIGHT_HOURS * 60 - elapsed));
}

export function shortNightWidgetText(startedAt: Date, now: Date) {
  return `ยังไม่บันทึก นอนไม่ถึง ${MINIMUM_NIGHT_HOURS} ชม. (อีก ${waitText(minutesUntilRecordable(startedAt, now))})`;
}

export function shortNightToastText(startedAt: Date, now: Date) {
  return `นอนยังไม่ถึง ${MINIMUM_NIGHT_HOURS} ชั่วโมง จึงยังไม่บันทึกการตื่น กดตื่นนอนได้อีกครั้งในอีก ${waitText(minutesUntilRecordable(startedAt, now))}`;
}

export const NO_OPEN_NIGHT_WIDGET_TEXT = 'ยังไม่ได้กดเข้านอน ไม่มีอะไรให้บันทึก';
export const NO_OPEN_NIGHT_TOAST_TEXT = 'ยังไม่ได้กดเข้านอนในคืนนี้ จึงไม่มีการนอนให้บันทึกการตื่น กด "เข้านอน" ก่อนนอนครั้งหน้า';
