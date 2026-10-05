import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  userId: 'user_id',
  displayName: 'display_name',
  serverUrl: 'server_url',
  recentMeetings: 'recent_meetings',
} as const;

export interface Session {
  userId: string;
  displayName: string;
}

async function safeGet(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function loadSession(): Promise<Session | null> {
  const userId = await safeGet(KEYS.userId);
  if (!userId) return null;
  return { userId, displayName: (await safeGet(KEYS.displayName)) || userId };
}

export async function saveSession(s: Session): Promise<void> {
  await AsyncStorage.multiSet([
    [KEYS.userId, s.userId],
    [KEYS.displayName, s.displayName],
  ]);
}

export async function clearSession(): Promise<void> {
  await AsyncStorage.multiRemove([KEYS.userId, KEYS.displayName]);
}

export const loadServerUrl = (): Promise<string | null> => safeGet(KEYS.serverUrl);
export const saveServerUrl = (url: string): Promise<void> => AsyncStorage.setItem(KEYS.serverUrl, url);

export async function loadRecentMeetings(): Promise<string[]> {
  try {
    const parsed = JSON.parse((await safeGet(KEYS.recentMeetings)) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export const saveRecentMeetings = (list: string[]): Promise<void> =>
  AsyncStorage.setItem(KEYS.recentMeetings, JSON.stringify(list));
