export type StandardScheduleEntry = {
  buildingName?: string | null;
  classTime?: string | null;
  courseCode: string | null;
  courseName: string | null;
  day: string | null;
  endDate?: string | null;
  endTime: string | null;
  finalExam?: string | null;
  midtermExam?: string | null;
  parserSource?: string;
  raw?: string;
  room: string | null;
  section?: string | null;
  startDate?: string | null;
  startTime: string | null;
};

export type ScheduleParserInput = {
  annotation?: unknown;
  imageDataUrl?: string;
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
