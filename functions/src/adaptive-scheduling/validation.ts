import {ADAPTIVE_ACTIVITY_CATEGORIES, AdaptiveActivityCategory} from "./types";

export type ValidatedNaturalLanguageIntent = {
  activityCategory: AdaptiveActivityCategory | null;
  deadline: string | null;
  earliestLocalStartExclusive: boolean;
  durationMinutes: number | null;
  earliestLocalStartTime: string | null;
  intent: "create_activity" | "explain_move" | "find_time" | "productivity" | "rebalance_day" | "rebalance_week" | "set_preference" | "unknown";
  latestLocalStartTime: string | null;
  preferredPeriod: "afternoon" | "early_morning" | "evening" | "late_morning" | "morning" | "night" | "noon" | null;
  preferenceMode: "avoid" | "prefer" | null;
  requiresConfirmation: true;
  requestedLocalDate: string | null;
  taskTitle: string | null;
};

const allowedIntents = ["create_activity", "explain_move", "find_time", "productivity", "rebalance_day", "rebalance_week", "set_preference", "unknown"] as const;
const allowedPeriods = ["afternoon", "early_morning", "evening", "late_morning", "morning", "night", "noon"] as const;
const expectedKeys = ["activityCategory", "deadline", "durationMinutes", "earliestLocalStartExclusive", "earliestLocalStartTime", "intent", "latestLocalStartTime", "preferredPeriod", "preferenceMode", "requestedLocalDate", "requiresConfirmation", "taskTitle"];

function validLocalClock(value: unknown) {
  if (value === null) return true;
  if (typeof value !== "string") return false;
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return Boolean(match && Number(match[1]) <= 23 && Number(match[2]) <= 59);
}

export function validateGeminiNaturalLanguageIntent(value: unknown): ValidatedNaturalLanguageIntent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  const keys = Object.keys(data);
  if (keys.length !== expectedKeys.length || !expectedKeys.every((key) => keys.includes(key))) return null;
  if (data.requiresConfirmation !== true) return null;
  if (typeof data.earliestLocalStartExclusive !== "boolean") return null;
  if (!(allowedIntents as readonly unknown[]).includes(data.intent)) return null;
  if (data.activityCategory !== null && !(ADAPTIVE_ACTIVITY_CATEGORIES as readonly unknown[]).includes(data.activityCategory)) return null;
  if (data.preferredPeriod !== null && !(allowedPeriods as readonly unknown[]).includes(data.preferredPeriod)) return null;
  if (data.preferenceMode !== null && !["avoid", "prefer"].includes(String(data.preferenceMode))) return null;
  if (data.durationMinutes !== null && (!Number.isInteger(data.durationMinutes) || Number(data.durationMinutes) < 15 || Number(data.durationMinutes) > 720)) return null;
  if (!validLocalClock(data.earliestLocalStartTime) || !validLocalClock(data.latestLocalStartTime)) return null;
  if (data.requestedLocalDate !== null && (typeof data.requestedLocalDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(data.requestedLocalDate) || Number.isNaN(new Date(`${data.requestedLocalDate}T12:00:00Z`).getTime()))) return null;
  if (data.deadline !== null && (typeof data.deadline !== "string" || data.deadline.length > 40 || Number.isNaN(new Date(data.deadline).getTime()))) return null;
  if (data.taskTitle !== null && (typeof data.taskTitle !== "string" || !data.taskTitle.trim() || data.taskTitle.length > 160)) return null;
  return {
    activityCategory: data.activityCategory as ValidatedNaturalLanguageIntent["activityCategory"],
    deadline: data.deadline as string | null,
    durationMinutes: data.durationMinutes as number | null,
    earliestLocalStartExclusive: data.earliestLocalStartExclusive,
    earliestLocalStartTime: data.earliestLocalStartTime as string | null,
    intent: data.intent as ValidatedNaturalLanguageIntent["intent"],
    latestLocalStartTime: data.latestLocalStartTime as string | null,
    preferredPeriod: data.preferredPeriod as ValidatedNaturalLanguageIntent["preferredPeriod"],
    preferenceMode: data.preferenceMode as ValidatedNaturalLanguageIntent["preferenceMode"],
    requestedLocalDate: data.requestedLocalDate as string | null,
    requiresConfirmation: true,
    taskTitle: typeof data.taskTitle === "string" ? data.taskTitle.trim() : null,
  };
}
