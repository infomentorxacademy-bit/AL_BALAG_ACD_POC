import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  userId: 'user_id',
  displayName: 'display_name',
  token: 'auth_token',
  role: 'user_role',
  serverUrl: 'server_url',
  recentMeetings: 'recent_meetings',
} as const;

export interface Session {
  userId: string;
  displayName: string;
  /** Backend access token (see POST /auth/login). */
  token: string;
  role: 'admin' | 'user';
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
  const token = await safeGet(KEYS.token);
  // A session saved before accounts existed has no token: sign in again.
  if (!userId || !token) return null;
  const role = (await safeGet(KEYS.role)) === 'admin' ? 'admin' : 'user';
  return { userId, token, role, displayName: (await safeGet(KEYS.displayName)) || userId };
}

export async function saveSession(s: Session): Promise<void> {
  await AsyncStorage.multiSet([
    [KEYS.userId, s.userId],
    [KEYS.displayName, s.displayName],
    [KEYS.token, s.token],
    [KEYS.role, s.role],
  ]);
}

export async function clearSession(): Promise<void> {
  await AsyncStorage.multiRemove([KEYS.userId, KEYS.displayName, KEYS.token, KEYS.role]);
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
