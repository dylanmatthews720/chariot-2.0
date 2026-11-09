// Tracks the logged-in user's session and shares it with the whole app.
//
// Supabase stores a "session" (the logged-in user plus their access token) in
// AsyncStorage. This file reads that session, listens for changes (sign in,
// sign out, token refresh), and exposes it through a React context so any
// screen can ask "is someone logged in?" by calling useSession().

import { Session } from "@supabase/supabase-js";
import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useState,
} from "react";

import { supabase } from "@/lib/supabase";

type AuthState = {
  session: Session | null; // null means logged out
  loading: boolean; // true until we have checked storage once
};

// The default value is used only until the provider mounts.
const AuthContext = createContext<AuthState>({ session: null, loading: true });

// Any component can call this to read the current session.
export function useSession() {
  return useContext(AuthContext);
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // On startup, read any session saved from a previous launch.
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    // Then keep it in sync. This fires whenever the user signs in, signs out,
    // or their token is refreshed in the background.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    // Stop listening when the provider unmounts.
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ session, loading }}>
      {children}
    </AuthContext.Provider>
  );
}
