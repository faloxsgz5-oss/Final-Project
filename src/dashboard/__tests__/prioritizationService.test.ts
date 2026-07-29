import {InMemoryDashboardItemRepository} from '../contextBuilder.ts';
import {DashboardPrioritizationService} from '../prioritizationService.ts';
import type {DashboardItem} from '../types.ts';

const NOW_BANGKOK = '2026-07-29T09:00:00+07:00';
const assert = {
  async rejects(operation: () => Promise<unknown>, pattern: RegExp) {
    try {
      await operation();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!pattern.test(message)) throw new Error(`Expected "${message}" to match ${String(pattern)}`);
      return;
    }
    throw new Error('Expected operation to reject');
  },
  deepEqual(actual: unknown, expected: unknown) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`);
    }
  },
  equal(actual: unknown, expected: unknown) {
    if (actual !== expected) throw new Error(`Expected ${String(actual)} to equal ${String(expected)}`);
  },
};

export async function runPrioritizationServiceTests() {
  await testExamDayOverrideRanksExamAndRelatedAssignment();
  await testInvalidUserIdThrows();
}

async function testExamDayOverrideRanksExamAndRelatedAssignment() {
  const items: DashboardItem[] = [
    {
      baseUrgencyScore: 20,
      createdAt: NOW_BANGKOK,
      id: 'note-low',
      remindAt: '2026-07-29T11:00:00+07:00',
      title: 'Generic reminder',
      type: 'note_reminder',
    },
    {
      baseUrgencyScore: 50,
      createdAt: NOW_BANGKOK,
      dueDateTime: '2026-07-29T12:00:00+07:00',
      estimatedEffortMinutes: 90,
      id: 'assignment-related',
      subject: 'IST201506',
      title: 'Review IST201506 chapter notes',
      type: 'assignment',
    },
    {
      baseUrgencyScore: 60,
      createdAt: NOW_BANGKOK,
      examDateTime: '2026-07-29T15:00:00+07:00',
      id: 'exam-today',
      location: 'B401',
      subject: 'IST201506',
      type: 'exam',
    },
  ];
  const repository = new InMemoryDashboardItemRepository({user: items});
  const service = new DashboardPrioritizationService(repository);
  const response = await service.getPrioritizedDashboard({now: NOW_BANGKOK, userId: 'user'});

  assert.equal(response.contextSummary.hasUpcomingExam, true);
  assert.deepEqual(response.items.slice(0, 2).map((item) => item.id), [
    'exam-today',
    'assignment-related',
  ]);
  assert.equal(response.items.find((item) => item.id === 'note-low')?.visibility, 'hidden');
}

async function testInvalidUserIdThrows() {
  const service = new DashboardPrioritizationService(new InMemoryDashboardItemRepository());

  await assert.rejects(
    () => service.getPrioritizedDashboard({userId: ''}),
    /userId is required/,
  );
}
