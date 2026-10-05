import { Alert, Modal, Pressable, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { canDelete, canEdit, canReplyTo, isDelivered, quickReactions } from '../chat/types';
import type { ChatMessage } from '../chat/types';
import { conversation } from '../controllers';
import { colors } from '../theme';

/** Bottom sheet for a long-pressed message: react, reply, copy/share, edit, delete. */
export default function MessageActionsModal({ message, onClose }: { message: ChatMessage | null; onClose: () => void }) {
  if (!message) return null;

  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };

  const confirmDelete = () =>
    Alert.alert('Delete message?', 'It will be removed for everyone in this chat.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => conversation.delete(message) },
    ]);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
          {isDelivered(message) && (
            <View style={styles.emojiRow}>
              {quickReactions.map((emoji) => (
                <TouchableOpacity key={emoji} onPress={run(() => conversation.toggleReaction(message, emoji))}>
                  <Text style={styles.emoji}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {canReplyTo(message) && <Action label="Reply" onPress={run(() => conversation.startReply(message))} />}
          {message.kind === 'text' && (
            <Action
              label="Share / copy text"
              onPress={run(() => {
                Share.share({ message: message.text }).catch(() => undefined);
              })}
            />
          )}
          {canEdit(message) && <Action label="Edit" onPress={run(() => conversation.startEdit(message))} />}
          {(canDelete(message) || (message.isMine && !isDelivered(message))) && (
            <Action label="Delete" destructive onPress={run(confirmDelete)} />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Action({ label, onPress, destructive }: { label: string; onPress: () => void; destructive?: boolean }) {
  return (
    <TouchableOpacity style={styles.action} onPress={onPress}>
      <Text style={[styles.actionText, destructive && { color: colors.error }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingVertical: 8 },
  emojiRow: { flexDirection: 'row', justifyContent: 'space-evenly', paddingVertical: 10 },
  emoji: { fontSize: 30 },
  action: { paddingHorizontal: 22, paddingVertical: 16 },
  actionText: { fontSize: 16, color: colors.text },
});
