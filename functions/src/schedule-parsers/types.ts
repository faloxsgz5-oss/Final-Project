export type StandardScheduleEntry = {
  courseCode: string | null;
  courseName: string | null;
  day: string | null;
  endDate?: string | null;
  endTime: string | null;
  parserSource?: string;
  raw?: string;
  room: string | null;
  startDate?: string | null;
  startTime: string | null;
};

export type ScheduleParserInput = {
  annotation?: unknown;
  rawText: string;
};

export type ScheduleParserResult = {
  confidence: number;
  entries: StandardScheduleEntry[];
  institution: string;
  strategyId: string;
  usedLlm: boolean;
};

export type ScheduleParserStrategy = {
  detect: (text: string) => number;
  id: string;
  institution: string;
  parse: (input: ScheduleParserInput) => Promise<StandardScheduleEntry[]> | StandardScheduleEntry[];
};
