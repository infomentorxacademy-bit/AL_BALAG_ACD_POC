import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, AppState, BackHandler, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { useStore } from './src/chat/store';
import type { ChatChannel } from './src/chat/types';
import MeetingBar from './src/components/MeetingBar';
import NewChatModal from './src/components/NewChatModal';
import Toast from './src/components/Toast';
import { activeMeeting, api, channelList, portal, sessionStore } from './src/controllers';
import AnnouncementsScreen from './src/screens/AnnouncementsScreen';
import ChannelListScreen from './src/screens/ChannelListScreen';
import ConversationScreen from './src/screens/ConversationScreen';
import HomeScreen from './src/screens/HomeScreen';
import type { TabName } from './src/screens/HomeScreen';
import LoginScreen from './src/screens/LoginScreen';
import type { LoginForm } from './src/screens/LoginScreen';
import MeetingsScreen from './src/screens/MeetingsScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import { colors } from './src/theme';

const TITLES: Record<TabName, string> = { home: 'Home', chats: 'Chats', meetings: 'Meetings', news: 'Announcements', profile: 'Profile' };
const TOAST_MS = 8000;

export default function App() {
  const { session, serverUrl } = useStore(sessionStore);
  const [tab, setTab] = useState<TabName>('home');
  const [open, setOpen] = useState<ChatChannel | null>(null);
  const [newChat, setNewChat] = useState(false);
  const list = useStore(channelList);
  const news = useStore(portal);
  const meeting = useStore(activeMeeting);

  useEffect(() => {
    sessionStore.load();
  }, []);

  // Everything that needs a signed-in person starts here and is torn down when they leave
  // (signing out, or the server refusing their token).
  const userId = session?.userId;
  const displayName = session?.displayName;
  const token = session?.token;
  useEffect(() => {
    if (!userId || !token) return;
    channelList.start(userId, displayName ?? userId);
    portal.start();
    return () => {
      setOpen(null);
      setTab('home');
      activeMeeting.end();
      channelList.stop();
      portal.stop();
    };
    // displayName changes must not restart the chat connection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, token]);

  // Coming back to the app (for example from the full-screen meeting): re-check the meeting, refresh the news.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') return;
      activeMeeting.syncWithZoom();
      if (sessionStore.token) portal.refresh();
    });
    return () => sub.remove();
  }, []);

  // Android back button: close the open conversation, then go back to Home, then leave the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (open) {
        setOpen(null);
        return true;
      }
      if (session && tab !== 'home') {
        setTab('home');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [open, tab, session]);

  // A new announcement banner goes away by itself.
  useEffect(() => {
    if (!news.toast) return;
    if (tab === 'news') {
      portal.dismissToast();
      return;
    }
    const t = setTimeout(() => portal.dismissToast(), TOAST_MS);
    return () => clearTimeout(t);
  }, [news.toast, tab]);

  const signIn = useCallback(async (form: LoginForm): Promise<string | null> => {
    await sessionStore.setServerUrl(form.serverUrl);
    const r = await api.login(form.userId, form.displayName, form.adminKey || undefined);
    await sessionStore.signIn({ userId: r.user.userId, displayName: r.user.displayName, token: r.token, role: r.user.role });
    return null;
  }, []);

  const signOut = () =>
    Alert.alert('Sign out?', `Signed in as ${session?.userId}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => sessionStore.signOut() },
    ]);

  let body;
  if (session === undefined) {
    body = <ActivityIndicator style={styles.flex} size="large" />;
  } else if (session === null) {
    body = <LoginScreen serverUrl={serverUrl} onSubmit={signIn} />;
  } else if (open) {
    body = <ConversationScreen channel={open} myUserId={session.userId} onBack={() => setOpen(null)} />;
  } else {
    const unreadChats = list.channels.reduce((n, c) => n + c.unreadCount, 0);
    const unreadNews = news.announcements.filter((a) => !a.read).length;
    body = (
      <>
        <View style={styles.appBar}>
          <Text style={styles.appBarTitle}>{TITLES[tab]}</Text>
        </View>
        {news.toast && tab !== 'news' && (
          <Toast
            title={`New announcement: ${news.toast.title}`}
            body={news.toast.body}
            onOpen={() => {
              portal.dismissToast();
              setTab('news');
            }}
            onDismiss={() => portal.dismissToast()}
          />
        )}
        <View style={styles.flex}>
          {tab === 'home' && <HomeScreen displayName={session.displayName} onNavigate={setTab} />}
          {/* Keep chats mounted so the connection and list persist across tab switches. */}
          <View style={[styles.flex, tab !== 'chats' && styles.hidden]}>
            <ChannelListScreen onOpen={setOpen} onRetry={() => channelList.start(session.userId, session.displayName)} />
            {tab === 'chats' && list.phase === 'ready' && (
              <TouchableOpacity style={styles.fab} onPress={() => setNewChat(true)}>
                <Text style={styles.fabText}>{'✎'}  New chat</Text>
              </TouchableOpacity>
            )}
          </View>
          {tab === 'meetings' && <MeetingsScreen userId={session.userId} displayName={session.displayName} isAdmin={session.role === 'admin'} />}
          {tab === 'news' && <AnnouncementsScreen isAdmin={session.role === 'admin'} />}
          {tab === 'profile' && <ProfileScreen onSignOut={signOut} />}
        </View>
        <View style={styles.tabs}>
          <TabButton label="Home" active={tab === 'home'} onPress={() => setTab('home')} />
          <TabButton label="Chats" badge={unreadChats} active={tab === 'chats'} onPress={() => setTab('chats')} />
          <TabButton label="Meetings" dot={meeting.phase !== 'idle'} active={tab === 'meetings'} onPress={() => setTab('meetings')} />
          <TabButton label="News" badge={unreadNews} active={tab === 'news'} onPress={() => setTab('news')} />
          <TabButton label="Profile" active={tab === 'profile'} onPress={() => setTab('profile')} />
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
        {session ? <MeetingBar /> : null}
        {body}
        {/* The Zoom host lives here, not in the Meetings tab, so the meeting survives tab changes. */}
        {meeting.session ? <ZoomHost session={meeting.session} /> : null}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

/** Invisible host that initializes Zoom and joins. Loaded lazily: the native module is missing in Expo Go. */
function ZoomHost({ session }: { session: NonNullable<typeof activeMeeting.state.session> }) {
  const ZoomRoom = require('./src/screens/ZoomRoom').default;
  return (
    <View style={styles.hidden}>
      <ZoomRoom
        key={`${session.meetingNumber}:${session.jwtToken}`}
        jwtToken={session.jwtToken}
        userName={session.userName}
        meetingNumber={session.meetingNumber}
        password={session.password}
        onJoinResult={(r: string) => activeMeeting.onJoinResult(r)}
      />
    </View>
  );
}

function TabButton({ label, active, onPress, badge, dot }: { label: string; active: boolean; onPress: () => void; badge?: number; dot?: boolean }) {
  return (
    <TouchableOpacity style={[styles.tab, active && styles.tabActive]} onPress={onPress} accessibilityRole="tab" accessibilityLabel={`${label} tab`}>
      <Text style={active ? styles.tabTextActive : styles.tabText}>
        {label}
        {dot ? ' ●' : ''}
      </Text>
      {!!badge && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  hidden: { display: 'none' },
  appBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  appBarTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  fab: { position: 'absolute', right: 16, bottom: 16, backgroundColor: colors.primary, borderRadius: 28, paddingHorizontal: 20, paddingVertical: 14, elevation: 4 },
  fabText: { color: '#fff', fontWeight: '700' },
  tabs: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  tab: { flex: 1, paddingVertical: 14, paddingHorizontal: 2, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 4 },
  tabActive: { borderTopWidth: 2, borderColor: colors.primary },
  tabText: { color: colors.textMuted, fontSize: 12 },
  tabTextActive: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  badge: { backgroundColor: colors.error, minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
});
