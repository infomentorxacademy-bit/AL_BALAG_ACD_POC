import { StyleSheet, Text, View } from 'react-native';

import type { ChatChannel } from '../chat/types';

const PALETTE = ['#e53935', '#8e24aa', '#3949ab', '#1e88e5', '#00897b', '#43a047', '#f4511e', '#6d4c41'];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Round avatar: the first letter of the name (direct) or a group glyph, on a colour derived from the name. */
export default function ChannelAvatar({ channel, size = 48 }: { channel: ChatChannel; size?: number }) {
  const bg = PALETTE[hash(channel.title) % PALETTE.length];
  const glyph = channel.isDirect || !channel.title ? (channel.title[0] ?? '?').toUpperCase() : '\u{1F465}';
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
      <Text style={[styles.text, { fontSize: size * 0.42 }]}>{glyph}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
  text: { color: '#fff', fontWeight: '700' },
});
