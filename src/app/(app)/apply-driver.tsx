// Apply to drive screen.
//
// Collects the car details plus a license and insurance photo, uploads the two
// photos to the private "driver-docs" storage bucket (each under the user's own
// <uid>/ folder, which the storage policy and apply_as_driver() both require),
// then calls apply_as_driver(). That function validates everything server side
// and moves the user to driver_status 'pending' for an admin to review.

import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

type Asset = ImagePicker.ImagePickerAsset;

export default function ApplyDriverScreen() {
  const router = useRouter();
  const { session } = useSession();

  const [carDesc, setCarDesc] = useState("");
  const [plate, setPlate] = useState("");
  const [seats, setSeats] = useState("");
  const [license, setLicense] = useState<Asset | null>(null);
  const [insurance, setInsurance] = useState<Asset | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pickImage(setter: (a: Asset) => void) {
    // Opens the photo library (on web this is the file picker). quality < 1
    // keeps the upload small.
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
    if (!result.canceled) setter(result.assets[0]);
  }

  // Upload one image to driver-docs/<uid>/<name>.<ext> and return the path.
  async function uploadDoc(asset: Asset, name: string): Promise<string> {
    const uid = session!.user.id;
    const contentType = asset.mimeType ?? "image/jpeg";
    const ext = contentType.split("/")[1] ?? "jpg";
    const path = `${uid}/${name}.${ext}`;

    // Read the picked file into bytes. fetch().arrayBuffer() handles the
    // blob/file URIs the image picker returns.
    const bytes = await fetch(asset.uri).then((r) => r.arrayBuffer());

    const { error } = await supabase.storage
      .from("driver-docs")
      .upload(path, bytes, { contentType, upsert: true });
    if (error) throw error;
    return path;
  }

  async function handleSubmit() {
    setError(null);

    // Client side checks for a friendly error. apply_as_driver() enforces these
    // again server side, so these are just for a nicer experience.
    const seatsNum = parseInt(seats, 10);
    if (carDesc.trim().length === 0) return setError("Describe your car.");
    if (plate.trim().length === 0) return setError("Enter your license plate.");
    if (!Number.isInteger(seatsNum) || seatsNum < 1 || seatsNum > 7)
      return setError("Seats must be a number from 1 to 7.");
    if (!license) return setError("Add a photo of your driver license.");
    if (!insurance) return setError("Add a photo of your insurance.");

    setSubmitting(true);
    try {
      const licensePath = await uploadDoc(license, "license");
      const insurancePath = await uploadDoc(insurance, "insurance");

      const { error } = await supabase.rpc("apply_as_driver", {
        p_car_desc: carDesc.trim(),
        p_plate: plate.trim(),
        p_seats: seatsNum,
        p_license_path: licensePath,
        p_insurance_path: insurancePath,
      });
      if (error) throw error;

      // Back to home, which re-reads the profile and now shows "under review".
      if (router.canGoBack()) router.back();
      else router.replace("/home");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit application.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/home")
          }
          hitSlop={8}
        >
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Apply to drive</Text>
        <View style={{ width: 54 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          We verify your license and insurance before you can give rides. Your
          documents are private and only visible to an admin reviewer.
        </Text>

        <Text style={styles.label}>Car</Text>
        <TextInput
          style={styles.input}
          placeholder="Blue Honda Civic"
          placeholderTextColor="#9aa0a6"
          value={carDesc}
          onChangeText={setCarDesc}
        />

        <Text style={styles.label}>License plate</Text>
        <TextInput
          style={styles.input}
          placeholder="7ABC123"
          placeholderTextColor="#9aa0a6"
          value={plate}
          onChangeText={setPlate}
          autoCapitalize="characters"
        />

        <Text style={styles.label}>Seats for riders</Text>
        <TextInput
          style={styles.input}
          placeholder="4"
          placeholderTextColor="#9aa0a6"
          value={seats}
          onChangeText={setSeats}
          keyboardType="number-pad"
        />

        <Text style={styles.label}>Driver license photo</Text>
        <DocPicker asset={license} onPress={() => pickImage(setLicense)} />

        <Text style={styles.label}>Insurance photo</Text>
        <DocPicker asset={insurance} onPress={() => pickImage(setInsurance)} />

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={[styles.submit, submitting && styles.submitDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.submitText}>Submit application</Text>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

// A tap target for one document. Empty state is a dashed "Add photo" box;
// once a photo is chosen it flips to a clear green "added" state with a
// thumbnail, a checkmark, and the file name so there is no doubt it worked.
function DocPicker({
  asset,
  onPress,
}: {
  asset: Asset | null;
  onPress: () => void;
}) {
  if (asset) {
    return (
      <Pressable
        style={[styles.docPicker, styles.docPickerFilled]}
        onPress={onPress}
      >
        <Image source={{ uri: asset.uri }} style={styles.thumb} />
        <View style={styles.docTextCol}>
          <Text style={styles.docAddedText}>✓ Photo added</Text>
          <Text style={styles.docSubText} numberOfLines={1}>
            {asset.fileName ?? "Tap to change"}
          </Text>
        </View>
      </Pressable>
    );
  }
  return (
    <Pressable style={[styles.docPicker, styles.docPickerEmpty]} onPress={onPress}>
      <View style={styles.docPlaceholder}>
        <Text style={styles.docPlaceholderPlus}>+</Text>
      </View>
      <View style={styles.docTextCol}>
        <Text style={styles.docPickerText}>Add photo</Text>
        <Text style={styles.docSubText}>JPG or PNG</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f6f8",
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
  content: {
    padding: 24,
    gap: 8,
  },
  intro: {
    fontSize: 14,
    color: "#5f6368",
    lineHeight: 20,
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#5f6368",
    marginTop: 8,
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
  docPicker: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 10,
    padding: 12,
  },
  docPickerEmpty: {
    borderWidth: 1,
    borderColor: "#d0d5dd",
    borderStyle: "dashed",
    backgroundColor: "#ffffff",
  },
  docPickerFilled: {
    borderWidth: 1.5,
    borderColor: "#0b8043",
    backgroundColor: "#f0f9f3",
  },
  docTextCol: {
    flex: 1,
    gap: 2,
  },
  docPickerText: {
    color: "#0055A2",
    fontSize: 15,
    fontWeight: "600",
  },
  docAddedText: {
    color: "#0b8043",
    fontSize: 15,
    fontWeight: "700",
  },
  docSubText: {
    color: "#9aa0a6",
    fontSize: 13,
  },
  docPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: "#eef1f4",
    alignItems: "center",
    justifyContent: "center",
  },
  docPlaceholderPlus: {
    fontSize: 28,
    fontWeight: "300",
    color: "#9aa0a6",
    lineHeight: 32,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: "#eef1f4",
  },
  error: {
    color: "#c5221f",
    fontSize: 14,
    marginTop: 8,
  },
  submit: {
    backgroundColor: "#0055A2",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 20,
  },
  submitDisabled: {
    opacity: 0.6,
  },
  submitText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
});
