export type AssistantTaskRankInput = {
  blockedBy?: string[];
  dueAt: Date | null;
  estimatedMinutes?: number;
  id?: string;
  priority?: string;
  scheduleFitScore?: number;
  status?: string;
  title: string;
};

function priorityScore(value = '') {
  if (/ด่วน|สูง|high|urgent|critical/i.test(value)) return 3;
  if (/กลาง|medium|normal/i.test(value)) return 2;
  if (/ต่ำ|low/i.test(value)) return 1;
  return 0;
}
function urgencyBand(task: AssistantTaskRankInput, now: Date) {
  if (!task.dueAt) return 5;
  const hours = (task.dueAt.getTime() - now.getTime()) / (60 * 60 * 1000);
  if (hours < 0) return 0;
  if (hours <= 24) return 1;
  if (hours <= 72) return 2;
  if (hours <= 7 * 24) return 3;
  return 4;
}

export function rankAssistantTasks<T extends AssistantTaskRankInput>(tasks: T[], now = new Date()) {
  return [...tasks]
    .filter((task) => !/completed|cancelled|done|เสร็จ|ยกเลิก/i.test(task.status ?? ''))
    .sort((left, right) => {
      const urgency = urgencyBand(left, now) - urgencyBand(right, now);
      if (urgency) return urgency;

      const blocked = Number(Boolean(left.blockedBy?.length)) - Number(Boolean(right.blockedBy?.length));
      if (blocked) return blocked;

      const priority = priorityScore(right.priority) - priorityScore(left.priority);
      if (priority) return priority;

      if (left.dueAt && right.dueAt) {
        const due = left.dueAt.getTime() - right.dueAt.getTime();
        if (due) return due;
      }
      if (left.dueAt) return -1;
      if (right.dueAt) return 1;

      const scheduleFit = (right.scheduleFitScore ?? 0) - (left.scheduleFitScore ?? 0);
      if (scheduleFit) return scheduleFit;
      return (left.estimatedMinutes ?? Number.MAX_SAFE_INTEGER) -
        (right.estimatedMinutes ?? Number.MAX_SAFE_INTEGER) ||
        left.title.localeCompare(right.title, 'th');
    });
}
