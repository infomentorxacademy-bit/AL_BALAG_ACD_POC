import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useStore } from '../chat/store';
import { activeMeeting, channelList, portal } from '../controllers';
import { formatMeetingNumber, formatWhen, meetingTiming, timeAgo } from '../logic';
import { startJoin } from '../meeting/joinFlow';
import { colors } from '../theme';

export type TabName = 'home' | 'chats' | 'meetings' | 'news' | 'profile';

function greeting(now: Date): string {
  const h = now.getHours();
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

/** The landing screen: what is next, what is new, and what needs attention. */
export default function HomeScreen({ displayName, onNavigate }: { displayName: string; onNavigate: (t: TabName) => void }) {
  const p = useStore(portal);
  const chats = useStore(channelList);
  const meeting = useStore(activeMeeting);
  const [now, setNow] = useState(() => new Date());
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const next = p.meetings.find((m) => meetingTiming(m.startTime, m.durationMinutes, now) !== 'past');
  const timing = next ? meetingTiming(next.startTime, next.durationMinutes, now) : null;
  const unreadChats = chats.channels.reduce((n, c) => n + c.unreadCount, 0);
  const unreadNews = p.announcements.filter((a) => !a.read).length;
  const latest = p.announcements.slice(0, 2);

  const join = async () => {
    if (!next) return;
    setJoining(true);
    setError(await startJoin({ meetingNumber: next.meetingNumber, passcode: next.passcode ?? '', userName: displayName }));
    setJoining(false);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.hello}>
        {greeting(now)}, {displayName.split(' ')[0]}
      </Text>

      {meeting.phase !== 'idle' ? (
        <View style={[styles.card, styles.green]}>
          <Text style={styles.cardLabelLight}>IN A MEETING</Text>
          <Text style={styles.titleLight}>{formatMeetingNumber(meeting.session?.meetingNumber ?? '')}</Text>
          <TouchableOpacity style={styles.lightBtn} onPress={() => activeMeeting.returnToMeeting()}>
            <Text style={styles.greenText}>Return to meeting</Text>
          </TouchableOpacity>
        </View>
      ) : p.loading ? (
        <ActivityIndicator style={{ marginVertical: 24 }} />
      ) : next ? (
        <View style={styles.card} accessibilityLabel="next meeting">
          <Text style={styles.cardLabel}>{timing === 'live' ? 'HAPPENING NOW' : 'NEXT MEETING'}</Text>
          <Text style={styles.title}>{next.title}</Text>
          <Text style={styles.meta}>
            {formatWhen(next.startTime, now)} {'·'} {next.durationMinutes} min
          </Text>
          {error && <Text style={styles.error}>{error}</Text>}
          <TouchableOpacity style={[styles.btn, joining && styles.disabled]} onPress={join} disabled={joining} accessibilityLabel="join next meeting">
            {joining ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{timing === 'live' ? 'Join now' : 'Join'}</Text>}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>MEETINGS</Text>
          <Text style={styles.title}>Nothing scheduled</Text>
          <TouchableOpacity onPress={() => onNavigate('meetings')}>
            <Text style={styles.link}>Join with a meeting ID</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.tiles}>
        <TouchableOpacity style={styles.tile} onPress={() => onNavigate('chats')} accessibilityLabel="open chats">
          <Text style={styles.tileNumber}>{unreadChats}</Text>
          <Text style={styles.meta}>unread {unreadChats === 1 ? 'message' : 'messages'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tile} onPress={() => onNavigate('news')} accessibilityLabel="open announcements">
          <Text style={styles.tileNumber}>{unreadNews}</Text>
          <Text style={styles.meta}>new {unreadNews === 1 ? 'announcement' : 'announcements'}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.section}>Latest announcements</Text>
      {latest.length === 0 ? (
        <Text style={styles.meta}>Nothing yet.</Text>
      ) : (
        latest.map((a) => (
          <TouchableOpacity key={a.id} style={styles.news} onPress={() => onNavigate('news')}>
            <Text style={styles.newsTitle}>
              {!a.read ? '• ' : ''}
              {a.title}
            </Text>
            <Text style={styles.meta} numberOfLines={2}>
              {a.body}
            </Text>
            <Text style={styles.meta}>{timeAgo(a.createdAt, now)}</Text>
          </TouchableOpacity>
        ))
      )}
      {p.error && <Text style={styles.error}>Could not refresh: {p.error}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 14 },
  hello: { fontSize: 24, fontWeight: '800', color: colors.text },
  card: { backgroundColor: colors.surfaceAlt, borderRadius: 14, padding: 16, gap: 6 },
  green: { backgroundColor: colors.success },
  cardLabel: { fontSize: 12, fontWeight: '800', color: colors.primary, letterSpacing: 1 },
  cardLabelLight: { fontSize: 12, fontWeight: '800', color: '#d9f5e4', letterSpacing: 1 },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  titleLight: { fontSize: 22, fontWeight: '800', color: '#fff' },
  meta: { color: colors.textMuted },
  btn: { backgroundColor: colors.primary, borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 8 },
  lightBtn: { backgroundColor: '#fff', borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 8 },
  greenText: { color: '#1f7a45', fontWeight: '700' },
  disabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '700' },
  link: { color: colors.primary, fontWeight: '600' },
  error: { color: colors.error },
  tiles: { flexDirection: 'row', gap: 12 },
  tile: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: 14, padding: 16 },
  tileNumber: { fontSize: 28, fontWeight: '800', color: colors.text },
  section: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: 4 },
  news: { backgroundColor: colors.surfaceAlt, borderRadius: 12, padding: 12, gap: 4 },
  newsTitle: { fontWeight: '700', color: colors.text },
});
