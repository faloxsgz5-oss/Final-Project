import AsyncStorage from '@react-native-async-storage/async-storage';

export type AssistantPreferences = {
  dailyBudget?: number;
  studyMinutes?: number;
  updatedAt?: string;
};

function storageKey(uid: string) {
  return `smartlife:assistant-preferences:${uid}`;
}

export async function loadAssistantPreferences(uid: string): Promise<AssistantPreferences> {
  const raw = await AsyncStorage.getItem(storageKey(uid));
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as AssistantPreferences;
    return {
      dailyBudget: typeof value.dailyBudget === 'number' && value.dailyBudget > 0 ? value.dailyBudget : undefined,
      studyMinutes: typeof value.studyMinutes === 'number' && value.studyMinutes > 0 ? value.studyMinutes : undefined,
      updatedAt: value.updatedAt,
    };
  } catch {
    return {};
  }
}

export async function saveAssistantPreference(
  uid: string,
  key: 'dailyBudget' | 'studyMinutes',
  value: number,
) {
  const current = await loadAssistantPreferences(uid);
  const next = {...current, [key]: value, updatedAt: new Date().toISOString()};
  await AsyncStorage.setItem(storageKey(uid), JSON.stringify(next));
  return next;
}
