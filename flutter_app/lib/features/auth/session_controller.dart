import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';

class UserSession {
  const UserSession({required this.userId, required this.displayName});

  final String userId;
  final String displayName;
}

const _userIdKey = 'user_id';
const _displayNameKey = 'display_name';

/// Validates a Sendbird user id: non-empty, no whitespace, at most 80 chars.
String? validateUserId(String? value) {
  final v = value?.trim() ?? '';
  if (v.isEmpty) return 'Enter a user id';
  if (v.contains(RegExp(r'\s'))) return 'No spaces allowed';
  if (v.length > 80) return 'At most 80 characters';
  return null;
}

/// The signed-in user (null when signed out). Persisted so the app reopens signed in.
class SessionController extends Notifier<UserSession?> {
  @override
  UserSession? build() {
    final prefs = ref.watch(sharedPreferencesProvider);
    final id = prefs.getString(_userIdKey);
    if (id == null || id.isEmpty) return null;
    return UserSession(userId: id, displayName: prefs.getString(_displayNameKey) ?? id);
  }

  Future<void> signIn({required String userId, String? displayName}) async {
    final id = userId.trim();
    final name = (displayName?.trim().isNotEmpty ?? false) ? displayName!.trim() : id;
    final prefs = ref.read(sharedPreferencesProvider);
    await prefs.setString(_userIdKey, id);
    await prefs.setString(_displayNameKey, name);
    state = UserSession(userId: id, displayName: name);
  }

  Future<void> signOut() async {
    final prefs = ref.read(sharedPreferencesProvider);
    await prefs.remove(_userIdKey);
    await prefs.remove(_displayNameKey);
    state = null;
  }
}

final sessionProvider =
    NotifierProvider<SessionController, UserSession?>(SessionController.new);
