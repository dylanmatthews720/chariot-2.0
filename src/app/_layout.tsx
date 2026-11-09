// Root layout: the "gate" for the whole app.
//
// It wraps everything in the SessionProvider (so every screen can read the
// session) and then redirects the user to the right place: logged-out users
// get pushed to the login screen, logged-in users get pushed into the app.

import { Slot, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";

import { SessionProvider, useSession } from "@/lib/auth";

function RootNavigator() {
  const { session, loading } = useSession();
  // segments is the current route path split into pieces, e.g. ["(auth)", "login"].
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    // Wait until we have checked storage, so we do not redirect too early.
    if (loading) return;

    // Are we currently on a logged-out screen (inside the (auth) group)?
    const inAuthGroup = segments[0] === "(auth)";

    if (!session && !inAuthGroup) {
      // Not logged in but looking at a protected screen -> go to login.
      router.replace("/login");
    } else if (session && inAuthGroup) {
      // Logged in but still on the login screen -> go to the app.
      router.replace("/home");
    }
  }, [session, loading, segments, router]);

  // Slot renders whatever child route is active (login, home, etc.).
  return <Slot />;
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <RootNavigator />
    </SessionProvider>
  );
}
