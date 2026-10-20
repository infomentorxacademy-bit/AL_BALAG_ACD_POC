import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { colors } from '../theme';

/** A banner at the top of the app, for example "New announcement". Tap to open, X to dismiss. */
export default function Toast({ title, body, onOpen, onDismiss }: { title: string; body: string; onOpen: () => void; onDismiss: () => void }) {
  return (
    <View style={styles.toast} accessibilityLiveRegion="polite" accessibilityLabel="notification">
      <TouchableOpacity style={styles.flex} onPress={onOpen}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.body} numberOfLines={1}>
          {body}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onDismiss} accessibilityLabel="Dismiss notification" hitSlop={12}>
        <Text style={styles.x}>{'✕'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.text, paddingHorizontal: 16, paddingVertical: 10 },
  title: { color: '#fff', fontWeight: '700' },
  body: { color: '#d0d5dd' },
  x: { color: '#fff', fontSize: 16 },
});
