
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

console.log('Supabase Config:', {
  url: supabaseUrl,
  keyLength: supabaseAnonKey.length,
  keyStart: supabaseAnonKey.substring(0, 5) + '...',
  keyEnd: '...' + supabaseAnonKey.substring(supabaseAnonKey.length - 5)
});

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('CRITICAL: Supabase URL ou Anon Key não encontradas no .env.local');
  console.error('URL:', supabaseUrl);
  console.error('Key:', supabaseAnonKey ? '[REDACTED]' : 'undefined');
}

export const supabase = createClient(
  supabaseUrl || '',
  supabaseAnonKey || '',
  {
    auth: {
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    }
  }
);
