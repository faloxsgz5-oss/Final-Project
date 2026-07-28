import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  Timestamp,
} from 'firebase/firestore';

import {db} from '@/lib/firebase';
import {isDemoMode} from '@/lib/demo-mode';
import {thailandRange} from '@/lib/thailand-time';
import {adminAnnouncements, adminCategories} from '@/services/admin';
import {adminCloud} from '@/services/admin-cloud';
import {demoAction, demoPageData} from '@/services/demo-data';
import {activities, aiRecommendations, feedback, notes, notifications, schedules, transactions} from '@/services/firestore';
import type {ActivityType, NoteCategory, TransactionType} from '@/types/smartlife';

export type LegacyDataAction = {
  action: string;
  payload?: Record<string, unknown>;
};

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function asNumber(value: unknown) {
  const parsed = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error('กรุณาระบุจำนวนเงินให้ถูกต้อง');
  return parsed;
}

function asDate(value: unknown, fallback = new Date()) {
  const date = value instanceof Date ? value : new Date(asString(value));
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function plain(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item)]));
  }
  return value;
}

function rangeForPage(pageKey: string, referenceDate = new Date()) {
  const period = pageKey.includes('_month') ? 'month' : pageKey.includes('_week') ? 'week' : 'day';
  return thailandRange(period, referenceDate);
}

async function userProfile(uid: string) {
  const snapshot = await getDoc(doc(db, 'users', uid));
  return snapshot.exists() ? {id: snapshot.id, ...snapshot.data()} : null;
}

async function userCounts(uid: string) {
  const names = ['schedules', 'notes', 'transactions', 'activities'] as const;
  const values = await Promise.all(names.map((name) => getCountFromServer(collection(db, 'users', uid, name))));
  return Object.fromEntries(names.map((name, index) => [name, values[index].data().count]));
}

export async function loadLegacyPageData(uid: string, pageKey: string, referenceDate = new Date()) {
  if (isDemoMode) return plain(demoPageData(pageKey));
  if (pageKey.startsWith('admin/')) {
    if (pageKey.includes('dashboard')) {
      await adminCloud.seedDemoData();
      await adminCloud.refreshSystemStatus();
      const [counts, systemStatus, scanLogs] = await Promise.all([
        adminCloud.dashboardCounts(),
        adminCloud.monitoringData('systemStatus'),
        adminCloud.monitoringData('scanLogs'),
      ]);
      return plain({counts, scanLogs, systemStatus});
    }
    if (pageKey.includes('users')) {
      return plain({users: await adminCloud.listUsers()});
    }
    if (pageKey.includes('categories')) return plain({categories: await adminCategories.list()});
    if (pageKey.includes('announcements')) return plain({announcements: await adminAnnouncements.list()});
    if (pageKey.includes('feedback')) return plain({feedback: await adminCloud.monitoringData('feedback')});
    if (pageKey.includes('ocr_logs')) return plain({scanLogs: await adminCloud.monitoringData('scanLogs')});
    if (pageKey.includes('system_health')) {
      await adminCloud.refreshSystemStatus();
      return plain({systemStatus: await adminCloud.monitoringData('systemStatus')});
    }
    if (pageKey.includes('ai_knowledge')) {
      return plain({recommendations: await adminCloud.monitoringData('recommendations')});
    }
    return plain({counts: await adminCloud.dashboardCounts()});
  }

  if (pageKey === 'user/index') {
    const {from, to} = rangeForPage(pageKey, referenceDate);
    const [profile, counts, scheduleItems, activityItems, noteItems, transactionItems, notificationItems] = await Promise.all([
      userProfile(uid), userCounts(uid), schedules.between(uid, from, to), activities.between(uid, from, to),
      notes.list(uid), transactions.between(uid, from, to), notifications.list(uid),
    ]);
    return plain({profile, counts, schedules: scheduleItems, activities: activityItems, notes: noteItems,
      transactions: transactionItems, notifications: notificationItems});
  }
  if (pageKey.includes('calendar')) {
    const {from, to} = rangeForPage(pageKey, referenceDate);
    const [scheduleItems, activityItems, noteItems] = await Promise.all([
      schedules.between(uid, from, to), activities.between(uid, from, to), notes.list(uid, 'study'),
    ]);
    return plain({from, to, schedules: scheduleItems, activities: activityItems, notes: noteItems});
  }
  if (pageKey.includes('finance')) {
    const {from, to} = rangeForPage(pageKey, referenceDate);
    const type: TransactionType | undefined = pageKey.includes('_income') ? 'income' :
      pageKey.includes('_expense') ? 'expense' : undefined;
    return plain({from, to, transactions: await transactions.between(uid, from, to, type)});
  }
  if (pageKey.includes('schedule_finance_sync')) {
    const {from, to} = rangeForPage(pageKey, referenceDate);
    const [scheduleItems, activityItems, transactionItems] = await Promise.all([
      schedules.between(uid, from, to), activities.between(uid, from, to), transactions.between(uid, from, to),
    ]);
    return plain({from, to, schedules: scheduleItems, activities: activityItems, transactions: transactionItems});
  }
  if (pageKey.includes('notes')) {
    const category: NoteCategory | undefined = pageKey.includes('_study') ? 'study' :
      pageKey.includes('_work') ? 'work' : pageKey.includes('_ideas') ? 'idea' : undefined;
    return plain({notes: await notes.list(uid, category)});
  }
  if (pageKey.includes('notifications')) {
    const kind = pageKey.includes('_urgent') ? 'urgent' : pageKey.includes('_ai') ? 'ai' :
      pageKey.includes('_finance') ? 'finance' : pageKey.includes('_schedule') ? 'schedule' : undefined;
    return plain({notifications: await notifications.list(uid, kind)});
  }
  if (pageKey.includes('profile')) return plain({profile: await userProfile(uid), counts: await userCounts(uid)});
  if (pageKey.includes('ai_')) return plain({recommendations: await aiRecommendations.list(uid)});
  return plain({profile: await userProfile(uid)});
}

