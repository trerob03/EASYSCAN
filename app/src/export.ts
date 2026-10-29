import { Linking } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Sharing from "expo-sharing";
import { MASS_LABELS, Scan, formatCm } from "./api";

export type Marktplatz = { id: string; name: string; url: string; farbe: string };

// Die Web-Adressen öffnen die jeweilige App, wenn sie installiert ist (Universal/App Links).
export const MARKTPLAETZE: Marktplatz[] = [
  { id: "vinted", name: "Vinted", url: "https://www.vinted.de/items/new", farbe: "#09B1BA" },
  { id: "ebay", name: "eBay", url: "https://www.ebay.de/sl/sell", farbe: "#E53238" },
  { id: "kleinanzeigen", name: "Kleinanzeigen", url: "https://www.kleinanzeigen.de/p-anzeige-aufgeben.html", farbe: "#7BB928" },
];

export function listingText(scan: Scan) {
  const masse = MASS_LABELS
    .filter(([k]) => scan.masse[k] != null)
    .map(([k, label]) => `• ${label}: ${formatCm(scan.masse[k] as number)}`)
    .join("\n");
  return [
    scan.seo_beschreibung,
    "",
    "Maße (flach gemessen):",
    masse,
    "",
    scan.hashtags.join(" "),
  ].join("\n");
}

// Titel + Text in die Zwischenablage, dann Marktplatz öffnen. Dort nur noch einfügen.
export async function exportTo(scan: Scan, m: Marktplatz) {
  await Clipboard.setStringAsync(`${scan.seo_titel}\n\n${listingText(scan)}`);
  await Linking.openURL(m.url);
}

export async function sharePhoto(scan: Scan) {
  if (await Sharing.isAvailableAsync()) {
    await Clipboard.setStringAsync(`${scan.seo_titel}\n\n${listingText(scan)}`);
    await Sharing.shareAsync(scan.foto, { mimeType: "image/jpeg", dialogTitle: scan.seo_titel });
  }
}
