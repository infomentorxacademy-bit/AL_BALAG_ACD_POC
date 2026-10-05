import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useStore } from '../chat/store';
import type { ChatChannel } from '../chat/types';
import ChannelAvatar from '../components/ChannelAvatar';
import { channelList } from '../controllers';
import { formatListTime } from '../format';
import { colors } from '../theme';

/** The "Chats" tab: all my conversations with unread badges. */
export default function ChannelListScreen({
  onOpen,
  onRetry,
}: {
  onOpen: (channel: ChatChannel) => void;
  onRetry: () => void;
}) {
  const state = useStore(channelList);
  const [refreshing, setRefreshing] = useState(false);

  if (state.phase === 'idle' || state.phase === 'loading') {
    return <ActivityIndicator style={styles.flex} size="large" />;
  }
  if (state.phase === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.cloud}>{'☁️'}</Text>
        <Text style={styles.errorText}>{state.error ?? 'Something went wrong.'}</Text>
        <TouchableOpacity style={styles.retry} onPress={onRetry}>
          <Text style={styles.retryText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const confirmLeave = (channel: ChatChannel) =>
    Alert.alert(`Leave "${channel.title}"?`, 'It disappears from your list. You can be added again later.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: () => {
          channelList.leave(channel.url).catch((e) => Alert.alert('Could not leave', String(e)));
        },
      },
    ]);

  return (
    <View style={styles.flex}>
      {state.connection !== 'online' && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            {state.connection === 'offline'
              ? 'Offline. Waiting to reconnect…'
              : state.connection === 'reconnecting'
                ? 'Reconnecting…'
                : 'Connecting…'}
          </Text>
        </View>
      )}
      <FlatList
        data={state.channels}
        keyExtractor={(c) => c.url}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await channelList.refresh();
              setRefreshing(false);
            }}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No chats yet</Text>
            <Text style={styles.emptyText}>Tap "New chat" to message someone by their user id.</Text>
          </View>
        }
        renderItem={({ item }) => <Row channel={item} onOpen={onOpen} onLongPress={confirmLeave} />}
        contentContainerStyle={state.channels.length === 0 ? styles.flexGrow : undefined}
      />
    </View>
  );
}

function Row({
  channel,
  onOpen,
  onLongPress,
}: {
  channel: ChatChannel;
  onOpen: (c: ChatChannel) => void;
  onLongPress: (c: ChatChannel) => void;
}) {
  const unread = channel.unreadCount;
  return (
    <TouchableOpacity style={styles.row} onPress={() => onOpen(channel)} onLongPress={() => onLongPress(channel)}>
      <ChannelAvatar channel={channel} />
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, unread > 0 && styles.bold]} numberOfLines={1}>
          {channel.title}
        </Text>
        <Text style={[styles.rowSub, unread > 0 && styles.subUnread]} numberOfLines={1}>
          {channel.lastMessage ?? 'No messages yet'}
        </Text>
      </View>
      <View style={styles.rowEnd}>
        {channel.lastMessage !== undefined && channel.lastMessageAt !== undefined && (
          <Text style={[styles.time, unread > 0 && { color: colors.primary }]}>{formatListTime(channel.lastMessageAt)}</Text>
        )}
        {unread > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unread > 99 ? '99+' : String(unread)}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexGrow: { flexGrow: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  cloud: { fontSize: 44 },
  errorText: { textAlign: 'center', color: colors.text },
  retry: { backgroundColor: colors.surfaceAlt, borderRadius: 10, paddingHorizontal: 22, paddingVertical: 12 },
  retryText: { color: colors.primary, fontWeight: '700' },
  banner: { backgroundColor: '#fff3d6', paddingHorizontal: 16, paddingVertical: 6 },
  bannerText: { color: colors.text, fontSize: 12 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  emptyText: { color: colors.textMuted, textAlign: 'center', marginTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 12 },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 16, color: colors.text, fontWeight: '500' },
  bold: { fontWeight: '800' },
  rowSub: { color: colors.textMuted, marginTop: 2 },
  subUnread: { color: colors.text, fontWeight: '600' },
  rowEnd: { alignItems: 'flex-end', gap: 4 },
  time: { fontSize: 11, color: colors.textMuted },
  badge: { minWidth: 20, borderRadius: 10, backgroundColor: colors.primary, paddingHorizontal: 6, paddingVertical: 2, alignItems: 'center' },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
});