export async function runLegacyDataAction(uid: string, pageKey: string, request: LegacyDataAction) {
  if (isDemoMode) return demoAction();
  const data = request.payload ?? {};
  if (request.action === 'create-note') {
    return notes.create(uid, {
      title: asString(data.title), content: asString(data.content),
      category: asString(data.category, 'study') as NoteCategory,
      color: asString(data.color, '#6F8F6D'), relatedScheduleId: asString(data.relatedScheduleId),
    });
  }
  if (request.action === 'create-transaction') {
    return transactions.create(uid, {
      type: asString(data.type, 'expense') as TransactionType,
      amount: asNumber(data.amount), category: asString(data.category, 'อื่น ๆ'),
      merchant: asString(data.merchant), note: asString(data.note),
      occurredAt: Timestamp.fromDate(asDate(data.occurredAt)), receiptPath: asString(data.receiptPath),
    });
  }
  if (request.action === 'create-activity') {
    const start = asDate(data.startAt);
    const end = asDate(data.endAt, new Date(start.getTime() + 60 * 60 * 1000));
    return activities.create(uid, {
      title: asString(data.title), type: asString(data.type, 'activity') as ActivityType,
      startAt: Timestamp.fromDate(start), endAt: Timestamp.fromDate(end),
      location: asString(data.location), color: asString(data.color, '#6F8F6D'), note: asString(data.note), reminder: asString(data.reminder), category: asString(data.category), priority: asString(data.priority), attendees: asString(data.attendees),
      status: 'planned', source: asString(data.source, 'manual') as 'manual' | 'ai',
    });
  }
  if (request.action === 'create-schedule') {
    const start = asDate(data.startAt);
    const end = asDate(data.endAt, new Date(start.getTime() + 60 * 60 * 1000));
    return schedules.create(uid, {
      title: asString(data.title), courseCode: asString(data.courseCode),
      startAt: Timestamp.fromDate(start), endAt: Timestamp.fromDate(end), location: asString(data.location),
      color: asString(data.color, '#6F8F6D'), source: 'manual',
    });
  }
  if (request.action === 'create-schedules') {
    const entries = Array.isArray(data.entries) ? data.entries : [];
    const ids: string[] = [];
    for (const entry of entries.slice(0, 50)) {
      if (!entry || typeof entry !== 'object') continue;
      const item = entry as Record<string, unknown>;
      const start = asDate(item.startAt);
      const end = asDate(item.endAt, new Date(start.getTime() + 60 * 60 * 1000));
      ids.push(await schedules.create(uid, {
        title: asString(item.title, 'รายการจากตารางเรียน'), courseCode: asString(item.courseCode),
        startAt: Timestamp.fromDate(start), endAt: Timestamp.fromDate(end), location: asString(item.location),
        color: asString(item.color, '#6F8F6D'), source: 'ocr',
      }));
    }
    return ids;
  }
  if (request.action === 'feedback') {
    return feedback.create(uid, {
      type: asString(data.type, 'other') as 'ai' | 'schedule-scan' | 'expense-category' | 'other',
      message: asString(data.message),
    });
  }
  if (request.action === 'mark-notification-read') {
    await notifications.markRead(uid, asString(data.id));
    return true;
  }
  if (pageKey.startsWith('admin/') && request.action === 'create-category') {
    return adminCategories.create({
      domain: asString(data.domain, 'activity') as 'note' | 'expense' | 'activity',
      labelTh: asString(data.labelTh), labelEn: asString(data.labelEn, asString(data.labelTh)),
      icon: asString(data.icon, 'tag'), color: asString(data.color, '#6F8F6D'),
      active: true, sortOrder: Number(data.sortOrder ?? 100),
    });
  }
  if (pageKey.startsWith('admin/') && request.action === 'create-announcement') {
    const startAt = new Date();
    const endAt = new Date(startAt);
    endAt.setMonth(endAt.getMonth() + 1);
    return adminAnnouncements.create(uid, {
      title: asString(data.title), message: asString(data.message), kind: 'update', active: true,
      startAt: Timestamp.fromDate(startAt), endAt: Timestamp.fromDate(endAt),
    });
  }
  if (pageKey.startsWith('admin/') && request.action === 'toggle-user') {
    return adminCloud.setUserDisabled(asString(data.uid), data.disabled === true);
  }
  if (pageKey.startsWith('admin/') && request.action === 'reset-user-password') {
    return adminCloud.createPasswordResetLink(asString(data.email));
  }
  throw new Error(`Unsupported data action: ${request.action}`);
}
