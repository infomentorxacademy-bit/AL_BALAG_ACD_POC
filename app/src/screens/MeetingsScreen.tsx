import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { useStore } from '../chat/store';
import { activeMeeting, portal } from '../controllers';
import {
  addRecent,
  formatMeetingNumber,
  formatWhen,
  meetingTiming,
  parseIds,
  parseLocalDateTime,
  toDateInput,
  toTimeInput,
  validateMeetingForm,
} from '../logic';
import { startJoin } from '../meeting/joinFlow';
import type { ScheduledMeeting } from '../services/api';
import { loadRecentMeetings, saveRecentMeetings } from '../storage';
import { colors } from '../theme';

type Mode = 'scheduled' | 'manual';

export default function MeetingsScreen({ userId, displayName, isAdmin }: { userId: string; displayName: string; isAdmin: boolean }) {
  const meeting = useStore(activeMeeting);
  const [mode, setMode] = useState<Mode>('scheduled');
  const [overlayOk, setOverlayOk] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

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
      setMode('manual');
      activeMeeting.clearError();
    }
  }, [meeting.error]);

  if (meeting.phase !== 'idle' && meeting.session) {
    return <InMeetingCard overlayOk={overlayOk} />;
  }

  return (
    <View style={styles.flex}>
      <View style={styles.segments}>
        <Segment label="Scheduled" active={mode === 'scheduled'} onPress={() => setMode('scheduled')} />
        <Segment label="Join with ID" active={mode === 'manual'} onPress={() => setMode('manual')} />
      </View>
      {mode === 'scheduled' ? (
        <Schedule displayName={displayName || userId} isAdmin={isAdmin} onError={setFormError} error={formError} />
      ) : (
        <ManualJoin displayName={displayName || userId} error={formError} setError={setFormError} />
      )}
    </View>
  );
}

function Segment({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.segment, active && styles.segmentActive]} onPress={onPress} accessibilityRole="button">
      <Text style={active ? styles.segmentTextActive : styles.segmentText}>{label}</Text>
    </TouchableOpacity>
  );
}

