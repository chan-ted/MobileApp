import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { supabase } from '@/lib/supabase';

export async function pickAndUploadAvatar(userId: string): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Permission to access photo library is required.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.7,
  });

  if (result.canceled || !result.assets?.[0]) {
    return null;
  }

  const asset = result.assets[0];
  const fileExt = asset.uri.split('.').pop()?.toLowerCase() || 'jpg';
  const contentType = asset.mimeType || `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`;
  const filePath = `${userId}/avatar.${fileExt}`;

  // Read binary bytes directly using expo-file-system's File class
  const file = new File(asset.uri);
  const fileBytes = await file.bytes();

  if (!fileBytes || fileBytes.byteLength < 100) {
    throw new Error('Selected image file appears empty or unreadable.');
  }

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(filePath, fileBytes, {
      contentType,
      upsert: true,
    });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
  const publicUrl = `${data.publicUrl}?t=${Date.now()}`;

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ avatar_url: publicUrl })
    .eq('id', userId);

  if (profileError) throw profileError;

  return publicUrl;
}