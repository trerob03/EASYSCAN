import { useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Image, Pressable, ScrollView, StyleSheet, Text, View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { File, Paths } from "expo-file-system";
import { MASS_LABELS, Scan, formatCm, scanGarment } from "./src/api";
import { CameraScreen } from "./src/CameraScreen";
import { MARKTPLAETZE, exportTo, sharePhoto } from "./src/export";
import { FREE_SCANS, canScan, countScan, getScanCount, isPro, purchasesEnabled, restore, setupPurchases } from "./src/paywall";
import { colors, gradient, radius } from "./src/theme";

const STORAGE_KEY = "scans.v1";

setupPurchases();

// Fotos aus Kamera/Galerie liegen im Cache, den das System leeren darf: dauerhaft ablegen.
function keepPhoto(uri: string) {
  try {
    const target = new File(Paths.document, `scan-${Date.now()}.jpg`);
    new File(uri).copy(target);
    return target.uri;
  } catch {
    return uri;
  }
}

export default function App() {
  const [scans, setScans] = useState<Scan[]>([]);
  const [selected, setSelected] = useState<Scan | null>(null);
  const [busyFoto, setBusyFoto] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [freeLeft, setFreeLeft] = useState<number | null>(null);

  const refreshFree = async () => {
    if (!purchasesEnabled() || (await isPro().catch(() => false))) return setFreeLeft(null);
    setFreeLeft(Math.max(0, FREE_SCANS - (await getScanCount())));
  };

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => raw && setScans(JSON.parse(raw)));
    refreshFree();
  }, []);

  const save = (next: Scan[]) => {
    setScans(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const openCamera = async () => {
    if (await canScan()) setCameraOpen(true);
    refreshFree();
  };

  const pickFromGallery = async () => {
    if (!(await canScan())) return refreshFree();
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert("Zugriff benötigt", "Bitte erlaube den Zugriff in den Einstellungen.");
    const pick = await ImagePicker.launchImageLibraryAsync({ quality: 1, mediaTypes: ["images"] });
    setCameraOpen(false);
    if (!pick.canceled) runScan(pick.assets[0].uri);
  };

  const runScan = async (uri: string) => {
    setCameraOpen(false);
    const foto = keepPhoto(uri);
    setBusyFoto(foto);
    try {
      const result = await scanGarment(foto);
      const scan: Scan = { ...result, id: String(Date.now()), foto, erstellt: Date.now() };
      save([scan, ...scans]);
      setSelected(scan);
      await countScan();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Scan fehlgeschlagen", e instanceof Error ? e.message : "Bitte erneut versuchen.");
    } finally {
      setBusyFoto(null);
      refreshFree();
    }
  };

  const remove = (id: string) => {
    save(scans.filter((s) => s.id !== id));
    setSelected(null);
  };

  const onRestore = async () => {
    const ok = await restore().catch(() => false);
    Alert.alert(ok ? "Pro wiederhergestellt" : "Kein Kauf gefunden");
    refreshFree();
  };

  if (cameraOpen) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <CameraScreen onPhoto={runScan} onGallery={pickFromGallery} onClose={() => setCameraOpen(false)} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
        {busyFoto ? (
          <Scanning foto={busyFoto} />
        ) : selected ? (
          <Detail scan={selected} onBack={() => setSelected(null)} onDelete={() => remove(selected.id)} />
        ) : (
          <Home
            scans={scans} onOpen={setSelected} onCamera={openCamera} onGallery={pickFromGallery}
            freeLeft={freeLeft} onRestore={purchasesEnabled() ? onRestore : undefined}
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Home({ scans, onOpen, onCamera, onGallery, freeLeft, onRestore }: {
  scans: Scan[]; onOpen: (s: Scan) => void; onCamera: () => void; onGallery: () => void;
  freeLeft: number | null; onRestore?: () => void;
}) {
  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={scans}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: 20, paddingBottom: 160, gap: 10 }}
        ListHeaderComponent={
          <View style={{ marginBottom: 16 }}>
            <Text style={styles.eyebrow}>RESELLER SCAN</Text>
            <Text style={styles.h1}>Foto rein.{"\n"}Maße & Text raus.</Text>
            <View style={styles.tip}>
              <Text style={styles.tipTitle}>So misst die App genau</Text>
              <Text style={styles.tipText}>
                Teil glatt hinlegen, ein DIN-A4-Blatt daneben legen und gerade von oben fotografieren.
              </Text>
            </View>
            {freeLeft !== null && (
              <View style={styles.freeRow}>
                <Text style={styles.freeText}>
                  {freeLeft > 0 ? `Noch ${freeLeft} von ${FREE_SCANS} Gratis-Scans` : "Gratis-Scans aufgebraucht – hol dir Pro"}
                </Text>
                {onRestore && <Pressable onPress={onRestore}><Text style={styles.copy}>Wiederherstellen</Text></Pressable>}
              </View>
            )}
            {scans.length > 0 && <Text style={styles.section}>Deine Scans</Text>}
          </View>
        }
        ListEmptyComponent={<Text style={styles.empty}>Noch keine Scans. Leg los!</Text>}
        renderItem={({ item }) => (
          <Pressable style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]} onPress={() => onOpen(item)}>
            <Image source={{ uri: item.foto }} style={styles.thumb} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>{item.artikel}</Text>
              <Text style={styles.rowMeta} numberOfLines={1}>
                {[item.groesse, item.kategorie, item.zustand].filter(Boolean).join(" · ")}
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        )}
      />
      <View style={styles.dock}>
        <Pressable onPress={onCamera} style={({ pressed }) => [{ flex: 1 }, pressed && { transform: [{ scale: 0.98 }] }]}>
          <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cta}>
            <Text style={styles.ctaText}>Kleidungsstück scannen</Text>
          </LinearGradient>
        </Pressable>
        <Pressable onPress={onGallery} style={styles.ghost}>
          <Text style={styles.ghostText}>Galerie</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Scanning({ foto }: { foto: string }) {
  return (
    <View style={styles.center}>
      <Image source={{ uri: foto }} style={styles.scanImg} />
      <ActivityIndicator color={colors.accent} size="large" style={{ marginTop: 28 }} />
      <Text style={[styles.h2, { marginTop: 16 }]}>Wird vermessen …</Text>
      <Text style={styles.muted}>Maßstab erkennen, Maße berechnen, Texte schreiben</Text>
    </View>
  );
}

