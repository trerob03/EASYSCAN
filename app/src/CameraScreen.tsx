import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { colors, radius } from "./theme";

// Kamera mit Hilfsrahmen: großer Bereich fürs Kleidungsstück, kleiner Rahmen
// im Seitenverhältnis 21 : 29,7 zeigt, wo das A4-Blatt als Maßstab liegen soll.

export function CameraScreen({ onPhoto, onGallery, onClose }: {
  onPhoto: (uri: string) => void; onGallery: () => void; onClose: () => void;
}) {
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);

  if (!permission) return <View style={styles.root} />;

  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.root, styles.center]}>
        <Text style={styles.title}>Kamera-Zugriff benötigt</Text>
        <Text style={styles.muted}>Damit die App Kleidungsstücke vermessen kann.</Text>
        <Pressable style={styles.primary} onPress={requestPermission}>
          <Text style={styles.primaryText}>Zugriff erlauben</Text>
        </Pressable>
        <Pressable onPress={onClose}><Text style={styles.link}>Abbrechen</Text></Pressable>
      </SafeAreaView>
    );
  }

  const shoot = async () => {
    if (!camera.current || busy) return;
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const photo = await camera.current.takePictureAsync({ quality: 0.9 });
      if (photo) onPhoto(photo.uri);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" />
      <SafeAreaView style={styles.overlay} edges={["top", "bottom"]}>
        <View style={styles.topBar}>
          <Pressable onPress={onClose} hitSlop={12}><Text style={styles.close}>✕</Text></Pressable>
          <Text style={styles.hint}>Gerade von oben fotografieren</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.frameArea}>
          <View style={styles.garmentFrame}>
            <Text style={styles.frameLabel}>Kleidungsstück flach</Text>
          </View>
          <View style={styles.a4Frame}>
            <Text style={styles.a4Label}>A4</Text>
          </View>
        </View>

        <View style={styles.bottomBar}>
          <Pressable onPress={onGallery} style={styles.side}><Text style={styles.sideText}>Galerie</Text></Pressable>
          <Pressable onPress={shoot} style={styles.shutterOuter}>
            {busy ? <ActivityIndicator color="#fff" /> : <View style={styles.shutterInner} />}
          </Pressable>
          <View style={styles.side} />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  center: { alignItems: "center", justifyContent: "center", padding: 24, gap: 12, backgroundColor: colors.bg },
  title: { color: colors.text, fontSize: 22, fontWeight: "700" },
  muted: { color: colors.muted, textAlign: "center" },
  primary: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: 28, paddingVertical: 14, marginTop: 8 },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  link: { color: colors.muted, marginTop: 8 },
  overlay: { flex: 1, justifyContent: "space-between" },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 8 },
  close: { color: "#fff", fontSize: 22, fontWeight: "600" },
  hint: { color: "#fff", fontWeight: "600", backgroundColor: "rgba(0,0,0,0.45)", paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.pill, overflow: "hidden" },
  frameArea: { flex: 1, margin: 20, flexDirection: "row", gap: 10, alignItems: "flex-end" },
  garmentFrame: { flex: 1, alignSelf: "stretch", borderWidth: 2, borderStyle: "dashed", borderColor: "rgba(255,255,255,0.85)", borderRadius: radius.lg, alignItems: "center", justifyContent: "flex-start", paddingTop: 12 },
  frameLabel: { color: "#fff", fontWeight: "600", backgroundColor: "rgba(0,0,0,0.4)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, overflow: "hidden" },
  a4Frame: { width: 70, aspectRatio: 21 / 29.7, borderWidth: 2, borderColor: colors.accent2, borderRadius: 6, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,124,180,0.15)" },
  a4Label: { color: "#fff", fontWeight: "800" },
  bottomBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 30, paddingBottom: 20 },
  side: { width: 70, alignItems: "center" },
  sideText: { color: "#fff", fontWeight: "600" },
  shutterOuter: { width: 78, height: 78, borderRadius: 39, borderWidth: 4, borderColor: "#fff", alignItems: "center", justifyContent: "center" },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: "#fff" },
});
