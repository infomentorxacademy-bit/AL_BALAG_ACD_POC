import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, RefreshControl, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { useStore } from '../chat/store';
import { portal } from '../controllers';
import { timeAgo, validateAnnouncement } from '../logic';
import type { Announcement } from '../services/api';
import { colors } from '../theme';

export default function AnnouncementsScreen({ isAdmin }: { isAdmin: boolean }) {
  const s = useStore(portal);
  const [composing, setComposing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const unread = s.announcements.filter((a) => !a.read).length;

  const refresh = async () => {
    setRefreshing(true);
    await portal.refresh();
    setRefreshing(false);
  };

  const confirmDelete = (a: Announcement) =>
    Alert.alert('Delete announcement?', a.title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => portal.deleteAnnouncement(a.id).catch((e) => Alert.alert('Could not delete', String(e?.message ?? e))),
      },
    ]);

  if (s.loading) return <ActivityIndicator style={styles.flex} size="large" />;

  return (
    <View style={styles.flex}>
      {s.error && (
        <TouchableOpacity onPress={refresh} style={styles.errorBar}>
          <Text style={styles.errorText}>Could not refresh: {s.error}. Tap to retry.</Text>
        </TouchableOpacity>
      )}
      {unread > 0 && (
        <TouchableOpacity onPress={() => portal.markAllRead()} style={styles.markAll}>
          <Text style={styles.link}>Mark all {unread} as read</Text>
        </TouchableOpacity>
      )}
      <FlatList
        data={s.announcements}
        keyExtractor={(a) => String(a.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        contentContainerStyle={s.announcements.length === 0 ? styles.emptyWrap : styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No announcements yet</Text>
            <Text style={styles.emptyText}>{isAdmin ? 'Tap "New announcement" to tell everyone something.' : 'Messages from your admins show up here.'}</Text>
          </View>
        }
        renderItem={({ item: a }) => (
          <TouchableOpacity
            style={[styles.card, !a.read && styles.cardUnread]}
            onPress={() => portal.markRead(a.id)}
            onLongPress={isAdmin ? () => confirmDelete(a) : undefined}
            accessibilityLabel={`announcement ${a.title}`}
          >
            <View style={styles.row}>
              {!a.read && <View style={styles.dot} accessibilityLabel="unread" />}
              {a.pinned && <Text style={styles.pin}>{'📌'}</Text>}
              <Text style={styles.cardTitle}>{a.title}</Text>
            </View>
            <Text style={styles.cardBody}>{a.body}</Text>
            <Text style={styles.meta}>
              {a.authorName} {'·'} {timeAgo(a.createdAt)}
            </Text>
            {isAdmin && (
              <TouchableOpacity onPress={() => confirmDelete(a)} accessibilityLabel={`delete ${a.title}`}>
                <Text style={styles.delete}>Delete</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        )}
      />
      {isAdmin && (
        <TouchableOpacity style={styles.fab} onPress={() => setComposing(true)} accessibilityLabel="new announcement">
          <Text style={styles.fabText}>{'📣'}  New announcement</Text>
        </TouchableOpacity>
      )}
      <Composer visible={composing} onClose={() => setComposing(false)} />
    </View>
  );
}

function Composer({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setTitle('');
    setBody('');
    setPinned(false);
    setError(null);
    onClose();
  };

  const send = async () => {
    const problem = validateAnnouncement(title, body);
    setError(problem);
    if (problem) return;
    setBusy(true);
    try {
      await portal.createAnnouncement({ title: title.trim(), body: body.trim(), pinned });
      close();
    } catch (e) {
      setError(`Could not send: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <View style={styles.modal}>
        <Text style={styles.modalTitle}>New announcement</Text>
        <Text style={styles.hint}>Everyone who uses the app will see it.</Text>
        <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Title" maxLength={120} />
        <TextInput
          style={[styles.input, styles.multiline]}
          value={body}
          onChangeText={setBody}
          placeholder="Message"
          multiline
          maxLength={4000}
        />
        <View style={styles.switchRow}>
          <Text style={styles.cardBody}>Pin to the top</Text>
          <Switch value={pinned} onValueChange={setPinned} />
        </View>
        {error && <Text style={styles.error}>{error}</Text>}
        <View style={styles.actions}>
          <TouchableOpacity onPress={close} style={styles.secondary}>
            <Text style={styles.link}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={send} style={[styles.btn, busy && styles.disabled]} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Send to everyone</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: 12, gap: 10, paddingBottom: 90 },
  emptyWrap: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', padding: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  emptyText: { color: colors.textMuted, marginTop: 6, textAlign: 'center' },
  card: { backgroundColor: colors.surfaceAlt, borderRadius: 12, padding: 14, gap: 6 },
  cardUnread: { borderLeftWidth: 4, borderColor: colors.primary },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primary },
  pin: { fontSize: 14 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text, flex: 1 },
  cardBody: { color: colors.text },
  meta: { color: colors.textMuted, fontSize: 12 },
  delete: { color: colors.error, fontWeight: '600', marginTop: 4 },
  markAll: { paddingHorizontal: 16, paddingTop: 10 },
  link: { color: colors.primary, fontWeight: '600' },
  errorBar: { backgroundColor: '#fde8e6', padding: 10 },
  errorText: { color: colors.error },
  fab: { position: 'absolute', right: 16, bottom: 16, backgroundColor: colors.primary, borderRadius: 28, paddingHorizontal: 20, paddingVertical: 14, elevation: 4 },
  fabText: { color: '#fff', fontWeight: '700' },
  modal: { flex: 1, padding: 20, gap: 12, backgroundColor: colors.surface },
  modalTitle: { fontSize: 22, fontWeight: '800', color: colors.text },
  hint: { color: colors.textMuted },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 16 },
  multiline: { minHeight: 140, textAlignVertical: 'top' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  error: { color: colors.error },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 16, marginTop: 8 },
  secondary: { padding: 12 },
  btn: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 18, alignItems: 'center' },
  disabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '700' },
});
