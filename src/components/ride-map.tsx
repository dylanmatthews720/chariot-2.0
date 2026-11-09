// Ride map, native placeholder.
//
// MapLibre is web only, so this stub keeps the app working on iOS and Android
// for now. We will swap in react-native-maps here later with the same props.

import { StyleSheet, Text, View } from "react-native";

export type LatLng = { lat: number; lng: number };

export function RideMap(_props: {
  pickup: LatLng;
  destination: LatLng | null;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.text}>
        The map is available on the web version for now. Native map coming soon.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#eef1f4",
  },
  text: {
    fontSize: 15,
    color: "#5f6368",
    textAlign: "center",
  },
});
