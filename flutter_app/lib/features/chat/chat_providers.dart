import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/providers.dart';
import 'chat_service.dart';
import 'sendbird_chat_service.dart';

final chatServiceProvider = Provider<ChatService>((ref) {
  return SendbirdChatService(appId: ref.watch(appConfigProvider).sendbirdAppId);
});

/// Opens the photo gallery and returns the chosen file's path (or null if cancelled).
/// A provider so tests can replace it.
final imagePickerProvider = Provider<Future<String?> Function()>((ref) {
  return () async {
    final picked = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 85, maxWidth: 2048);
    return picked?.path;
  };
});
