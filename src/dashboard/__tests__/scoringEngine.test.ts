import {buildDashboardContext, InMemoryDashboardItemRepository} from '../contextBuilder.ts';
import {DashboardPrioritizationService} from '../prioritizationService.ts';
import {prioritizeDashboardItems} from '../scoringEngine.ts';
import type {DashboardItem} from '../types.ts';

const NOW_BANGKOK = '2026-07-29T09:00:00+07:00';
const assert = {
  deepEqual(actual: unknown, expected: unknown) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`);
    }
  },
  equal(actual: unknown, expected: unknown) {
    if (actual !== expected) throw new Error(`Expected ${String(actual)} to equal ${String(expected)}`);
  },
  match(actual: string, pattern: RegExp) {
    if (!pattern.test(actual)) throw new Error(`Expected "${actual}" to match ${String(pattern)}`);
  },
  ok(value: unknown, message = 'Expected value to be truthy') {
    if (!value) throw new Error(message);
  },
};

function baseItem(overrides: Partial<DashboardItem>): DashboardItem {
  return {
    baseUrgencyScore: 30,
    createdAt: NOW_BANGKOK,
    id: overrides.id ?? 'item',
    type: overrides.type ?? 'note_reminder',
    ...(overrides as object),
  } as DashboardItem;
}

export async function runScoringEngineTests() {
  await testEmptyDashboard();
  await testWellbeingOverrideBeatsExam();
  await testPastItemHidden();
  await testLargeDashboardDisplayCap();
  await testFinanceSeverityDifference();
  await testBangkokTimezoneUpcomingExam();
}

async function testEmptyDashboard() {
  const repository = new InMemoryDashboardItemRepository({user: []});
  const service = new DashboardPrioritizationService(repository);
  const response = await service.getPrioritizedDashboard({now: NOW_BANGKOK, userId: 'user'});

  assert.equal(response.items.length, 0);
  assert.equal(response.contextSummary.hasUpcomingExam, false);
}

async function testWellbeingOverrideBeatsExam() {
  const items: DashboardItem[] = [
    baseItem({
      examDateTime: '2026-07-29T10:00:00+07:00',
      id: 'exam-1',
      location: 'B401',
      subject: 'Holistic Health',
      type: 'exam',
    }),
    baseItem({
      id: 'wellbeing-1',
      riskLevel: 'high',
      suggestedAction: 'Take a recovery break and contact support if needed.',
      type: 'wellbeing_alert',
    }),
  ];
  const context = buildDashboardContext(items, NOW_BANGKOK);
  const prioritized = prioritizeDashboardItems(items, context);

  assert.equal(prioritized[0].id, 'wellbeing-1');
  assert.equal(prioritized[0].visibility, 'pinned');
  assert.equal(prioritized[1].id, 'exam-1');
}

async function testPastItemHidden() {
  const items: DashboardItem[] = [
    baseItem({
      endTime: '2026-07-29T08:00:00+07:00',
      id: 'class-past',
      room: 'B401',
      startTime: '2026-07-29T07:00:00+07:00',
      subject: 'Already Done',
      type: 'class_schedule',
    }),
  ];
  const context = buildDashboardContext(items, NOW_BANGKOK);
  const prioritized = prioritizeDashboardItems(items, context);

  assert.equal(prioritized[0].visibility, 'hidden');
  assert.equal(prioritized[0].reason, 'Already passed');
}

async function testLargeDashboardDisplayCap() {
  const items: DashboardItem[] = Array.from({length: 120}, (_, index) =>
    baseItem({
      id: `note-${index}`,
      remindAt: new Date(new Date(NOW_BANGKOK).getTime() + (index + 1) * 60_000).toISOString(),
      title: `Reminder ${index}`,
      type: 'note_reminder',
    }),
  );
  const context = buildDashboardContext(items, NOW_BANGKOK);
  const prioritized = prioritizeDashboardItems(items, context, {displayCap: 5});
  const visibleCount = prioritized.filter((item) => item.visibility !== 'hidden').length;

  assert.equal(prioritized.length, 120);
  assert.equal(visibleCount, 5);
}

async function testFinanceSeverityDifference() {
  const items: DashboardItem[] = [
    baseItem({
      amountRemaining: 50,
      budgetLimit: 1000,
      category: 'Food',
      id: 'finance-low',
      type: 'finance_alert',
    }),
    baseItem({
      amountRemaining: -20,
      budgetLimit: 1000,
      category: 'Transport',
      id: 'finance-over',
      type: 'finance_alert',
    }),
  ];
  const context = buildDashboardContext(items, NOW_BANGKOK);
  const prioritized = prioritizeDashboardItems(items, context);
  const overBudget = prioritized.find((item) => item.id === 'finance-over');
  const lowBudget = prioritized.find((item) => item.id === 'finance-low');

  assert.ok(overBudget);
  assert.ok(lowBudget);
  assert.ok((overBudget?.score ?? 0) > (lowBudget?.score ?? 0) + 5);
  assert.equal(context.overBudgetCategories[0], 'Transport');
}

async function testBangkokTimezoneUpcomingExam() {
  const items: DashboardItem[] = [
    baseItem({
      examDateTime: '2026-07-29T15:00:00+07:00',
      id: 'exam-bangkok',
      location: 'B401',
      subject: 'IST201506',
      type: 'exam',
    }),
  ];
  const context = buildDashboardContext(items, '2026-07-29T09:00:00+07:00');
  const prioritized = prioritizeDashboardItems(items, context);

  assert.equal(context.timezone, 'Asia/Bangkok');
  assert.equal(context.hasUpcomingExam, true);
  assert.equal(prioritized[0].visibility, 'pinned');
  assert.match(prioritized[0].reason, /Exam in 6 hours/);
}
