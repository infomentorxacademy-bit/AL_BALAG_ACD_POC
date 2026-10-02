import { useState } from 'react';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import ChatScreen from './src/screens/ChatScreen';
import MeetingScreen from './src/screens/MeetingScreen';

type Tab = 'chat' | 'meeting';

export default function App() {
  const [userId, setUserId] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [tab, setTab] = useState<Tab>('chat');

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root}>
        <StatusBar style="dark" />
        {!loggedIn ? (
          <View style={styles.login}>
            <Text style={styles.title}>AL Balag POC</Text>
            <Text style={styles.sub}>Sendbird Chat + Zoom Meeting SDK</Text>
            <TextInput
              style={styles.input}
              value={userId}
              onChangeText={setUserId}
              placeholder="Enter a user id (e.g. alice)"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.btn, !userId.trim() && styles.disabled]}
              disabled={!userId.trim()}
              onPress={() => setLoggedIn(true)}
            >
              <Text style={styles.btnText}>Continue</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.tabs}>
              {(['chat', 'meeting'] as Tab[]).map((t) => (
                <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
                  <Text style={tab === t ? styles.tabTextActive : styles.tabText}>{t === 'chat' ? 'Chat' : 'Meeting'}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.flex}>
              {/* Keep chat mounted so the connection and messages persist across tab switches. */}
              <View style={[styles.flex, tab !== 'chat' && styles.hidden]}>
                <ChatScreen userId={userId.trim()} />
              </View>
              {tab === 'meeting' && <MeetingScreen userId={userId.trim()} />}
            </View>
          </>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  flex: { flex: 1 },
  hidden: { display: 'none' },
  login: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 26, fontWeight: '700' },
  sub: { color: '#667', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
  btn: { backgroundColor: '#2d6cdf', borderRadius: 8, padding: 14, alignItems: 'center' },
  disabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontWeight: '600' },
  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#ccc' },
  tab: { flex: 1, padding: 14, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderColor: '#2d6cdf' },
  tabText: { color: '#667' },
  tabTextActive: { color: '#2d6cdf', fontWeight: '600' },
});
