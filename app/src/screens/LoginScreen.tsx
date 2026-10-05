import { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { validateUserId } from '../logic';
import { colors } from '../theme';

export default function LoginScreen({ onSubmit }: { onSubmit: (userId: string, displayName: string) => void }) {
  const [userId, setUserId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const problem = validateUserId(userId);
    setError(problem);
    if (!problem) onSubmit(userId.trim(), displayName.trim() || userId.trim());
  };

  return (
    <View style={styles.login}>
      <Text style={styles.title}>AL Balag POC</Text>
      <Text style={styles.sub}>Sendbird Chat + Zoom Meeting SDK</Text>
      <TextInput
        style={styles.input}
        value={userId}
        onChangeText={setUserId}
        placeholder="User id (e.g. alice)"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <TextInput
        style={styles.input}
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="Display name (optional)"
        onSubmitEditing={submit}
      />
      <TouchableOpacity style={styles.btn} onPress={submit}>
        <Text style={styles.btnText}>Continue</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  login: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 28, fontWeight: '800', color: colors.text },
  sub: { color: colors.textMuted, marginBottom: 12 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 16 },
  error: { color: colors.error, marginTop: -6 },
  btn: { backgroundColor: colors.primary, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 4 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
