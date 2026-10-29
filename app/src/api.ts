import * as ImageManipulator from "expo-image-manipulator";

// Nach `wrangler deploy` hier die Worker-URL und dein APP_TOKEN eintragen.
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://reseller-scan.DEIN-NAME.workers.dev";
const APP_TOKEN = process.env.EXPO_PUBLIC_APP_TOKEN ?? "";

export type Masse = {
  bundweite_cm: number | null;
  hueftbreite_cm: number | null;
  brustbreite_cm: number | null;
  schulterbreite_cm: number | null;
  laenge_cm: number | null;
  schrittlaenge_cm: number | null;
  aermellaenge_cm: number | null;
  beinoeffnung_cm: number | null;
};

export type ScanResult = {
  artikel: string;
  kategorie: string;
  marke: string | null;
  groesse: string | null;
  farbe: string;
  material: string | null;
  zustand: string;
  masse: Masse;
  referenz_erkannt: boolean;
  genauigkeit_cm: number;
  hinweis: string | null;
  seo_titel: string;
  seo_beschreibung: string;
  hashtags: string[];
};

export type Scan = ScanResult & { id: string; foto: string; erstellt: number };

export const MASS_LABELS: [keyof Masse, string][] = [
  ["bundweite_cm", "Bundweite"],
  ["hueftbreite_cm", "Hüftbreite"],
  ["brustbreite_cm", "Brustbreite"],
  ["schulterbreite_cm", "Schulterbreite"],
  ["laenge_cm", "Gesamtlänge"],
  ["schrittlaenge_cm", "Innenbein"],
  ["aermellaenge_cm", "Ärmellänge"],
  ["beinoeffnung_cm", "Beinöffnung"],
];

export async function scanGarment(uri: string): Promise<ScanResult> {
  // Auf 1568 px verkleinern: genug Detail für die Vermessung, schneller Upload.
  const small = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1568 } }], {
    compress: 0.85,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });

  const res = await fetch(`${API_URL}/scan`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-app-token": APP_TOKEN },
    body: JSON.stringify({ image: small.base64 }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Scan fehlgeschlagen");
  return data as ScanResult;
}

export const formatCm = (v: number) => `${v.toLocaleString("de-DE", { maximumFractionDigits: 1 })} cm`;
