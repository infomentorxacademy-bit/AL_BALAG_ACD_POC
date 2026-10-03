import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/config.dart';
import '../../core/providers.dart';

const _apiBaseUrlKey = 'api_base_url';

/// Backend address, editable at runtime so a phone on Wi-Fi can reach a laptop
/// without rebuilding the app.
class ApiBaseUrlController extends Notifier<String> {
  @override
  String build() {
    final prefs = ref.watch(sharedPreferencesProvider);
    return prefs.getString(_apiBaseUrlKey) ??
        ref.watch(appConfigProvider).defaultApiBaseUrl;
  }

  /// Returns false when [input] is not a valid http(s) address.
  Future<bool> update(String input) async {
    final normalized = normalizeBaseUrl(input);
    if (normalized == null) return false;
    await ref.read(sharedPreferencesProvider).setString(_apiBaseUrlKey, normalized);
    state = normalized;
    return true;
  }

  Future<void> reset() async {
    await ref.read(sharedPreferencesProvider).remove(_apiBaseUrlKey);
    state = ref.read(appConfigProvider).defaultApiBaseUrl;
  }
}

final apiBaseUrlProvider =
    NotifierProvider<ApiBaseUrlController, String>(ApiBaseUrlController.new);
