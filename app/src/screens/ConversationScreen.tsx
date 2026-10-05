import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';

import { useStore } from '../chat/store';
import type { ChatChannel, ChatMessage } from '../chat/types';
import { memberName, previewText } from '../chat/types';
import ChannelAvatar from '../components/ChannelAvatar';
import MessageActionsModal from '../components/MessageActionsModal';
import MessageBubble from '../components/MessageBubble';
import { channelList, conversation } from '../controllers';
import { formatDay, sameDay } from '../format';
import { colors } from '../theme';

/** One open conversation: messages, typing indicator, composer. */
export default function ConversationScreen({
  channel,
  myUserId,
  onBack,
}: {
  channel: ChatChannel;
  myUserId: string;
  onBack: () => void;
}) {
  const chat = useStore(conversation);
  const connection = useStore(channelList).connection;
  const [text, setText] = useState('');
  const [actionsFor, setActionsFor] = useState<ChatMessage | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [membersOpen, setMembersOpen] = useState(false);
  const input = useRef<TextInput>(null);

  useEffect(() => {
    conversation.open(channel);
    return () => conversation.close();
  }, [channel]);

  // Reply: jump to the text field. Edit: fill it with the message's text.
  const replyId = chat.replyingTo?.id;
  useEffect(() => {
    if (replyId) input.current?.focus();
  }, [replyId]);
  const editId = chat.editing?.id;
  useEffect(() => {
    if (chat.editing) {
      setText(chat.editing.text);
      input.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  // One-off problems show as a toast.
  useEffect(() => {
    if (!chat.notice) return;
    if (Platform.OS === 'android') ToastAndroid.show(chat.notice, ToastAndroid.SHORT);
    else Alert.alert(chat.notice);
    conversation.clearNotice();
  }, [chat.notice]);

  const current = chat.channel ?? channel;
  const editing = !!chat.editing;
  const offline = connection === 'offline';

  const send = () => {
    const body = text;
    if (!body.trim()) return;
    setText('');
    conversation.send(body);
  };

  const cancelEdit = () => {
    conversation.cancelEdit();
    setText('');
  };

  const subtitle = (() => {
    if (chat.typingNames.length > 0) {
      return chat.typingNames.length === 1
        ? `${chat.typingNames[0]} is typing…`
        : `${chat.typingNames.join(', ')} are typing…`;
    }
    if (connection === 'connecting') return 'Connecting…';
    if (connection === 'reconnecting') return 'Reconnecting…';
    if (connection === 'offline') return 'Offline';
    return current.isDirect ? 'Direct chat' : `${current.memberCount} member${current.memberCount === 1 ? '' : 's'}`;
  })();

  const leave = () =>
    Alert.alert('Leave this chat?', 'It disappears from your list. You can be added again later.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          try {
            await channelList.leave(current.url);
            onBack();
          } catch (e) {
            Alert.alert('Could not leave', String(e));
          }
        },
      },
    ]);

  // Newest first for an inverted list.
  const newestFirst = useMemo(() => [...chat.messages].reverse(), [chat.messages]);

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.back} accessibilityLabel="Back">
          <Text style={styles.backText}>{'←'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerBody} onPress={() => setMembersOpen(true)}>
          <ChannelAvatar channel={current} size={38} />
          <View style={styles.flex}>
            <Text style={styles.title} numberOfLines={1}>
              {current.title}
            </Text>
            <Text style={[styles.subtitle, chat.typingNames.length > 0 && { color: colors.primary }]} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={leave} style={styles.back} accessibilityLabel="Leave chat">
          <Text style={styles.leave}>Leave</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.flex}>
          {chat.phase === 'loading' || chat.phase === 'idle' ? (
            <ActivityIndicator style={styles.flex} size="large" />
          ) : chat.phase === 'error' ? (
            <View style={styles.center}>
              <Text style={styles.errorText}>{chat.error ?? 'Something went wrong.'}</Text>
              <TouchableOpacity style={styles.retry} onPress={() => conversation.open(channel)}>
                <Text style={styles.retryText}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : chat.messages.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.empty}>No messages yet.{'\n'}Say hello {'\u{1F44B}'}</Text>
            </View>
          ) : (
            <FlatList
              data={newestFirst}
              inverted
              keyExtractor={(m) => m.id}
              contentContainerStyle={styles.list}
              onEndReached={() => conversation.loadOlder()}
              onEndReachedThreshold={0.4}
              ListHeaderComponent={
                chat.typingNames.length > 0 ? (
                  <View style={styles.typing}>
                    <Text style={styles.typingText}>
                      {chat.typingNames.length === 1 ? `${chat.typingNames[0]} is typing…` : 'Several people are typing…'}
                    </Text>
                  </View>
                ) : null
              }
              ListFooterComponent={chat.loadingMore ? <ActivityIndicator style={styles.more} /> : null}
              renderItem={({ item, index }) => {
                // In an inverted list the "previous" (older) message is at index + 1.
                const older = newestFirst[index + 1];
                const showDate = !older || !sameDay(older.createdAt, item.createdAt);
                const grouped =
                  !!older && !showDate && older.senderId === item.senderId && item.createdAt - older.createdAt < 5 * 60000;
                return (
                  <View>
                    {showDate && (
                      <View style={styles.dateWrap}>
                        <Text style={styles.date}>{formatDay(item.createdAt)}</Text>
                      </View>
                    )}
                    <MessageBubble
                      message={item}
                      showSender={!grouped}
                      myUserId={myUserId}
                      onLongPress={setActionsFor}
                      onToggleReaction={(m, k) => conversation.toggleReaction(m, k)}
                      onRetry={(m) => conversation.retry(m)}
                      onOpenImage={setViewerUrl}
                    />
                  </View>
                );
              }}
            />
          )}
        </View>

        {chat.phase === 'ready' && (
          <>
            {chat.editing && (
              <InfoBar title="Editing message" text={chat.editing.text} onClose={cancelEdit} closeLabel="Cancel edit" />
            )}
            {chat.replyingTo && (
              <InfoBar
                title={`Replying to ${chat.replyingTo.isMine ? 'yourself' : chat.replyingTo.senderName}`}
                text={previewText(chat.replyingTo)}
                onClose={() => conversation.cancelReply()}
                closeLabel="Cancel reply"
              />
            )}
            <View style={styles.composer}>
              <TouchableOpacity
                style={styles.attach}
                disabled={offline || editing}
                onPress={() => conversation.sendImage()}
                accessibilityLabel="Send a photo"
              >
                <Text style={[styles.attachText, (offline || editing) && { opacity: 0.35 }]}>{'\u{1F5BC}️'}</Text>
              </TouchableOpacity>
              <TextInput
                ref={input}
                style={styles.input}
                value={text}
                onChangeText={(t) => {
                  setText(t);
                  conversation.onTextChanged(t);
                }}
                editable={!offline}
                multiline
                placeholder={offline ? 'Offline. Waiting to reconnect…' : editing ? 'Edit message' : 'Message'}
              />
              <TouchableOpacity
                style={[styles.send, (offline || !text.trim()) && styles.sendOff]}
                disabled={offline || !text.trim()}
                onPress={send}
                accessibilityLabel={editing ? 'Save' : 'Send'}
              >
                <Text style={styles.sendText}>{editing ? '✓' : '➤'}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </KeyboardAvoidingView>

      <MessageActionsModal message={actionsFor} onClose={() => setActionsFor(null)} />

      <Modal visible={viewerUrl !== null} transparent animationType="fade" onRequestClose={() => setViewerUrl(null)}>
        <Pressable style={styles.viewer} onPress={() => setViewerUrl(null)}>
          {viewerUrl && <Image source={{ uri: viewerUrl }} style={styles.viewerImage} resizeMode="contain" />}
        </Pressable>
      </Modal>

      <Modal visible={membersOpen} transparent animationType="slide" onRequestClose={() => setMembersOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setMembersOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <Text style={styles.sheetTitle}>
              {current.memberCount} member{current.memberCount === 1 ? '' : 's'}
            </Text>
            {current.members.map((m) => (
              <View key={m.userId} style={styles.member}>
                <View style={styles.memberAvatar}>
                  <Text style={styles.memberInitial}>{memberName(m)[0]?.toUpperCase()}</Text>
                </View>
                <View>
                  <Text style={styles.memberName}>{memberName(m)}</Text>
                  {m.nickname ? <Text style={styles.memberId}>{m.userId}</Text> : null}
                </View>
              </View>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function InfoBar({ title, text, onClose, closeLabel }: { title: string; text: string; onClose: () => void; closeLabel: string }) {
  return (
    <View style={styles.infoBar}>
      <View style={styles.infoStripe} />
      <View style={styles.flex}>
        <Text style={styles.infoTitle}>{title}</Text>
        <Text numberOfLines={1} style={styles.infoText}>
          {text}
        </Text>
      </View>
      <TouchableOpacity onPress={onClose} accessibilityLabel={closeLabel} style={styles.infoClose}>
        <Text style={styles.infoCloseText}>{'✕'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  back: { paddingHorizontal: 14, paddingVertical: 6 },
  backText: { fontSize: 22, color: colors.text },
  leave: { color: colors.error, fontWeight: '600' },
  headerBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 12, color: colors.textMuted },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 },
  errorText: { textAlign: 'center', color: colors.text },
  retry: { backgroundColor: colors.surfaceAlt, borderRadius: 10, paddingHorizontal: 22, paddingVertical: 12 },
  retryText: { color: colors.primary, fontWeight: '700' },
  empty: { textAlign: 'center', fontSize: 16, color: colors.textMuted },
  list: { paddingHorizontal: 12, paddingVertical: 8 },
  more: { padding: 16 },
  dateWrap: { alignItems: 'center', marginVertical: 12 },
  date: { backgroundColor: colors.surfaceAlt, color: colors.textMuted, fontSize: 11, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, overflow: 'hidden' },
  typing: { alignSelf: 'flex-start', backgroundColor: colors.bubbleOther, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8, marginTop: 6 },
  typingText: { fontStyle: 'italic', color: colors.textMuted },
  composer: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 6, paddingVertical: 6, gap: 6, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  attach: { paddingHorizontal: 8, paddingBottom: 10 },
  attachText: { fontSize: 22 },
  input: { flex: 1, maxHeight: 120, borderRadius: 22, backgroundColor: colors.surfaceAlt, paddingHorizontal: 16, paddingVertical: 10, fontSize: 16 },
  send: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  sendOff: { opacity: 0.4 },
  sendText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  infoBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceAlt, paddingLeft: 14, paddingVertical: 6 },
  infoStripe: { width: 3, height: 36, backgroundColor: colors.primary, marginRight: 10 },
  infoTitle: { color: colors.primary, fontWeight: '700', fontSize: 12.5 },
  infoText: { color: colors.text },
  infoClose: { padding: 12 },
  infoCloseText: { fontSize: 16, color: colors.textMuted },
  viewer: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '100%' },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 10 },
  sheetTitle: { fontSize: 17, fontWeight: '700', marginBottom: 6, color: colors.text },
  member: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  memberAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  memberInitial: { color: '#fff', fontWeight: '700' },
  memberName: { fontSize: 15, color: colors.text },
  memberId: { fontSize: 12, color: colors.textMuted },
});
