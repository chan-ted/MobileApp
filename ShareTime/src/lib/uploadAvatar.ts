import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';

export async function pickAndUploadAvatar(userId: string): Promise<string | null> {
  // 1. Ask for photo library permission
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Permission to access photo library is required.');
  }

  // 2. Open image picker (cropped square for avatars)
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

  // Store inside `<userId>/avatar.<ext>` so RLS allows it and overwrites old avatar cleanly
  const filePath = `${userId}/avatar.${fileExt}`;

  // 3. Convert local URI to ArrayBuffer
  const response = await fetch(asset.uri);
  const arrayBuffer = await response.arrayBuffer();

  // 4. Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(filePath, arrayBuffer, {
      contentType,
      upsert: true,
    });

  if (uploadError) throw uploadError;

  // 5. Get public URL (append timestamp so React Native refreshes cached image)
  const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
  const publicUrlWithCacheBust = `${data.publicUrl}?t=${Date.now()}`;

  // 6. Save URL to profiles table
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ avatar_url: publicUrlWithCacheBust })
    .eq('id', userId);

  if (profileError) throw profileError;

  return publicUrlWithCacheBust;
}