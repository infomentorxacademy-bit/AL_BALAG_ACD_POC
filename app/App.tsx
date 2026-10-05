import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { useStore } from './src/chat/store';
import type { ChatChannel } from './src/chat/types';
import NewChatModal from './src/components/NewChatModal';
import { channelList } from './src/controllers';
import ChannelListScreen from './src/screens/ChannelListScreen';
import ConversationScreen from './src/screens/ConversationScreen';
import LoginScreen from './src/screens/LoginScreen';
import MeetingScreen from './src/screens/MeetingScreen';
import { clearSession, loadSession, saveSession } from './src/storage';
import type { Session } from './src/storage';
import { colors } from './src/theme';

type Tab = 'chats' | 'meeting';

export default function App() {
  // undefined = still reading storage, null = signed out.
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>('chats');
  const [open, setOpen] = useState<ChatChannel | null>(null);
  const [newChat, setNewChat] = useState(false);
  const list = useStore(channelList);

  const startChat = useCallback((s: Session) => {
    channelList.start(s.userId, s.displayName);
  }, []);

  useEffect(() => {
    loadSession().then((s) => {
      setSession(s);
      if (s) startChat(s);
    });
  }, [startChat]);

  // Android back button closes the open conversation instead of leaving the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (open) {
        setOpen(null);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [open]);

  const signIn = async (userId: string, displayName: string) => {
    const s = { userId, displayName };
    await saveSession(s);
    setSession(s);
    startChat(s);
  };

  const signOut = () =>
    Alert.alert('Sign out?', `Signed in as ${session?.userId}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          setOpen(null);
          await channelList.stop();
          await clearSession();
          setSession(null);
          setTab('chats');
        },
      },
    ]);

  let body;
  if (session === undefined) {
    body = <ActivityIndicator style={styles.flex} size="large" />;
  } else if (session === null) {
    body = <LoginScreen onSubmit={signIn} />;
  } else if (open) {
    body = <ConversationScreen channel={open} myUserId={session.userId} onBack={() => setOpen(null)} />;
  } else {
    const unread = list.channels.reduce((n, c) => n + c.unreadCount, 0);
    body = (
      <>
        <View style={styles.appBar}>
          <Text style={styles.appBarTitle}>{tab === 'chats' ? 'Chats' : 'Meeting'}</Text>
          <TouchableOpacity onPress={signOut} style={styles.avatar} accessibilityLabel="Account">
            <Text style={styles.avatarText}>{(session.displayName[0] ?? '?').toUpperCase()}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.flex}>
          {/* Keep chats mounted so the connection and list persist across tab switches. */}
          <View style={[styles.flex, tab !== 'chats' && styles.hidden]}>
            <ChannelListScreen onOpen={setOpen} onRetry={() => startChat(session)} />
            {tab === 'chats' && list.phase === 'ready' && (
              <TouchableOpacity style={styles.fab} onPress={() => setNewChat(true)}>
                <Text style={styles.fabText}>{'✎'}  New chat</Text>
              </TouchableOpacity>
            )}
          </View>
          {tab === 'meeting' && <MeetingScreen userId={session.userId} displayName={session.displayName} />}
        </View>
        <View style={styles.tabs}>
          <TabButton label="Chats" badge={unread} active={tab === 'chats'} onPress={() => setTab('chats')} />
          <TabButton label="Meeting" active={tab === 'meeting'} onPress={() => setTab('meeting')} />
        </View>
        <NewChatModal
          visible={newChat}
          myUserId={session.userId}
          onClose={() => setNewChat(false)}
          onCreated={(c) => {
            setNewChat(false);
            setOpen(c);
          }}
        />
      </>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root}>
        <StatusBar style="dark" />
        {body}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function TabButton({ label, active, onPress, badge }: { label: string; active: boolean; onPress: () => void; badge?: number }) {
  return (
    <TouchableOpacity style={[styles.tab, active && styles.tabActive]} onPress={onPress}>
      <Text style={active ? styles.tabTextActive : styles.tabText}>
        {label}
        {badge ? `  (${badge > 99 ? '99+' : badge})` : ''}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  hidden: { display: 'none' },
  appBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  appBarTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700' },
  fab: { position: 'absolute', right: 16, bottom: 16, backgroundColor: colors.primary, borderRadius: 28, paddingHorizontal: 20, paddingVertical: 14, elevation: 4 },
  fabText: { color: '#fff', fontWeight: '700' },
  tabs: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  tab: { flex: 1, padding: 14, alignItems: 'center' },
  tabActive: { borderTopWidth: 2, borderColor: colors.primary },
  tabText: { color: colors.textMuted },
  tabTextActive: { color: colors.primary, fontWeight: '700' },
});
