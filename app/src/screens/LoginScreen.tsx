import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { friendlyTokenError, normalizeBaseUrl, validateUserId } from '../logic';
import { colors } from '../theme';

export interface LoginForm {
  userId: string;
  displayName: string;
  adminKey: string;
  serverUrl: string;
}

interface Props {
  serverUrl: string;
  /** Resolves to an error message, or null when signed in. */
  onSubmit: (form: LoginForm) => Promise<string | null>;
}

export default function LoginScreen({ serverUrl, onSubmit }: Props) {
  const [userId, setUserId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [adminKey, setAdminKey] = useState('');
  const [server, setServer] = useState(serverUrl);
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    const problem = validateUserId(userId);
    setError(problem);
    if (problem) return;
    setBusy(true);
    try {
      const err = await onSubmit({ userId: userId.trim(), displayName: displayName.trim(), adminKey: adminKey.trim(), serverUrl: server });
      setError(err);
    } catch (e) {
      setError(friendlyTokenError(e, normalizeBaseUrl(server)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.login} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>AL Balag</Text>
        <Text style={styles.sub}>Chat, meetings and announcements in one place</Text>
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
        <TouchableOpacity onPress={() => setAdvanced((a) => !a)} accessibilityRole="button">
          <Text style={styles.link}>{advanced ? 'Hide advanced' : 'Advanced (server, admin)'}</Text>
        </TouchableOpacity>
        {advanced && (
          <View style={styles.advanced}>
            <Text style={styles.label}>Server address</Text>
            <TextInput
              style={styles.input}
              value={server}
              onChangeText={setServer}
              placeholder="http://192.168.1.20:8000"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <Text style={styles.label}>Admin key (only if you are an admin)</Text>
            <TextInput
              style={styles.input}
              value={adminKey}
              onChangeText={setAdminKey}
              placeholder="Admin key"
              secureTextEntry
              autoCapitalize="none"
            />
          </View>
        )}
        <TouchableOpacity style={[styles.btn, busy && styles.disabled]} onPress={submit} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Continue</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  login: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 28, fontWeight: '800', color: colors.text },
  sub: { color: colors.textMuted, marginBottom: 12 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 16 },
  label: { fontWeight: '600', color: colors.text },
  advanced: { gap: 8 },
  link: { color: colors.primary, fontWeight: '600' },
  error: { color: colors.error, marginTop: -6 },
  btn: { backgroundColor: colors.primary, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 4 },
  disabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
