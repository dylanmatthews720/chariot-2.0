// Supabase client, shared across the whole app.
// Import this anywhere you need to read/write data or check auth:
//   import { supabase } from "@/lib/supabase";

// React Native's JS engine has no built-in URL class, which supabase-js needs.
// This polyfill installs one globally. It must be imported before the client.
import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

// These come from .env. Expo inlines any EXPO_PUBLIC_ variable at build time,
// so process.env reads work in the app bundle, not just in Node.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Fail loudly during development if the .env values are missing.
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase env vars. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env"
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Store the logged-in session on the device so users stay signed in.
    // On native this is AsyncStorage; on web supabase-js falls back to localStorage.
    storage: AsyncStorage,
    // Keep the session alive by refreshing the access token in the background.
    autoRefreshToken: true,
    persistSession: true,
    // We sign in with email/password, not a redirect URL, so this stays off.
    detectSessionInUrl: false,
  },
});
