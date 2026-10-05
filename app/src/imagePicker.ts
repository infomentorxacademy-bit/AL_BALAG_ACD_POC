import * as ImagePicker from 'expo-image-picker';

import type { PickedImage } from './chat/conversationController';

/** Opens the photo gallery; returns null if the user cancels. */
export async function pickImageFromGallery(): Promise<PickedImage | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.85,
    allowsEditing: false,
  });
  if (result.canceled || result.assets.length === 0) return null;
  const a = result.assets[0];
  return {
    uri: a.uri,
    name: a.fileName ?? `photo-${Date.now()}.jpg`,
    type: a.mimeType ?? 'image/jpeg',
    size: a.fileSize ?? 0,
  };
}
