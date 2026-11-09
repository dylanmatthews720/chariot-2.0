// Request a ride screen.
//
// Pickup is automatic (the rider's GPS location). The rider types a destination,
// which we look up with OpenStreetMap search (Nominatim), then we show a
// distance-based price. Requesting inserts a row into the rides table with
// status 'requested', which is what nearby_requests() shows to drivers.
//
// pickup/dropoff are PostGIS geography points, sent as EWKT strings
// ("SRID=4326;POINT(lng lat)"), longitude first.

import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { LatLng, RideMap } from "@/components/ride-map";
import { useSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

// MapTiler powers both the map tiles and this address search. Key from .env.
const MAPTILER_KEY = process.env.EXPO_PUBLIC_MAPTILER_KEY;

// SJSU campus center, used when we cannot read the device location.
const SJSU: LatLng = { lat: 37.3352, lng: -121.8811 };

// Simple fare model: a base fare plus a per-mile rate, with a minimum.
const BASE_FARE = 2.0;
const PER_MILE = 1.5;
const MIN_FARE = 3.0;

type Place = { coords: LatLng; label: string };

const point = (c: LatLng) => `SRID=4326;POINT(${c.lng} ${c.lat})`;

// Straight-line distance in miles (good enough for an estimate).
function milesBetween(a: LatLng, b: LatLng): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function fareFor(miles: number): number {
  return Math.max(MIN_FARE, BASE_FARE + PER_MILE * miles);
}

// Shorten a long Nominatim display name to its first few parts.
const shortLabel = (s: string) => s.split(",").slice(0, 3).join(",").trim();

export default function RequestRideScreen() {
  const router = useRouter();
  const { session } = useSession();

  const [pickup, setPickup] = useState<LatLng | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [destination, setDestination] = useState<Place | null>(null);

  const [step, setStep] = useState<"form" | "done">("form");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get the pickup location once on open.
  useEffect(() => {
    (async () => {
      let start = SJSU;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const pos = await Location.getCurrentPositionAsync({});
          start = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        } else {
          setNote("Location is off, so pickup is set to campus.");
        }
      } catch {
        setNote("Could not read your location, so pickup is set to campus.");
      }
      setPickup(start);
    })();
  }, []);

  // Debounced destination search against OpenStreetMap (Nominatim).
  useEffect(() => {
    if (!pickup) return;
    // Do not re-search the text we just filled in from a chosen result.
    if (destination && query === destination.label) return;
    if (query.trim().length < 2) {
      setResults([]);
      setSearchError(false);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        setSearching(true);
        setSearchError(false);
        // MapTiler geocoding, biased to the rider and bounded to California.
        // bbox is minLng,minLat,maxLng,maxLat.
        const url =
          `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json` +
          `?key=${MAPTILER_KEY}&country=us&limit=6` +
          `&proximity=${pickup.lng},${pickup.lat}` +
          `&bbox=-124.48,32.53,-114.13,42.01`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as {
          features: { center: [number, number]; place_name: string }[];
        };
        setResults(
          (data.features ?? []).map((f) => ({
            coords: { lat: f.center[1], lng: f.center[0] },
            label: shortLabel(f.place_name),
          }))
        );
      } catch {
        setResults([]);
        setSearchError(true);
      } finally {
        setSearching(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [query, pickup, destination]);

  function chooseResult(place: Place) {
    setDestination(place);
    setQuery(place.label);
    setResults([]);
  }

  const miles = pickup && destination ? milesBetween(pickup, destination.coords) : 0;
  const fare = destination ? fareFor(miles) : 0;

  async function submit() {
    if (!pickup || !destination || !session) return;
    setError(null);
    setSubmitting(true);
    try {
      const { error } = await supabase.from("rides").insert({
        rider_id: session.user.id,
        status: "requested",
        pickup: point(pickup),
        dropoff: point(destination.coords),
        pickup_label: "Current location",
        dropoff_label: destination.label,
      });
      if (error) throw error;
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not request the ride.");
    } finally {
      setSubmitting(false);
    }
  }

  // Go back if there is a screen to return to, otherwise go home. This avoids a
  // "GO_BACK not handled" warning when the page was loaded directly on this URL.
  function leave() {
    if (router.canGoBack()) router.back();
    else router.replace("/home");
  }

  // Wait for the pickup location before showing the map.
  if (!pickup) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator />
        <Text style={styles.loadingText}>Finding your location...</Text>
      </View>
    );
  }

  if (step === "done") {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={{ width: 54 }} />
          <Text style={styles.headerTitle}>Requested</Text>
          <View style={{ width: 54 }} />
        </View>
        <View style={[styles.center, { flex: 1, padding: 24 }]}>
          <Text style={styles.doneTitle}>Ride requested</Text>
          <Text style={styles.doneBody}>
            Heading to {destination?.label}. A nearby driver will be notified,
            and you can track them once someone accepts.
          </Text>
          <Pressable style={styles.request} onPress={leave}>
            <Text style={styles.requestText}>Done</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={leave} hitSlop={8}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Request a ride</Text>
        <View style={{ width: 54 }} />
      </View>

      {/* Destination search. */}
      <View style={styles.searchBox}>
        <Text style={styles.fieldLabel}>Where to?</Text>
        <TextInput
          style={styles.input}
          placeholder="Search a destination"
          placeholderTextColor="#9aa0a6"
          value={query}
          onChangeText={(t) => {
            setQuery(t);
            if (destination) setDestination(null);
          }}
          autoCorrect={false}
        />
        {note && <Text style={styles.note}>{note}</Text>}

        {/* Results dropdown. */}
        {results.length > 0 && (
          <View style={styles.results}>
            {results.map((r, i) => (
              <Pressable
                key={`${r.coords.lat}-${r.coords.lng}-${i}`}
                style={styles.resultRow}
                onPress={() => chooseResult(r)}
              >
                <Text style={styles.resultText} numberOfLines={1}>
                  {r.label}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
        {searching && results.length === 0 && (
          <Text style={styles.searchingText}>Searching...</Text>
        )}
        {!searching && searchError && (
          <Text style={styles.searchingText}>
            Search is busy right now. Wait a few seconds and try again.
          </Text>
        )}
        {!searching &&
          !searchError &&
          !destination &&
          results.length === 0 &&
          query.trim().length >= 2 && (
            <Text style={styles.searchingText}>No matches found in California.</Text>
          )}
      </View>

      <RideMap pickup={pickup} destination={destination?.coords ?? null} />

      {/* Price + request, shown once a destination is picked. */}
      {destination && (
        <View style={styles.sheet}>
          <View style={styles.fareRow}>
            <View>
              <Text style={styles.fareLabel}>Estimated fare</Text>
              <Text style={styles.fareMiles}>{miles.toFixed(1)} mi</Text>
            </View>
            <Text style={styles.fare}>${fare.toFixed(2)}</Text>
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            style={[styles.request, submitting && styles.requestDisabled]}
            onPress={submit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.requestText}>Request ride · ${fare.toFixed(2)}</Text>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f6f8",
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  loadingText: {
    color: "#5f6368",
    fontSize: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e3e6ea",
  },
  cancel: {
    color: "#0055A2",
    fontSize: 16,
    width: 54,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1a1a1a",
  },
  searchBox: {
    backgroundColor: "#ffffff",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e3e6ea",
    zIndex: 10,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#9aa0a6",
    textTransform: "uppercase",
    marginBottom: 6,
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
  note: {
    fontSize: 13,
    color: "#0b8043",
    marginTop: 8,
  },
  results: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#e3e6ea",
    borderRadius: 10,
    overflow: "hidden",
  },
  resultRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f1f3",
  },
  resultText: {
    fontSize: 15,
    color: "#1a1a1a",
  },
  searchingText: {
    marginTop: 8,
    fontSize: 13,
    color: "#9aa0a6",
  },
  sheet: {
    backgroundColor: "#ffffff",
    padding: 20,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopColor: "#e3e6ea",
  },
  fareRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  fareLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#9aa0a6",
    textTransform: "uppercase",
  },
  fareMiles: {
    fontSize: 14,
    color: "#5f6368",
    marginTop: 2,
  },
  fare: {
    fontSize: 28,
    fontWeight: "800",
    color: "#0055A2",
  },
  error: {
    color: "#c5221f",
    fontSize: 14,
    marginTop: 12,
  },
  request: {
    backgroundColor: "#0055A2",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 16,
  },
  requestDisabled: {
    opacity: 0.6,
  },
  requestText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  doneTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0b8043",
  },
  doneBody: {
    fontSize: 15,
    color: "#5f6368",
    textAlign: "center",
    lineHeight: 22,
  },
});