function InMeetingCard({ overlayOk }: { overlayOk: boolean }) {
  const meeting = useStore(activeMeeting);
  const joining = meeting.phase === 'joining';
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>{joining ? 'Joining the meeting…' : 'You are in a meeting'}</Text>
      <Text style={styles.number}>{formatMeetingNumber(meeting.session?.meetingNumber ?? '')}</Text>
      {joining ? (
        <ActivityIndicator style={{ marginTop: 16 }} />
      ) : (
        <TouchableOpacity style={styles.btn} onPress={() => activeMeeting.returnToMeeting()}>
          <Text style={styles.btnText}>Return to meeting</Text>
        </TouchableOpacity>
      )}
      <Text style={styles.hint2}>
        Tip: in the meeting, tap the minimize button (top left). The meeting shrinks to a small window and you can keep
        using chat. Tap the small window, or "Return" above, to go back to full screen.
      </Text>
      {!overlayOk && (
        <View style={styles.warn}>
          <Text style={styles.warnText}>The small floating window is off because "Display over other apps" is not allowed.</Text>
          <TouchableOpacity onPress={() => activeMeeting.openOverlaySettings()}>
            <Text style={styles.link}>Allow floating window</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

// ---- scheduled meetings ----

function Schedule({ displayName, isAdmin, error, onError }: { displayName: string; isAdmin: boolean; error: string | null; onError: (e: string | null) => void }) {
  const s = useStore(portal);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [joiningId, setJoiningId] = useState<number | null>(null);
  const [now, setNow] = useState(() => new Date());

  // "Live" / "Soon" labels follow the clock.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const join = async (m: ScheduledMeeting) => {
    setJoiningId(m.id);
    onError(null);
    const err = await startJoin({ meetingNumber: m.meetingNumber, passcode: m.passcode ?? '', userName: displayName });
    // Only set, never clear here: a fast Zoom refusal may already have put its own message on screen.
    if (err) onError(err);
    setJoiningId(null);
  };

  const confirmDelete = (m: ScheduledMeeting) =>
    Alert.alert('Delete this meeting?', m.title, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => portal.deleteMeeting(m.id).catch((e) => Alert.alert('Could not delete', String(e?.message ?? e))) },
    ]);

  if (s.loading) return <ActivityIndicator style={styles.flex} size="large" />;

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await portal.refresh();
              setRefreshing(false);
            }}
          />
        }
      >
        {error && <Text style={styles.error}>{error}</Text>}
        {s.error && <Text style={styles.error}>Could not refresh the schedule: {s.error}</Text>}
        {s.meetings.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No meetings scheduled</Text>
            <Text style={styles.emptyText}>
              {isAdmin ? 'Tap "Schedule meeting" to add one.' : 'Meetings assigned to you appear here. You can still use "Join with ID".'}
            </Text>
          </View>
        ) : (
          s.meetings.map((m) => {
            const timing = meetingTiming(m.startTime, m.durationMinutes, now);
            return (
              <View key={m.id} style={styles.card} accessibilityLabel={`meeting ${m.title}`}>
                <View style={styles.row}>
                  <Text style={styles.cardTitle}>{m.title}</Text>
                  {timing === 'live' && <Text style={styles.live}>LIVE</Text>}
                  {timing === 'soon' && <Text style={styles.soon}>SOON</Text>}
                </View>
                <Text style={styles.meta}>
                  {formatWhen(m.startTime, now)} {'·'} {m.durationMinutes} min {'·'} {formatMeetingNumber(m.meetingNumber)}
                </Text>
                {!!m.description && <Text style={styles.cardBody}>{m.description}</Text>}
                {isAdmin && (
                  <Text style={styles.meta}>For: {m.assignees.length ? m.assignees.join(', ') : 'everyone'}</Text>
                )}
                <View style={styles.row}>
                  <TouchableOpacity
                    style={[styles.joinBtn, timing === 'past' && styles.disabled]}
                    onPress={() => join(m)}
                    disabled={joiningId !== null}
                    accessibilityLabel={`join ${m.title}`}
                  >
                    {joiningId === m.id ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Join</Text>}
                  </TouchableOpacity>
                  {isAdmin && (
                    <TouchableOpacity onPress={() => confirmDelete(m)} accessibilityLabel={`delete ${m.title}`}>
                      <Text style={styles.delete}>Delete</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
      {isAdmin && (
        <TouchableOpacity style={styles.fab} onPress={() => setCreating(true)} accessibilityLabel="schedule meeting">
          <Text style={styles.fabText}>{'+'}  Schedule meeting</Text>
        </TouchableOpacity>
      )}
      <MeetingForm visible={creating} onClose={() => setCreating(false)} />
    </View>
  );
}

function MeetingForm({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const soon = () => new Date(Date.now() + 60 * 60000);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [meetingNumber, setMeetingNumber] = useState('');
  const [passcode, setPasscode] = useState('');
  const [date, setDate] = useState(() => toDateInput(soon()));
  const [time, setTime] = useState(() => toTimeInput(soon()));
  const [duration, setDuration] = useState('60');
  const [assignees, setAssignees] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const preset = (minutes: number) => {
    const d = new Date(Date.now() + minutes * 60000);
    setDate(toDateInput(d));
    setTime(toTimeInput(d));
  };

  const close = () => {
    setTitle('');
    setDescription('');
    setMeetingNumber('');
    setPasscode('');
    setAssignees('');
    setDuration('60');
    preset(60);
    setError(null);
    onClose();
  };

  const save = async () => {
    const problem = validateMeetingForm({ title, meetingNumber, date, time, duration });
    setError(problem);
    if (problem) return;
    const start = parseLocalDateTime(date, time);
    if (!start) return;
    setBusy(true);
    try {
      await portal.createMeeting({
        title: title.trim(),
        description: description.trim(),
        meetingNumber: meetingNumber.replace(/\D/g, ''),
        passcode: passcode.trim() || null,
        startTime: start.toISOString(),
        durationMinutes: Number(duration),
        assignees: parseIds(assignees),
      });
      close();
    } catch (e) {
      setError(`Could not save: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <ScrollView contentContainerStyle={styles.modal} keyboardShouldPersistTaps="handled">
        <Text style={styles.modalTitle}>Schedule a meeting</Text>
        <Text style={styles.hint}>Create the meeting in Zoom first, then enter its number here.</Text>
        <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Title (e.g. Maths class)" />
        <TextInput style={styles.input} value={description} onChangeText={setDescription} placeholder="Description (optional)" />
        <TextInput style={styles.input} value={meetingNumber} onChangeText={setMeetingNumber} placeholder="Zoom meeting number" keyboardType="number-pad" />
        <TextInput style={styles.input} value={passcode} onChangeText={setPasscode} placeholder="Passcode (optional)" autoCapitalize="none" />
        <View style={styles.row}>
          <TextInput style={[styles.input, styles.flex]} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" autoCapitalize="none" />
          <TextInput style={[styles.input, styles.timeInput]} value={time} onChangeText={setTime} placeholder="HH:MM" autoCapitalize="none" />
        </View>
        <View style={styles.row}>
          <Chip label="In 5 min" onPress={() => preset(5)} />
          <Chip label="In 1 hour" onPress={() => preset(60)} />
          <Chip label="Tomorrow" onPress={() => preset(24 * 60)} />
        </View>
        <TextInput style={styles.input} value={duration} onChangeText={setDuration} placeholder="Duration in minutes" keyboardType="number-pad" />
        <TextInput
          style={styles.input}
          value={assignees}
          onChangeText={setAssignees}
          placeholder="Who? user ids separated by commas (empty = everyone)"
          autoCapitalize="none"
        />
        {error && <Text style={styles.error}>{error}</Text>}
        <View style={styles.actions}>
          <TouchableOpacity onPress={close} style={styles.secondary}>
            <Text style={styles.link}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={save} style={[styles.btnInline, busy && styles.disabled]} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Save meeting</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </Modal>
  );
}

function Chip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.chip} onPress={onPress}>
      <Text style={styles.link}>{label}</Text>
    </TouchableOpacity>
  );
}

// ---- join by meeting id ----

function ManualJoin({ displayName, error, setError }: { displayName: string; error: string | null; setError: (e: string | null) => void }) {
  const [meetingNumber, setMeetingNumber] = useState('');
  const [password, setPassword] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadRecentMeetings().then(setRecent);
  }, []);

  const join = async (numberOverride?: string) => {
    const mn = (numberOverride ?? meetingNumber).replace(/\s/g, '');
    setError(null);
    setBusy(true);
    try {
      const err = await startJoin({ meetingNumber: mn, passcode: password, userName: displayName });
      if (err) setError(err);
      if (!err && mn) {
        const next = addRecent(recent, mn);
        setRecent(next);
        saveRecentMeetings(next).catch(() => undefined);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>Join a Zoom meeting</Text>
      <Text style={styles.hint}>
        Joining as <Text style={styles.bold}>{displayName}</Text>. Until the Zoom app is published you can only join
        meetings hosted by your own Zoom account.
      </Text>
      <Text style={styles.label}>Meeting number</Text>
      <TextInput style={styles.input} value={meetingNumber} onChangeText={setMeetingNumber} keyboardType="number-pad" placeholder="123 4567 8901" />
      <Text style={styles.label}>Passcode (if required)</Text>
      <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="Passcode" />

      {error && <Text style={styles.error}>{error}</Text>}

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
  flex: { flex: 1 },
  container: { padding: 16, flexGrow: 1, gap: 10, paddingBottom: 90 },
  segments: { flexDirection: 'row', margin: 12, backgroundColor: colors.surfaceAlt, borderRadius: 10, padding: 3 },
  segment: { flex: 1, padding: 10, alignItems: 'center', borderRadius: 8 },
  segmentActive: { backgroundColor: colors.surface, elevation: 1 },
  segmentText: { color: colors.textMuted },
  segmentTextActive: { color: colors.primary, fontWeight: '700' },
  heading: { fontSize: 20, fontWeight: '700', color: colors.text },
  hint: { color: colors.textMuted },
  bold: { fontWeight: '700', color: colors.text },
  label: { fontWeight: '600', color: colors.text },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 16 },
  timeInput: { width: 110 },
  error: { color: colors.error },
  btn: { marginTop: 10, backgroundColor: colors.primary, borderRadius: 10, padding: 14, alignItems: 'center' },
  btnInline: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 18, alignItems: 'center' },
  joinBtn: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 22, alignItems: 'center', minWidth: 80 },
  disabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '700' },
  link: { color: colors.primary, fontWeight: '600' },
  recent: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  recentText: { fontSize: 16, color: colors.text },
  number: { fontSize: 24, fontWeight: '800', color: colors.text },
  hint2: { color: colors.textMuted, marginTop: 14 },
  warn: { backgroundColor: '#fff3d6', borderRadius: 10, padding: 12, gap: 8 },
  warnText: { color: colors.text },
  empty: { alignItems: 'center', padding: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  emptyText: { color: colors.textMuted, marginTop: 6, textAlign: 'center' },
  card: { backgroundColor: colors.surfaceAlt, borderRadius: 12, padding: 14, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text, flex: 1 },
  cardBody: { color: colors.text },
  meta: { color: colors.textMuted, fontSize: 13 },
  live: { color: '#fff', backgroundColor: colors.success, fontWeight: '800', fontSize: 11, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
  soon: { color: '#fff', backgroundColor: colors.warning, fontWeight: '800', fontSize: 11, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
  delete: { color: colors.error, fontWeight: '600' },
  fab: { position: 'absolute', right: 16, bottom: 16, backgroundColor: colors.primary, borderRadius: 28, paddingHorizontal: 20, paddingVertical: 14, elevation: 4 },
  fabText: { color: '#fff', fontWeight: '700' },
  modal: { padding: 20, gap: 12, backgroundColor: colors.surface, flexGrow: 1 },
  modalTitle: { fontSize: 22, fontWeight: '800', color: colors.text },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 16, marginTop: 8 },
  secondary: { padding: 12 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
});
