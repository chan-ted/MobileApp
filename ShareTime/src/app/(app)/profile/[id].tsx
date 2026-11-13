import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  ActivityIndicator, 
  Alert, 
  ScrollView,
  KeyboardAvoidingView,
  Platform 
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';

type Profile = {
  id: string;
  email: string;
  full_name?: string;
  bio?: string;
};

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Editable Form States
  const [fullName, setFullName] = useState('');
  const [bio, setBio] = useState('');

  // Follow System States
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  useEffect(() => {
    fetchProfileData();
  }, [id]);

  async function fetchProfileData() {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);

      // Determine target profile ID (if no ID passed or 'me', default to current user)
      const targetId = (!id || id === 'me') ? user.id : id;
      const ownerCheck = targetId === user.id;
      setIsOwner(ownerCheck);

      // 1. Fetch Profile Details
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', targetId)
        .single();

      if (profileError) throw profileError;

      setProfile(profileData);
      setFullName(profileData.full_name || '');
      setBio(profileData.bio || '');

      // 2. If viewing someone else, check follow status
      if (!ownerCheck) {
        const { data: followData } = await supabase
          .from('follows')
          .select('*')
          .eq('follower_id', user.id)
          .eq('following_id', targetId)
          .maybeSingle();

        setIsFollowing(!!followData);
      }
    } catch (error: any) {
      console.error('Error fetching profile:', error.message);
      Alert.alert('Error', 'Could not load profile.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveProfile() {
    if (!currentUserId) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          bio: bio.trim(),
        })
        .eq('id', currentUserId);

      if (error) throw error;

      setProfile(prev => prev ? { ...prev, full_name: fullName.trim(), bio: bio.trim() } : null);
      setIsEditing(false);
      Alert.alert('Success', 'Profile updated successfully!');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  }

  async function handleToggleFollow() {
    if (!currentUserId || !profile) return;

    try {
      setFollowLoading(true);
      if (isFollowing) {
        // Unfollow
        const { error } = await supabase
          .from('follows')
          .delete()
          .eq('follower_id', currentUserId)
          .eq('following_id', profile.id);

        if (error) throw error;
        setIsFollowing(false);
      } else {
        // Follow
        const { error } = await supabase
          .from('follows')
          .insert({
            follower_id: currentUserId,
            following_id: profile.id,
          });

        if (error) throw error;
        setIsFollowing(true);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setFollowLoading(false);
    }
  }

  async function handleSignOut() {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      router.replace('/login');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  }

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={{ flex: 1, backgroundColor: '#F8F9FA' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.container}>
{/* Header */}
<View style={styles.headerRow}>
  {/* Show back button if there is history to go back to, regardless of who owns the profile */}
  {router.canGoBack() ? (
    <TouchableOpacity style={styles.iconButton} onPress={() => router.back()}>
      <Ionicons name="arrow-back" size={20} color="#111" />
    </TouchableOpacity>
  ) : (
    <View style={{ width: 40 }} /> // Spacer to keep the title centered when no back button is present
  )}

  <Text style={styles.headerTitle}>{isOwner ? 'My Profile' : 'User Profile'}</Text>
  
  <View style={{ width: 40 }} />
</View>
        {/* Profile Card */}
        <View style={styles.card}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatarCircle}>
              <Ionicons name="person" size={40} color="#007AFF" />
            </View>
          </View>

          {/* Email (Always read-only) */}
          <Text style={styles.label}>Email</Text>
          <Text style={styles.emailText}>{profile?.email}</Text>

          {/* Full Name */}
          <Text style={styles.label}>Full Name</Text>
          {isOwner && isEditing ? (
            <TextInput 
              style={styles.input}
              value={fullName}
              onChangeText={setFullName}
              placeholder="Enter your full name"
            />
          ) : (
            <Text style={styles.valueText}>{profile?.full_name || 'No full name provided.'}</Text>
          )}

          {/* Bio */}
          <Text style={styles.label}>Bio</Text>
          {isOwner && isEditing ? (
            <TextInput 
              style={[styles.input, styles.textArea]}
              value={bio}
              onChangeText={setBio}
              placeholder="Tell others a bit about yourself..."
              multiline
            />
          ) : (
            <Text style={styles.valueText}>{profile?.bio || 'No bio provided.'}</Text>
          )}

          {/* Action Buttons for Owner */}
          {isOwner && (
            <View style={styles.actionSection}>
              {isEditing ? (
                <View style={styles.editRow}>
                  <TouchableOpacity style={styles.cancelButton} onPress={() => setIsEditing(false)}>
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.saveButton} onPress={handleSaveProfile}>
                    <Text style={styles.saveButtonText}>Save Changes</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.editProfileButton} onPress={() => setIsEditing(true)}>
                  <Ionicons name="create-outline" size={18} color="#007AFF" />
                  <Text style={styles.editProfileButtonText}>Edit Profile</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
                <Ionicons name="log-out-outline" size={18} color="#EF4444" />
                <Text style={styles.signOutButtonText}>Sign Out</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Action Button for Non-Owners (Follow / Unfollow) */}
          {!isOwner && (
            <TouchableOpacity 
              style={[styles.followButton, isFollowing && styles.followingButton]} 
              onPress={handleToggleFollow}
              disabled={followLoading}
            >
              <Text style={[styles.followButtonText, isFollowing && styles.followingButtonText]}>
                {isFollowing ? 'Following' : 'Follow'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#F8F9FA', paddingTop: 60, paddingHorizontal: 16, paddingBottom: 30 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8F9FA' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  iconButton: { backgroundColor: '#FFF', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#EFEFEF' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#111' },
  
  card: { backgroundColor: '#FFF', padding: 20, borderRadius: 16, borderWidth: 1, borderColor: '#EFEFEF', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
  avatarContainer: { alignItems: 'center', marginBottom: 20 },
  avatarCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#EBF3FF', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#CCE0FF' },

  label: { fontSize: 12, fontWeight: '600', color: '#666', marginTop: 14 },
  emailText: { fontSize: 15, color: '#333', fontWeight: '500', marginTop: 4 },
  valueText: { fontSize: 15, color: '#111', fontWeight: '500', marginTop: 4, lineHeight: 20 },

  input: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#DDD', padding: 10, borderRadius: 8, fontSize: 15, color: '#111', marginTop: 4 },
  textArea: { height: 80, textAlignVertical: 'top' },

  actionSection: { marginTop: 24, borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingTop: 16, gap: 12 },
  editProfileButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: '#EBF3FF', padding: 12, borderRadius: 8, gap: 6 },
  editProfileButtonText: { color: '#007AFF', fontWeight: '600', fontSize: 15 },
  
  editRow: { flexDirection: 'row', gap: 10 },
  cancelButton: { flex: 1, backgroundColor: '#F1F3F5', padding: 12, borderRadius: 8, alignItems: 'center' },
  cancelButtonText: { color: '#495057', fontWeight: '600' },
  saveButton: { flex: 1, backgroundColor: '#007AFF', padding: 12, borderRadius: 8, alignItems: 'center' },
  saveButtonText: { color: '#FFF', fontWeight: '600' },

  signOutButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: '#FEF2F2', padding: 12, borderRadius: 8, gap: 6 },
  signOutButtonText: { color: '#EF4444', fontWeight: '600', fontSize: 15 },

  followButton: { backgroundColor: '#007AFF', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 24 },
  followingButton: { backgroundColor: '#F1F3F5', borderWidth: 1, borderColor: '#DDD' },
  followButtonText: { color: '#FFF', fontWeight: '600', fontSize: 15 },
  followingButtonText: { color: '#333' },
});