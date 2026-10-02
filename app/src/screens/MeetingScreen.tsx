import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';

import { fetchZoomSignature } from '../services/zoomApi';

type Session = { jwtToken: string; meetingNumber: string; password: string };

export default function MeetingScreen({ userId }: { userId: string }) {
  const [meetingNumber, setMeetingNumber] = useState('');
  const [password, setPassword] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);

  const join = async () => {
    // Zoom is a native module: it is absent in Expo Go and only exists in a dev/production build.
    if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
      Alert.alert('Dev build required', 'Zoom needs a development build (npx expo run:android / run:ios), not Expo Go.');
      return;
    }
    const mn = meetingNumber.replace(/\s/g, '');
    if (!mn) return Alert.alert('Enter a meeting number');
    setBusy(true);
    try {
      const jwtToken = await fetchZoomSignature(mn);
      setSession({ jwtToken, meetingNumber: mn, password });
    } catch (e) {
      Alert.alert('Could not get Zoom token', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (session) {
    // Lazy require so the app still boots (chat tab) where the native module is missing.
    const ZoomRoom = require('./ZoomRoom').default;
    return (
      <View style={styles.container}>
        <ZoomRoom {...session} userName={userId} />
        <TouchableOpacity style={styles.linkBtn} onPress={() => setSession(null)}>
          <Text style={styles.link}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Meeting number</Text>
      <TextInput style={styles.input} value={meetingNumber} onChangeText={setMeetingNumber} keyboardType="number-pad" placeholder="123 4567 8901" />
      <Text style={styles.label}>Passcode (if required)</Text>
      <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="Passcode" />
      <TouchableOpacity style={[styles.btn, busy && styles.disabled]} onPress={join} disabled={busy}>
        <Text style={styles.btnText}>{busy ? 'Please wait…' : 'Join Zoom meeting'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  label: { marginTop: 12, marginBottom: 4, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10 },
  btn: { marginTop: 24, backgroundColor: '#2d6cdf', borderRadius: 8, padding: 14, alignItems: 'center' },
  disabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '600' },
  linkBtn: { marginTop: 24, alignItems: 'center' },
  link: { color: '#2d6cdf' },
});
