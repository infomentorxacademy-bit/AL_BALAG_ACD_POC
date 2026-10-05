import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useStore } from '../chat/store';
import { activeMeeting } from '../controllers';
import { formatMeetingNumber } from '../logic';
import { colors } from '../theme';

/** Shown on every screen while a Zoom meeting is running: tap Return to bring it back to full screen. */
export default function MeetingBar() {
  const m = useStore(activeMeeting);
  if (m.phase === 'idle' || !m.session) return null;
  const joining = m.phase === 'joining';
  return (
    <View style={styles.bar} accessibilityLabel="meeting bar">
      <View style={styles.dot} />
      <Text style={styles.text} numberOfLines={1}>
        {joining ? 'Joining the meeting…' : `In a meeting · ${formatMeetingNumber(m.session.meetingNumber)}`}
      </Text>
      {!joining && (
        <TouchableOpacity style={styles.btn} onPress={() => activeMeeting.returnToMeeting()}>
          <Text style={styles.btnText}>Return</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#1f7a45', paddingHorizontal: 14, paddingVertical: 8 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#8dffb5' },
  text: { flex: 1, color: '#fff', fontWeight: '600' },
  btn: { backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 5 },
  btnText: { color: '#1f7a45', fontWeight: '800' },
});
