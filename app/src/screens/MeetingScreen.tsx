import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, AppState, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';

import { useStore } from '../chat/store';
import { config } from '../config';
import { activeMeeting } from '../controllers';
import { addRecent, formatMeetingNumber, friendlyTokenError, isValidMeetingNumber, normalizeBaseUrl } from '../logic';
import { loadRecentMeetings, loadServerUrl, saveRecentMeetings, saveServerUrl } from '../storage';
import { colors } from '../theme';
import { fetchZoomSignature } from '../services/zoomApi';

/** Ask about the floating-window permission once per app run (not on every join). */
let askedOverlay = false;

export default function MeetingScreen({ userId, displayName }: { userId: string; displayName: string }) {
  const [meetingNumber, setMeetingNumber] = useState('');
  const [password, setPassword] = useState('');
  // Editable so a phone can point at the PC running the backend without rebuilding the app.
  const [serverUrl, setServerUrl] = useState(config.apiBaseUrl);
  const [recent, setRecent] = useState<string[]>([]);
  const meeting = useStore(activeMeeting);
  const [overlayOk, setOverlayOk] = useState(true);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    loadServerUrl().then((u) => u && setServerUrl(u));
    loadRecentMeetings().then(setRecent);
  }, []);

  // Is the floating mini window allowed? Re-check when the user comes back from the system settings.
  useEffect(() => {
    const check = () => activeMeeting.overlayAllowed().then(setOverlayOk);
    check();
    const sub = AppState.addEventListener('change', (st) => st === 'active' && check());
    return () => sub.remove();
  }, []);

  // Show why a join attempt failed (for example Zoom refused the meeting number).
  useEffect(() => {
    if (meeting.error) {
      setFormError(meeting.error);
      activeMeeting.clearError();
    }
  }, [meeting.error]);

  const join = async (numberOverride?: string) => {
    // Zoom is a native module: it is absent in Expo Go and only exists in a dev/production build.
    if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
      Alert.alert('Dev build required', 'Zoom needs a development build (npx expo run:android / run:ios), not Expo Go.');
      return;
    }
    const mn = (numberOverride ?? meetingNumber).replace(/\s/g, '');
    if (!mn) return setFormError('Enter the meeting number');
    if (!isValidMeetingNumber(mn)) return setFormError('A meeting number has 9 to 11 digits');
    setFormError(null);
    if (!(await activeMeeting.overlayAllowed()) && !askedOverlay) {
      askedOverlay = true;
      const choice = await new Promise<'allow' | 'skip'>((resolve) =>
        Alert.alert(
          'Keep the meeting in a small window?',
          'To keep using the app while you are in a meeting, allow "Display over other apps". Zoom then shows a small floating window you can tap to go back to full screen.',
          [
            { text: 'Not now', style: 'cancel', onPress: () => resolve('skip') },
            { text: 'Allow', onPress: () => resolve('allow') },
          ],
          { cancelable: false },
        ),
      );
      if (choice === 'allow') {
        await activeMeeting.openOverlaySettings();
        setFormError('After allowing it, come back and tap Join meeting again.');
        return;
      }
    }
    setBusy(true);
    try {
      const base = normalizeBaseUrl(serverUrl);
      const jwtToken = await fetchZoomSignature(mn, 0, base);
      saveServerUrl(base).catch(() => undefined);
      const next = addRecent(recent, mn);
      setRecent(next);
      saveRecentMeetings(next).catch(() => undefined);
      activeMeeting.start({ jwtToken, meetingNumber: mn, password, userName: displayName || userId });
    } catch (e) {
      setFormError(friendlyTokenError(e, normalizeBaseUrl(serverUrl)));
    } finally {
      setBusy(false);
    }
  };

  if (meeting.phase !== 'idle' && meeting.session) {
    const joining = meeting.phase === 'joining';
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.heading}>{joining ? 'Joining the meeting\u2026' : 'You are in a meeting'}</Text>
        <Text style={styles.number}>{formatMeetingNumber(meeting.session.meetingNumber)}</Text>
        {joining ? (
          <ActivityIndicator style={{ marginTop: 16 }} />
        ) : (
          <TouchableOpacity style={styles.btn} onPress={() => activeMeeting.returnToMeeting()}>
            <Text style={styles.btnText}>Return to meeting</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.hint2}>
          Tip: in the meeting, tap the minimize button (top left). The meeting shrinks to a small window and you can
          keep using chat. Tap the small window, or "Return" above, to go back to full screen.
        </Text>
        {!overlayOk && (
          <View style={styles.warn}>
            <Text style={styles.warnText}>
              The small floating window is off because "Display over other apps" is not allowed.
            </Text>
            <TouchableOpacity onPress={() => activeMeeting.openOverlaySettings()}>
              <Text style={styles.link}>Allow floating window</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>Join a Zoom meeting</Text>
      <Text style={styles.hint}>
        Joining as <Text style={styles.bold}>{displayName || userId}</Text>. Until the Zoom app is published you can
        only join meetings hosted by your own Zoom account.
      </Text>

      <Text style={styles.label}>Backend server</Text>
      <TextInput
        style={styles.input}
        value={serverUrl}
        onChangeText={setServerUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        placeholder="http://192.168.1.20:8000"
      />
      <Text style={styles.label}>Meeting number</Text>
      <TextInput
        style={styles.input}
        value={meetingNumber}
        onChangeText={setMeetingNumber}
        keyboardType="number-pad"
        placeholder="123 4567 8901"
      />
      <Text style={styles.label}>Passcode (if required)</Text>
      <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="Passcode" />

      {formError && <Text style={styles.error}>{formError}</Text>}

      <TouchableOpacity style={[styles.btn, busy && styles.disabled]} onPress={() => join()} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Join meeting</Text>}
      </TouchableOpacity>

      {recent.length > 0 && (
        <>
          <Text style={[styles.label, { marginTop: 24 }]}>Recent</Text>
          {recent.map((m) => (
            <TouchableOpacity key={m} style={styles.recent} onPress={() => join(m)} disabled={busy}>
              <Text style={styles.recentText}>{formatMeetingNumber(m)}</Text>
              <Text style={styles.link}>Join</Text>
            </TouchableOpacity>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, flexGrow: 1 },
  heading: { fontSize: 20, fontWeight: '700', color: colors.text },
  hint: { color: colors.textMuted, marginTop: 4, marginBottom: 8 },
  bold: { fontWeight: '700', color: colors.text },
  label: { marginTop: 12, marginBottom: 4, fontWeight: '600', color: colors.text },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 16 },
  error: { color: colors.error, marginTop: 12 },
  btn: { marginTop: 20, backgroundColor: colors.primary, borderRadius: 10, padding: 14, alignItems: 'center' },
  disabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  linkBtn: { marginTop: 24, alignItems: 'center' },
  link: { color: colors.primary, fontWeight: '600' },
  recent: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  recentText: { fontSize: 16, color: colors.text },
  number: { fontSize: 24, fontWeight: '800', color: colors.text, marginTop: 8 },
  hint2: { color: colors.textMuted, marginTop: 24 },
  warn: { marginTop: 20, backgroundColor: '#fff3d6', borderRadius: 10, padding: 12, gap: 8 },
  warnText: { color: colors.text },
});
