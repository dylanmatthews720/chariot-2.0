// Ride map, web version (MapLibre).
//
// A display map (not interactive): shows the rider's pickup as a blue marker
// and, once chosen, the destination as a red marker, auto-fitting to show both.
// Pickup comes from GPS and the destination from address search, so there is no
// pin to drag here. Native (react-native-maps) comes in ride-map.tsx.

import "maplibre-gl/dist/maplibre-gl.css";

import {
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  type StyleSpecification,
} from "maplibre-gl";
import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";

export type LatLng = { lat: number; lng: number };

// Raster basemap from MapTiler. Reliable (unlike OSM's throttled public tiles
// and Carto's key-walled ones) and raster avoids the vector worker. The key
// comes from .env (EXPO_PUBLIC_MAPTILER_KEY).
const MAPTILER_KEY = process.env.EXPO_PUBLIC_MAPTILER_KEY;
const MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    basemap: {
      type: "raster",
      tiles: [
        `https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=${MAPTILER_KEY}`,
      ],
      tileSize: 256,
      attribution: "© MapTiler © OpenStreetMap contributors",
    },
  },
  layers: [{ id: "basemap", type: "raster", source: "basemap" }],
};

export function RideMap({
  pickup,
  destination,
}: {
  pickup: LatLng;
  destination: LatLng | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const destMarkerRef = useRef<Marker | null>(null);

  // Create the map once and drop the pickup marker.
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [pickup.lng, pickup.lat],
      zoom: 14,
    });
    map.once("load", () => map.resize());
    new Marker({ color: "#0055A2" })
      .setLngLat([pickup.lng, pickup.lat])
      .addTo(map);
    mapRef.current = map;
    return () => map.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Add/replace the destination marker and fit both points in view.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (destMarkerRef.current) {
      destMarkerRef.current.remove();
      destMarkerRef.current = null;
    }
    if (destination) {
      destMarkerRef.current = new Marker({ color: "#c5221f" })
        .setLngLat([destination.lng, destination.lat])
        .addTo(map);

      const bounds = new LngLatBounds(
        [pickup.lng, pickup.lat],
        [pickup.lng, pickup.lat]
      );
      bounds.extend([destination.lng, destination.lat]);
      map.fitBounds(bounds, { padding: 90, maxZoom: 15, duration: 500 });
    }
  }, [destination, pickup]);

  return (
    <View style={styles.wrap}>
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
  },
});