function Detail({ scan, onBack, onDelete }: { scan: Scan; onBack: () => void; onDelete: () => void }) {
  const masse = MASS_LABELS.filter(([k]) => scan.masse[k] != null);
  const max = Math.max(...masse.map(([k]) => scan.masse[k] as number), 1);
  const masseText = masse.map(([k, l]) => `${l}: ${formatCm(scan.masse[k] as number)}`).join("\n");

  const copy = async (text: string) => {
    await Clipboard.setStringAsync(text);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60, gap: 16 }}>
      <Pressable onPress={onBack} hitSlop={12}><Text style={styles.back}>‹ Zurück</Text></Pressable>
      <Image source={{ uri: scan.foto }} style={styles.hero} />
      <View>
        <Text style={styles.h2}>{scan.artikel}</Text>
        <View style={styles.chips}>
          {[scan.marke, scan.groesse, scan.farbe, scan.material, scan.zustand].filter(Boolean).map((c) => (
            <Text key={c} style={styles.chip}>{c}</Text>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Jetzt einstellen</Text>
        <Text style={styles.muted}>Titel, Text und Maße landen in der Zwischenablage – im Marktplatz nur noch einfügen.</Text>
        <View style={styles.marketRow}>
          {MARKTPLAETZE.map((m) => (
            <Pressable key={m.id} onPress={() => exportTo(scan, m).catch(() => Alert.alert("Konnte nicht geöffnet werden"))}
              style={({ pressed }) => [styles.market, { backgroundColor: m.farbe }, pressed && { opacity: 0.8 }]}>
              <Text style={styles.marketText}>{m.name}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={() => sharePhoto(scan)} style={styles.ghostWide}>
          <Text style={styles.ghostText}>Foto teilen</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>Maße (flach gemessen)</Text>
          <Pressable onPress={() => copy(masseText)}><Text style={styles.copy}>Kopieren</Text></Pressable>
        </View>
        {masse.map(([k, label]) => (
          <View key={k} style={styles.measure}>
            <Text style={styles.mLabel}>{label}</Text>
            <View style={styles.track}>
              <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={[styles.bar, { width: `${((scan.masse[k] as number) / max) * 100}%` }]} />
            </View>
            <Text style={styles.mVal}>{formatCm(scan.masse[k] as number)}</Text>
          </View>
        ))}
        <Text style={[styles.accuracy, { color: scan.referenz_erkannt ? colors.ok : colors.warn }]}>
          {scan.referenz_erkannt ? "A4-Maßstab erkannt" : "Kein A4-Blatt erkannt – Werte geschätzt"} · ±{scan.genauigkeit_cm} cm
        </Text>
        {scan.hinweis && <Text style={styles.muted}>{scan.hinweis}</Text>}
      </View>

      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>SEO-Titel</Text>
          <Pressable onPress={() => copy(scan.seo_titel)}><Text style={styles.copy}>Kopieren</Text></Pressable>
        </View>
        <Text style={styles.body}>{scan.seo_titel}</Text>
        <Text style={[styles.muted, scan.seo_titel.length > 80 && { color: colors.bad }]}>
          {scan.seo_titel.length} / 80 Zeichen
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>SEO-Beschreibung</Text>
          <Pressable onPress={() => copy(`${scan.seo_beschreibung}\n\n${scan.hashtags.join(" ")}`)}>
            <Text style={styles.copy}>Kopieren</Text>
          </Pressable>
        </View>
        <Text style={styles.body}>{scan.seo_beschreibung}</Text>
        <Text style={[styles.muted, { color: colors.accent }]}>{scan.hashtags.join(" ")}</Text>
      </View>

      <Pressable onPress={onDelete}><Text style={styles.delete}>Scan löschen</Text></Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  eyebrow: { color: colors.accent, fontWeight: "700", letterSpacing: 2, fontSize: 12 },
  h1: { color: colors.text, fontSize: 34, fontWeight: "800", marginTop: 6, lineHeight: 40 },
  h2: { color: colors.text, fontSize: 24, fontWeight: "700" },
  section: { color: colors.muted, fontSize: 13, fontWeight: "600", marginTop: 24, textTransform: "uppercase", letterSpacing: 1 },
  muted: { color: colors.muted, fontSize: 13, marginTop: 6, lineHeight: 18 },
  body: { color: colors.text, fontSize: 15, lineHeight: 22 },
  empty: { color: colors.muted, textAlign: "center", marginTop: 40 },
  tip: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: 16, marginTop: 20 },
  tipTitle: { color: colors.text, fontWeight: "700", marginBottom: 4 },
  tipText: { color: colors.muted, lineHeight: 20 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.card, borderRadius: radius.md, padding: 10, borderWidth: 1, borderColor: colors.border },
  thumb: { width: 56, height: 56, borderRadius: radius.sm, backgroundColor: colors.cardHigh },
  rowTitle: { color: colors.text, fontSize: 16, fontWeight: "600" },
  rowMeta: { color: colors.muted, fontSize: 13, marginTop: 2 },
  chevron: { color: colors.muted, fontSize: 26, paddingHorizontal: 6 },
  dock: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: 10, padding: 20, paddingBottom: 36, backgroundColor: "rgba(11,11,16,0.92)" },
  cta: { height: 58, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  ctaText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  ghost: { height: 58, paddingHorizontal: 20, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  ghostText: { color: colors.text, fontWeight: "600" },
  scanImg: { width: 240, height: 320, borderRadius: radius.lg },
  back: { color: colors.accent, fontSize: 17, fontWeight: "600" },
  hero: { width: "100%", aspectRatio: 3 / 4, borderRadius: radius.lg, backgroundColor: colors.card },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  chip: { color: colors.text, backgroundColor: colors.cardHigh, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5, fontSize: 13, overflow: "hidden" },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 18, borderWidth: 1, borderColor: colors.border, gap: 10 },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { color: colors.muted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 },
  copy: { color: colors.accent, fontWeight: "700" },
  measure: { flexDirection: "row", alignItems: "center", gap: 10 },
  mLabel: { color: colors.text, width: 110, fontSize: 15 },
  track: { flex: 1, height: 8, borderRadius: radius.pill, backgroundColor: colors.cardHigh, overflow: "hidden" },
  bar: { height: "100%", borderRadius: radius.pill },
  mVal: { color: colors.text, width: 72, textAlign: "right", fontWeight: "700", fontVariant: ["tabular-nums"] },
  accuracy: { fontSize: 13, fontWeight: "600", marginTop: 4 },
  delete: { color: colors.bad, textAlign: "center", marginTop: 8 },
  freeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12, paddingHorizontal: 4 },
  freeText: { color: colors.muted, fontSize: 13 },
  marketRow: { flexDirection: "row", gap: 8 },
  market: { flex: 1, height: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  marketText: { color: "#fff", fontWeight: "700" },
  ghostWide: { height: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
});
