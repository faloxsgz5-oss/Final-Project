import {notifications} from '@/services/firestore';
import {loadLegacyPageData} from '@/services/legacy-data';
import {loadMonthlyBudget} from '@/services/monthly-budget';
import {buildNotificationFeed, itemsOf, type FeedItem} from '@/services/notification-feed';

/**
 * Loads everything the bell counts and builds the feed from it: today's page
 * data, the month's transactions, the saved budget and the stored notices.
 * The notifications list and the desktop sidebar/top-bar bells all use this,
 * so they count from the same inputs. A source that fails is logged and left
 * out rather than failing the whole feed.
 */
export async function loadNotificationFeed(uid: string, logPrefix = '[Notifications]'): Promise<FeedItem[]> {
  const [pageData, monthData, savedBudget, stored] = await Promise.all([
    (loadLegacyPageData(uid, 'user/index') as Promise<Record<string, unknown>>)
      .catch((error) => { console.error(`${logPrefix} Day data load failed`, error); return {} as Record<string, unknown>; }),
    (loadLegacyPageData(uid, 'user/smartlife_finance_month') as Promise<{transactions?: unknown}>)
      .catch((error) => { console.error(`${logPrefix} Month transactions load failed`, error); return null; }),
    loadMonthlyBudget(uid).catch((error) => { console.error(`${logPrefix} Saved budget load failed`, error); return null; }),
    notifications.list(uid).catch(() => []),
  ]);
  return buildNotificationFeed({
    activities: pageData.activities,
    dailyBudget: savedBudget?.dailyAmount,
    monthlyBudget: savedBudget?.amount ?? 0,
    weeklyBudget: savedBudget?.weeklyAmount,
    monthTransactions: itemsOf(monthData?.transactions).map((item) => ({
      amount: Number(item.amount ?? 0),
      occurredAt: item.occurredAt as never,
      type: item.type === 'income' ? 'income' : 'expense',
    })),
    notes: pageData.notes,
    stored,
    todayExpenses: itemsOf(pageData.transactions)
      .filter((item) => item.type === 'expense')
      .map((item) => ({amount: Number(item.amount ?? 0)})),
  });
}
