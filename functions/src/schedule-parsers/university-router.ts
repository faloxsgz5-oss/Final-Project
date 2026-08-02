import {parseListSchedule} from "./list-parser";
import type {ScheduleParserInput, ScheduleParserResult, ScheduleParserStrategy, StandardScheduleEntry} from "./types";

type UniversityProfile = {id: string; institution: string; keywords: RegExp[]; matchAny?: boolean};

const UNIVERSITY_PROFILES: UniversityProfile[] = [
  {id: "chula-list", institution: "Chulalongkorn University", matchAny: true, keywords: [/จุฬาลงกรณ์มหาวิทยาลัย/i, /CHULALONGKORN UNIVERSITY/i]},
  {id: "mahidol-list", institution: "Mahidol University", matchAny: true, keywords: [/มหาวิทยาลัยมหิดล/i, /MAHIDOL UNIVERSITY/i]},
  {id: "thammasat-list", institution: "Thammasat University", matchAny: true, keywords: [/มหาวิทยาลัยธรรมศาสตร์/i, /THAMMASAT UNIVERSITY/i]},
  {id: "ku-list", institution: "Kasetsart University", matchAny: true, keywords: [/มหาวิทยาลัยเกษตรศาสตร์/i, /KASETSART UNIVERSITY/i]},
  {id: "cmu-list", institution: "Chiang Mai University", matchAny: true, keywords: [/มหาวิทยาลัยเชียงใหม่/i, /CHIANG MAI UNIVERSITY/i]},
  {id: "kku-list", institution: "Khon Kaen University", matchAny: true, keywords: [/มหาวิทยาลัยขอนแก่น/i, /KHON KAEN UNIVERSITY/i]},
  {id: "thai-registrar-list", institution: "Thai University Registrar", keywords: [/สำนักงานการทะเบียน/i, /ระบบบริการการศึกษา/i, /มหาวิทยาลัย/i]},
  {id: "english-registrar-list", institution: "University Registrar", keywords: [/OFFICE OF THE REGISTRAR/i, /REGISTRATION SYSTEM/i, /UNIVERSITY/i]},
];

function scoreProfile(text: string, profile: UniversityProfile) {
  const matches = profile.keywords.filter((keyword) => keyword.test(text)).length;
  if (profile.matchAny) return matches ? 1 : 0;
  return Math.min(1, matches / Math.min(2, profile.keywords.length));
}

function profileStrategies(): ScheduleParserStrategy[] {
  return UNIVERSITY_PROFILES.map((profile) => ({
    id: profile.id,
    institution: profile.institution,
    detect: (text) => scoreProfile(text, profile),
    parse: ({rawText}) => parseListSchedule(rawText),
  }));
}

function usable(entries: StandardScheduleEntry[]) {
  return entries.filter((entry) =>
    Boolean(entry.courseCode || entry.courseName) && Boolean(entry.day || entry.startTime),
  );
}

export class UniversityRouter {
  private readonly strategies: ScheduleParserStrategy[];

  constructor(extraStrategies: ScheduleParserStrategy[] = []) {
    this.strategies = [...profileStrategies(), ...extraStrategies];
  }

  async parse(input: ScheduleParserInput): Promise<ScheduleParserResult> {
    const candidates = this.strategies
      .map((strategy) => ({strategy, score: strategy.detect(input.rawText)}))
      .filter((candidate) => candidate.score > 0)
      .sort((first, second) => second.score - first.score);

    for (const candidate of candidates) {
      try {
        const entries = usable(await candidate.strategy.parse(input));
        if (entries.length) return {
          confidence: candidate.score,
          entries,
          institution: candidate.strategy.institution,
          strategyId: candidate.strategy.id,
          usedLlm: false,
        };
      } catch (error) {
        console.warn(`[ScheduleRouter] Strategy ${candidate.strategy.id} failed.`, error);
      }
    }

    const listEntries = usable(parseListSchedule(input.rawText));
    if (listEntries.length) return {
      confidence: 0.55,
      entries: listEntries,
      institution: "Unknown institution",
      strategyId: "universal-list",
      usedLlm: false,
    };

    return {confidence: 0, entries: [], institution: "Unknown institution", strategyId: "none", usedLlm: false};
  }
}
