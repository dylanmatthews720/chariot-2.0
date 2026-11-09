// Login + sign-up screen for Chariot.
//
// One screen handles both: a toggle switches between "Sign in" and "Create
// account". Sign-up checks the email ends in @sjsu.edu (the database enforces
// this too, but checking here gives a faster, friendlier error), then creates
// the account. Because email confirmation is on, sign-up shows a "check your
// inbox" message instead of logging in right away.

import * as Linking from "expo-linking";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { supabase } from "@/lib/supabase";

export default function LoginScreen() {
  // Which form are we showing?
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");

  // Form fields.
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // UI state.
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null); // e.g. "check your email"

  const isSignUp = mode === "signUp";

  async function handleSubmit() {
    setError(null);
    setInfo(null);

    const cleanEmail = email.trim().toLowerCase();

    // Friendly client-side guard. The DB trigger is the real enforcement.
    if (!cleanEmail.endsWith("@sjsu.edu")) {
      setError("Use your @sjsu.edu email address.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (isSignUp && fullName.trim().length === 0) {
      setError("Please enter your name.");
      return;
    }

    setLoading(true);
    try {
      if (isSignUp) {
        // Create the account. full_name is saved into the user's metadata,
        // which the handle_new_user() trigger copies into the profiles table.
        // emailRedirectTo is where the confirmation link sends them back.
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: { full_name: fullName.trim() },
            emailRedirectTo: Linking.createURL("/"),
          },
        });
        if (error) throw error;

        // When confirmation is required, there is no session yet.
        if (!data.session) {
          setInfo("Check your @sjsu.edu inbox to confirm your account, then sign in.");
          setMode("signIn");
        }
        // If a session does come back, the auth listener redirects us.
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (error) throw error;
        // On success the auth listener in _layout.tsx redirects to /home.
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Chariot</Text>
        <Text style={styles.subtitle}>
          {isSignUp ? "Create your SJSU account" : "Sign in to your SJSU account"}
        </Text>

        {isSignUp && (
          <TextInput
            style={styles.input}
            placeholder="Full name"
            placeholderTextColor="#9aa0a6"
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
          />
        )}

        <TextInput
          style={styles.input}
          placeholder="you@sjsu.edu"
          placeholderTextColor="#9aa0a6"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          inputMode="email"
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#9aa0a6"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        {error && <Text style={styles.error}>{error}</Text>}
        {info && <Text style={styles.info}>{info}</Text>}

        <Pressable
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>
              {isSignUp ? "Create account" : "Sign in"}
            </Text>
          )}
        </Pressable>

        <Pressable
          onPress={() => {
            setError(null);
            setInfo(null);
            setMode(isSignUp ? "signIn" : "signUp");
          }}
        >
          <Text style={styles.switchText}>
            {isSignUp
              ? "Already have an account? Sign in"
              : "New here? Create an account"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// SJSU blue is #0055A2. These styles keep the screen simple and readable.
const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5f6f8",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    gap: 12,
  },
  title: {
    fontSize: 36,
    fontWeight: "800",
    color: "#0055A2",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    color: "#5f6368",
    textAlign: "center",
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d0d5dd",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: "#ffffff",
    color: "#1a1a1a",
  },
  button: {
    backgroundColor: "#0055A2",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  switchText: {
    color: "#0055A2",
    textAlign: "center",
    marginTop: 8,
    fontSize: 14,
  },
  error: {
    color: "#c5221f",
    fontSize: 14,
  },
  info: {
    color: "#0b8043",
    fontSize: 14,
  },
});
