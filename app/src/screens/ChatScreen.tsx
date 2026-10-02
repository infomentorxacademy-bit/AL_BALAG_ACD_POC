import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { GroupChannel } from '@sendbird/chat/groupChannel';
import type { BaseMessage, UserMessage } from '@sendbird/chat/message';

import * as chat from '../services/sendbird';

export default function ChatScreen({ userId }: { userId: string }) {
  const [channel, setChannel] = useState<GroupChannel | null>(null);
  const [messages, setMessages] = useState<BaseMessage[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<FlatList<BaseMessage>>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        await chat.connect(userId);
        const ch = await chat.joinDemoRoom();
        const history = await chat.loadHistory(ch);
        if (cancelled) return;
        setChannel(ch);
        setMessages(history);
        unsubscribe = chat.onMessage(ch.url, (m) => setMessages((prev) => [...prev, m]));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [userId]);

  const send = async () => {
    const body = text.trim();
    if (!channel || !body) return;
    setText('');
    try {
      const sent = await chat.sendText(channel, body);
      setMessages((prev) => [...prev, sent]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (error) return <Text style={styles.error}>{error}</Text>;
  if (!channel) return <ActivityIndicator style={styles.center} size="large" />;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => String(m.messageId)}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => {
          const msg = item as UserMessage;
          const mine = msg.sender?.userId === userId;
          return (
            <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
              {!mine && <Text style={styles.sender}>{msg.sender?.nickname || msg.sender?.userId}</Text>}
              <Text style={mine ? styles.mineText : undefined}>{msg.message}</Text>
            </View>
          );
        }}
      />
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Type a message"
          onSubmitEditing={send}
          returnKeyType="send"
        />
        <TouchableOpacity style={styles.sendBtn} onPress={send}>
          <Text style={styles.sendText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1 },
  error: { color: '#b00020', padding: 16 },
  list: { padding: 12, gap: 8 },
  bubble: { maxWidth: '80%', padding: 10, borderRadius: 12 },
  mine: { alignSelf: 'flex-end', backgroundColor: '#2d6cdf' },
  mineText: { color: '#fff' },
  theirs: { alignSelf: 'flex-start', backgroundColor: '#eceff4' },
  sender: { fontSize: 11, color: '#667', marginBottom: 2 },
  inputRow: { flexDirection: 'row', padding: 8, gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderColor: '#ccc' },
  input: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  sendBtn: { backgroundColor: '#2d6cdf', borderRadius: 20, paddingHorizontal: 18, justifyContent: 'center' },
  sendText: { color: '#fff', fontWeight: '600' },
});
