import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Constants from 'expo-constants';

import { useStore } from '../chat/store';
import { activeMeeting, api, sessionStore } from '../controllers';
import { colors } from '../theme';

export default function ProfileScreen({ onSignOut }: { onSignOut: () => void }) {
  const { session, serverUrl } = useStore(sessionStore);
  const [server, setServer] = useState(serverUrl);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [overlayOk, setOverlayOk] = useState(true);

  useEffect(() => {
    const check = () => activeMeeting.overlayAllowed().then(setOverlayOk);
    check();
    const sub = AppState.addEventListener('change', (st) => st === 'active' && check());
    return () => sub.remove();
  }, []);

  if (!session) return null;

  const save = async () => {
    setChecking(true);
    setStatus(null);
    const url = await sessionStore.setServerUrl(server);
    setServer(url);
    const ok = await api.health();
    setStatus(ok ? { ok: true, text: `Connected to ${url}` } : { ok: false, text: `Saved, but ${url} did not answer. Is the backend running and on the same Wi-Fi?` });
    setChecking(false);
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(session.displayName[0] ?? '?').toUpperCase()}</Text>
        </View>
        <Text style={styles.name}>{session.displayName}</Text>
        <Text style={styles.meta}>@{session.userId}</Text>
        <Text style={[styles.badge, session.role === 'admin' && styles.badgeAdmin]}>{session.role === 'admin' ? 'Admin' : 'Member'}</Text>
      </View>

      <Text style={styles.section}>Server</Text>
      <TextInput style={styles.input} value={server} onChangeText={setServer} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="http://192.168.1.20:8000" />
      <TouchableOpacity style={[styles.btn, checking && styles.disabled]} onPress={save} disabled={checking}>
        {checking ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Save and test connection</Text>}
      </TouchableOpacity>
      {status && <Text style={status.ok ? styles.ok : styles.error}>{status.text}</Text>}

      <Text style={styles.section}>Meetings</Text>
      <View style={styles.row}>
        <Text style={styles.flex}>Floating window during meetings</Text>
        <Text style={overlayOk ? styles.ok : styles.error}>{overlayOk ? 'Allowed' : 'Not allowed'}</Text>
      </View>
      {!overlayOk && (
        <TouchableOpacity onPress={() => activeMeeting.openOverlaySettings()}>
          <Text style={styles.link}>Allow "Display over other apps"</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.section}>About</Text>
      <Text style={styles.meta}>AL Balag {Constants.expoConfig?.version ?? ''}</Text>

      <TouchableOpacity style={styles.signOut} onPress={onSignOut} accessibilityLabel="Sign out">
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: 16, gap: 10 },
  header: { alignItems: 'center', gap: 4, marginBottom: 8 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 30, fontWeight: '800' },
  name: { fontSize: 22, fontWeight: '800', color: colors.text },
  meta: { color: colors.textMuted },
  badge: { backgroundColor: colors.surfaceAlt, color: colors.textMuted, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, overflow: 'hidden', fontWeight: '700' },
  badgeAdmin: { backgroundColor: colors.primary, color: '#fff' },
  section: { fontSize: 13, fontWeight: '800', color: colors.textMuted, marginTop: 14, textTransform: 'uppercase', letterSpacing: 1 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 16 },
  btn: { backgroundColor: colors.primary, borderRadius: 10, padding: 12, alignItems: 'center' },
  disabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ok: { color: colors.success, fontWeight: '600' },
  error: { color: colors.error },
  link: { color: colors.primary, fontWeight: '600' },
  signOut: { marginTop: 24, borderWidth: 1, borderColor: colors.error, borderRadius: 10, padding: 12, alignItems: 'center' },
  signOutText: { color: colors.error, fontWeight: '700' },
});
