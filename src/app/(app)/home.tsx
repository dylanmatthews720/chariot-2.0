// Rider home screen.
//
// This is the first screen a signed-in student lands on. It greets the rider,
// offers the main "Request a ride" action (the request flow itself arrives in
// the next milestone), and shows a status-aware prompt about becoming a driver.
// It reads the profile row so we can greet by name and know whether this person
// is already an approved driver.

import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

type DriverStatus = "none" | "pending" | "approved" | "rejected";

type Profile = {
  full_name: string | null;
  driver_status: DriverStatus;
};

// What the "become a driver" card says for each status.
const driverPrompt: Record<
  DriverStatus,
  { title: string; body: string; cta: string | null }
> = {
  none: {
    title: "Want to drive?",
    body: "Earn by giving rides to fellow Spartans. We verify your license and insurance first.",
    cta: "Apply to drive",
  },
  pending: {
    title: "Application under review",
    body: "We are checking your license and insurance. You can go online once you are approved.",
    cta: null,
  },
  approved: {
    title: "You are an approved driver",
    body: "Switch to driver mode to see nearby ride requests.",
    cta: "Go to driver mode",
  },
  rejected: {
    title: "Application not approved",
    body: "Your driver application was not approved. You can review your documents and apply again.",
    cta: "Apply again",
  },
};

export default function RiderHomeScreen() {
  const { session } = useSession();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  // True when the profile load failed. We keep this separate from "profile is
  // null" so a transient network error is not mistaken for driver_status 'none'.
  const [failed, setFailed] = useState(false);
  // A small inline message for actions that are not wired up yet.
  const [note, setNote] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setFailed(false);
    // Read our own profile row. RLS lets any signed-in user read profiles.
    const { data, error } = await supabase
      .from("profiles")
      .select("full_name, driver_status")
      .eq("id", session.user.id)
      .single();
    // On error we flag failure instead of silently falling back to a 'none'
    // status, which would show an approved driver the wrong prompt.
    if (error) {
      setFailed(true);
    } else {
      setProfile(data);
    }
    setLoading(false);
  }, [session]);

  // Reload the profile every time this screen regains focus, so returning from
  // the apply flow immediately reflects the new "under review" status.
  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile])
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator />
      </View>
    );
  }

  // The load failed (or returned nothing). Show a retry instead of guessing.
  if (failed || !profile) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.errorText}>We could not load your profile.</Text>
        <Pressable style={styles.retryButton} onPress={loadProfile}>
          <Text style={styles.retryButtonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  // Past the guards, profile is loaded. First name only, for a friendlier
  // greeting; falls back to "Spartan" if the name is not set.
  const firstName = profile.full_name?.trim().split(" ")[0] || "Spartan";
  const prompt = driverPrompt[profile.driver_status];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.greeting}>Hi {firstName}</Text>
        <Text style={styles.subgreeting}>Where are you headed?</Text>
      </View>

      {/* Primary action: open the map to set a pickup and request a ride. */}
      <Pressable
        style={styles.requestCard}
        onPress={() => router.push("/request-ride")}
      >
        <Text style={styles.requestTitle}>Request a ride</Text>
        <Text style={styles.requestBody}>
          Set your pickup and drop-off and we will find a nearby driver.
        </Text>
      </Pressable>

      {note && <Text style={styles.note}>{note}</Text>}

      {/* Status-aware driver prompt, driven by driver_status from the database. */}
      <View style={styles.driverCard}>
        <Text style={styles.driverTitle}>{prompt.title}</Text>
        <Text style={styles.driverBody}>{prompt.body}</Text>
        {prompt.cta && (
          <Pressable
            style={styles.driverButton}
            onPress={() => {
              // Approved drivers head to driver mode (a later step); everyone
              // else (none / rejected) goes to the apply flow.
              if (profile.driver_status === "approved") {
                setNote("Driver mode is coming in a later step.");
              } else {
                router.push("/apply-driver");
              }
            }}
          >
            <Text style={styles.driverButtonText}>{prompt.cta}</Text>
          </Pressable>
        )}
      </View>

      <Pressable style={styles.signOut} onPress={() => supabase.auth.signOut()}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

// SJSU blue is #0055A2.
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f6f8",
  },
  center: {
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    padding: 24,
    gap: 16,
  },
  header: {
    marginTop: 8,
    gap: 2,
  },
  greeting: {
    fontSize: 28,
    fontWeight: "800",
    color: "#0055A2",
  },
  subgreeting: {
    fontSize: 16,
    color: "#5f6368",
  },
  requestCard: {
    backgroundColor: "#0055A2",
    borderRadius: 16,
    padding: 20,
    gap: 6,
  },
  requestTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#ffffff",
  },
  requestBody: {
    fontSize: 14,
    color: "#dbe7f5",
    lineHeight: 20,
  },
  note: {
    fontSize: 13,
    color: "#0b8043",
    textAlign: "center",
  },
  driverCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    gap: 8,
    borderWidth: 1,
    borderColor: "#e3e6ea",
  },
  driverTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1a1a1a",
  },
  driverBody: {
    fontSize: 14,
    color: "#5f6368",
    lineHeight: 20,
  },
  driverButton: {
    alignSelf: "flex-start",
    marginTop: 4,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: "#eaf1f9",
  },
  driverButtonText: {
    color: "#0055A2",
    fontWeight: "700",
    fontSize: 14,
  },
  signOut: {
    marginTop: 8,
    alignItems: "center",
    paddingVertical: 12,
  },
  signOutText: {
    color: "#9aa0a6",
    fontSize: 14,
    fontWeight: "600",
  },
  errorText: {
    fontSize: 16,
    color: "#5f6368",
    marginBottom: 16,
    textAlign: "center",
  },
  retryButton: {
    backgroundColor: "#0055A2",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  retryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
});
