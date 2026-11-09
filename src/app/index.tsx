// Entry point at "/". It shows a spinner while we check for a saved session,
// then sends the user to the right place. The gate in _layout.tsx handles
// later changes (like signing out); this handles the very first load.

import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { useSession } from "@/lib/auth";

export default function Index() {
  const { session, loading } = useSession();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return <Redirect href={session ? "/home" : "/login"} />;
}
