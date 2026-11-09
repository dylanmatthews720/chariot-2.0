// Layout for the logged-out screens. A plain stack with no header bar.
import { Stack } from "expo-router";

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
