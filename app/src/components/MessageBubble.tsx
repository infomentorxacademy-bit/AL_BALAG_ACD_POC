import { memo } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { formatTime } from '../format';
import { reactedBy } from '../chat/types';
import type { ChatMessage } from '../chat/types';
import { colors } from '../theme';

interface Props {
  message: ChatMessage;
  showSender: boolean;
  myUserId: string;
  onLongPress: (m: ChatMessage) => void;
  onToggleReaction: (m: ChatMessage, key: string) => void;
  onRetry: (m: ChatMessage) => void;
  onOpenImage: (url: string) => void;
}

function MessageBubble({ message, showSender, myUserId, onLongPress, onToggleReaction, onRetry, onOpenImage }: Props) {
  const mine = message.isMine;
  const fg = mine ? colors.onPrimary : colors.text;
  const isImage = message.kind === 'image';
  const imageUri = message.attachmentUrl ?? message.localPath;

  return (
    <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs, { marginTop: showSender ? 8 : 2 }]}>
      {!mine && showSender && <Text style={styles.sender}>{message.senderName}</Text>}
      <TouchableOpacity
        activeOpacity={0.85}
        onLongPress={() => onLongPress(message)}
        style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs, isImage && styles.bubbleImage]}
      >
        {message.replyTo && (
          <View style={[styles.quote, { borderLeftColor: fg }]}>
            <Text style={[styles.quoteName, { color: fg }]}>{message.replyTo.senderName}</Text>
            <Text style={[styles.quoteText, { color: fg }]} numberOfLines={2}>
              {message.replyTo.text}
            </Text>
          </View>
        )}
        {isImage && imageUri && (
          <TouchableOpacity
            disabled={!message.attachmentUrl}
            onPress={() => message.attachmentUrl && onOpenImage(message.attachmentUrl)}
          >
            <View>
              <Image source={{ uri: imageUri }} style={styles.image} resizeMode="cover" />
              {message.status === 'sending' && (
                <View style={styles.uploading}>
                  <Text style={styles.uploadingText}>Uploading{'…'}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        )}
        {message.kind === 'file' && (
          <Text style={{ color: fg }}>
            {'\u{1F4CE} '}
            {message.attachmentName ?? 'File'}
          </Text>
        )}
        {message.text.length > 0 && <Text style={[styles.text, { color: fg }]}>{message.text}</Text>}
        <View style={styles.meta}>
          {message.edited && <Text style={[styles.metaText, { color: fg }]}>edited  </Text>}
          <Text style={[styles.metaText, { color: fg }]}>{formatTime(message.createdAt)}</Text>
          {mine && <Status message={message} color={fg} />}
        </View>
      </TouchableOpacity>
      {message.reactions.length > 0 && (
        <View style={styles.reactions}>
          {message.reactions.map((r) => (
            <TouchableOpacity
              key={r.key}
              style={[styles.chip, reactedBy(r, myUserId) && styles.chipMine]}
              onPress={() => onToggleReaction(message, r.key)}
            >
              <Text style={styles.chipText}>
                {r.key} {r.userIds.length}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {message.status === 'failed' && (
        <TouchableOpacity onPress={() => onRetry(message)}>
          <Text style={styles.retry}>{'↻'} Not sent. Tap to retry</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function Status({ message, color }: { message: ChatMessage; color: string }) {
  if (message.status === 'sending') return <Text style={[styles.tick, { color }]}> {'\u{1F551}'}</Text>;
  if (message.status === 'failed') return <Text style={[styles.tick, { color: colors.error }]}> {'⚠'}</Text>;
  return (
    <Text style={[styles.tick, { color: message.seen ? colors.seen : color }]}>
      {' '}
      {message.seen ? '✓✓' : '✓'}
    </Text>
  );
}

export default memo(MessageBubble);

const styles = StyleSheet.create({
  row: { maxWidth: '82%' },
  rowMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  rowTheirs: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  sender: { fontSize: 11, color: colors.primary, marginLeft: 12, marginBottom: 2 },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9 },
  bubbleMine: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: colors.bubbleOther, borderBottomLeftRadius: 4 },
  bubbleImage: { padding: 4 },
  text: { fontSize: 15.5 },
  quote: { borderLeftWidth: 3, paddingLeft: 8, marginBottom: 6, opacity: 0.85 },
  quoteName: { fontSize: 11.5, fontWeight: '700' },
  quoteText: { fontSize: 13 },
  image: { width: 230, height: 170, borderRadius: 14 },
  uploading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  uploadingText: { color: '#fff', fontWeight: '600' },
  meta: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 3 },
  metaText: { fontSize: 10.5, opacity: 0.7 },
  tick: { fontSize: 11 },
  reactions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 3 },
  chip: { borderRadius: 14, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: 'transparent' },
  chipMine: { backgroundColor: '#dbe7ff', borderColor: colors.primary },
  chipText: { fontSize: 13 },
  retry: { color: colors.error, marginTop: 4, fontSize: 13 },
});
