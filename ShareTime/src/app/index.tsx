import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        router.replace('/(app)');
      } else {
        router.replace('/login');
      }
    });
  }, []);

  return null;
}