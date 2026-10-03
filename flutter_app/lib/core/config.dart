import 'package:flutter/foundation.dart';

/// Build-time configuration. Override with `--dart-define`, e.g.
/// `flutter run --dart-define=API_BASE_URL=http://192.168.1.20:8000`.
class AppConfig {
  const AppConfig({required this.sendbirdAppId, required this.defaultApiBaseUrl});

  factory AppConfig.fromEnvironment() {
    const sendbirdAppId = String.fromEnvironment(
      'SENDBIRD_APP_ID',
      // Public client identifier (not a secret).
      defaultValue: '6DAEC6E0-174D-497F-8B59-503A0F27B21E',
    );
    const apiBaseUrl = String.fromEnvironment('API_BASE_URL');
    return AppConfig(
      sendbirdAppId: sendbirdAppId,
      defaultApiBaseUrl:
          apiBaseUrl.isNotEmpty ? apiBaseUrl : _platformDefaultApiBaseUrl(),
    );
  }

  final String sendbirdAppId;
  final String defaultApiBaseUrl;

  /// Shared public Sendbird group channel used by the demo.
  static const demoChannelUrl = 'poc-demo-room';
  static const demoChannelName = 'POC Demo Room';

  static String _platformDefaultApiBaseUrl() {
    // The Android emulator reaches the host machine at 10.0.2.2.
    return defaultTargetPlatform == TargetPlatform.android
        ? 'http://10.0.2.2:8000'
        : 'http://localhost:8000';
  }
}

/// Normalizes a user-entered server address, or returns null if invalid.
String? normalizeBaseUrl(String input) {
  var value = input.trim();
  if (value.isEmpty) return null;
  if (!value.contains('://')) value = 'http://$value';
  final uri = Uri.tryParse(value);
  if (uri == null ||
      !(uri.scheme == 'http' || uri.scheme == 'https') ||
      uri.host.isEmpty) {
    return null;
  }
  while (value.endsWith('/')) {
    value = value.substring(0, value.length - 1);
  }
  return value;
}
