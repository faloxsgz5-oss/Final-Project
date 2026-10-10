import {AppRegistry, Platform, ToastAndroid} from 'react-native';

import {auth} from '@/lib/firebase';
import {updateAndroidSleepWidget} from '@/services/android-home-widget';
import {NO_OPEN_NIGHT_TOAST_TEXT, NO_OPEN_NIGHT_WIDGET_TEXT, shortNightToastText, shortNightWidgetText} from '@/lib/sleep-widget-text';
import {findOpenSleepLog, finishSleepLog, formatClockMinutes, startSleepLog, type FinishSleepResult} from '@/services/sleep-log';

/**
 * The name a native Headless JS task is started by. The Android sleep widget's
 * "เข้านอน"/"ตื่นนอน" buttons start this via `SmartLifeSleepWidgetTaskService`
 * without ever opening the app, so it must stay registered from the very first
 * moment the JS bundle loads -- see the side-effect import in `_layout.tsx`.
 */
export const SLEEP_WIDGET_TASK_NAME = 'SmartLifeSleepWidgetTask';

type SleepWidgetTaskAction = 'go_to_bed' | 'wake_up';
type SleepWidgetTaskData = {action?: SleepWidgetTaskAction};

async function statusTextFor(uid: string) {
  const open = await findOpenSleepLog(uid).catch(() => null);
  const startedAt = open?.startAt?.toDate?.() ?? null;
  if (startedAt) {
    return `กำลังนอนอยู่ เริ่ม ${formatClockMinutes(startedAt.getHours() * 60 + startedAt.getMinutes())} น.`;
  }
  return 'พร้อมบันทึกการนอนคืนนี้';
}

/**
 * Runs with no app UI on screen, so there is nowhere to show an error dialog.
 * A failed write leaves the widget showing its previous status rather than a
 * misleading "done" state -- the user finds out for certain next time they
 * open the app, where the same `startSleepLog`/`finishSleepLog` calls the
 * in-app buttons use will report it normally.
 */
async function sleepWidgetTask(data: SleepWidgetTaskData = {}) {
  await auth.authStateReady();
  const uid = auth.currentUser?.uid;
  if (!uid) {
    await updateAndroidSleepWidget('เปิดแอปแล้วเข้าสู่ระบบก่อนใช้ปุ่มนี้').catch(() => undefined);
    return;
  }

  let wake: FinishSleepResult | null = null;
  try {
    if (data.action === 'go_to_bed') await startSleepLog(uid);
    else if (data.action === 'wake_up') wake = await finishSleepLog(uid);
    else return;
  } catch {
    return;
  }

  // A wake that records nothing -- the night is under the minimum, or there
  // is no open night -- used to redraw the same status line, so the button
  // looked dead. Say why on the widget and in a toast instead. Nothing is
  // written here: finishSleepLog already declined to.
  if (wake?.status === 'skipped') {
    const now = new Date();
    const open = wake.reason === 'too-short' ? await findOpenSleepLog(uid, now).catch(() => null) : null;
    const startedAt = open?.startAt?.toDate?.() ?? null;
    const [widgetText, toastText] = startedAt
      ? [shortNightWidgetText(startedAt, now), shortNightToastText(startedAt, now)]
      : [NO_OPEN_NIGHT_WIDGET_TEXT, NO_OPEN_NIGHT_TOAST_TEXT];
    ToastAndroid.show(toastText, ToastAndroid.LONG);
    await updateAndroidSleepWidget(widgetText).catch(() => undefined);
    return;
  }

  const statusText = await statusTextFor(uid).catch(() => 'พร้อมบันทึกการนอนคืนนี้');
  await updateAndroidSleepWidget(statusText).catch(() => undefined);
}

// The receiving service (`SmartLifeSleepWidgetTaskService`) only exists on
// Android, so registering elsewhere would just be dead weight.
if (Platform.OS === 'android') {
  AppRegistry.registerHeadlessTask(SLEEP_WIDGET_TASK_NAME, () => sleepWidgetTask);
}
