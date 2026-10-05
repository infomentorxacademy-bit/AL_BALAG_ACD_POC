import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { parseUserIds } from '../chat/parse';
import type { ChatChannel } from '../chat/types';
import { channelList } from '../controllers';
import { colors } from '../theme';

/** Bottom sheet to start a direct chat or a group. Calls [onCreated] with the new channel. */
export default function NewChatModal({
  visible,
  myUserId,
  onClose,
  onCreated,
}: {
  visible: boolean;
  myUserId: string;
  onClose: () => void;
  onCreated: (channel: ChatChannel) => void;
}) {
  const [ids, setIds] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = parseUserIds(ids, myUserId);
  const isGroup = parsed.length > 1;

  const close = () => {
    setIds('');
    setName('');
    setError(null);
    setBusy(false);
    onClose();
  };

  const create = async () => {
    if (parsed.length === 0) return setError('Enter at least one user id.');
    setBusy(true);
    setError(null);
    try {
      const channel = await channelList.createChannel(parsed, name);
      setIds('');
      setName('');
      setBusy(false);
      onCreated(channel);
    } catch (e) {
      setBusy(false);
      setError(
        `Could not start the chat. Check that every user id exists in Sendbird.\n${e instanceof Error ? e.message : String(e)}`,
      );
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.flex} onPress={close} />
        <View style={styles.sheet}>
          <Text style={styles.title}>New chat</Text>
          <Text style={styles.hint}>
            Type one user id for a direct chat, or several separated by commas for a group.
          </Text>
          <Text style={styles.label}>User id(s)</Text>
          <TextInput
            style={styles.input}
            value={ids}
            onChangeText={setIds}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="e.g. bob   or   bob, carol"
          />
          {isGroup && (
            <>
              <Text style={styles.label}>Group name (optional)</Text>
              <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Project X" />
            </>
          )}
          {error && <Text style={styles.error}>{error}</Text>}
          <TouchableOpacity
            style={[styles.btn, (busy || parsed.length === 0) && styles.disabled]}
            disabled={busy || parsed.length === 0}
            onPress={create}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{isGroup ? 'Create group' : 'Start chat'}</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20, gap: 6 },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  hint: { color: colors.textMuted, marginBottom: 8 },
  label: { fontWeight: '600', marginTop: 8, color: colors.text },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 16 },
  error: { color: colors.error, marginTop: 8 },
  btn: { marginTop: 16, backgroundColor: colors.primary, borderRadius: 10, padding: 14, alignItems: 'center' },
  disabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
