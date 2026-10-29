# Reseller Scan

iPhone-App für Reseller: Kleidungsstück fotografieren → Maße in cm (Bundweite, Brust, Länge, Innenbein …) → fertiger SEO-Titel und Beschreibung für Vinted, eBay und Kleinanzeigen.

```
reseller-scan/
├── app/      Expo/React-Native-App (iOS + Android)
└── server/   Cloudflare Worker – schützt den API-Schlüssel und ruft Claude auf
```

## So misst die App

Ein Foto allein hat keinen Maßstab. Deshalb legt man ein **DIN-A4-Blatt (21,0 × 29,7 cm)** neben das Teil.
Claude erkennt das Blatt, berechnet daraus Pixel pro Zentimeter und misst das Kleidungsstück flach liegend,
so wie Reseller es von Hand tun. Fehlt das Blatt, schätzt die App und zeigt das deutlich an.
Realistisch ist eine Genauigkeit von etwa ±1–2 cm mit A4-Blatt. Die App zeigt die Unsicherheit bei jedem Scan an.

## 1. Server starten (ca. 10 Minuten)

Voraussetzungen: kostenloses [Cloudflare-Konto](https://dash.cloudflare.com) und ein API-Schlüssel von [platform.claude.com](https://platform.claude.com).

```bash
cd server
npm install
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY   # deinen Claude-API-Schlüssel einfügen
npx wrangler secret put APP_TOKEN           # ein beliebiges langes Passwort ausdenken
npx wrangler deploy
```

Am Ende zeigt `wrangler` die URL, z. B. `https://reseller-scan.deinname.workers.dev`.

Kosten: ein Scan mit `claude-opus-5-5` kostet grob 1–3 Cent. Wer es günstiger will, stellt in
`server/src/index.ts` das Modell auf `claude-sonnet-5-5` um.

## 2. App testen

```bash
cd app
npm install
```

Lege `app/.env` an:

```
EXPO_PUBLIC_API_URL=https://reseller-scan.deinname.workers.dev
EXPO_PUBLIC_APP_TOKEN=dasselbe-passwort-wie-oben
```

```bash
npx expo start
```

Zum Testen auf dem Handy brauchst du einen eigenen Test-Build (siehe „APK für Android“ bzw. `eas build --profile development`),
weil Kamera-Ansicht und Bezahlschranke eigenen nativen Code mitbringen.

## Funktionen

- **Kamera mit A4-Rahmen**: zeigt, wo Kleidungsstück und A4-Blatt liegen sollen
- **Maße + SEO-Titel + Beschreibung + Hashtags** pro Scan, alles mit einem Tipp kopierbar
- **Direkt einstellen**: Knöpfe für Vinted, eBay und Kleinanzeigen kopieren den kompletten Anzeigentext und öffnen
  die jeweilige App bzw. Seite – dort nur noch einfügen. „Foto teilen“ schickt das Bild an jede App.
- **Bezahlschranke** (RevenueCat): 5 Scans gratis, danach Abo „pro“. Ohne RevenueCat-Schlüssel ist alles frei.

## APK für Android

Hinweis: Mit Kamera und Bezahlschranke läuft die App nicht mehr in Expo Go, sondern nur als eigene App (APK).

### Weg A – Expo EAS (am einfachsten, kostenloses Expo-Konto)

```bash
npm install -g eas-cli
```

```bash
cd app && eas login
```

```bash
eas build --platform android --profile preview
```

Nach ca. 10–15 Minuten bekommst du einen Download-Link bzw. QR-Code zur fertigen `.apk`.
Vorher die Variablen aus `.env` mit `eas env:create` hinterlegen.

### Weg B – GitHub Actions (ohne Expo-Konto)

Projekt in ein GitHub-Repository hochladen. Unter *Settings → Secrets and variables → Actions* die Secrets
`EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_APP_TOKEN` (und optional `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`) anlegen.
Dann unter *Actions → „Android APK bauen“ → Run workflow* starten. Die APK liegt danach unter *Artifacts*.
Sie ist mit dem Debug-Schlüssel signiert: gut zum Installieren und Testen, für den Play Store nimm Weg A
(`--profile production` erzeugt das dort verlangte `.aab`).

## Bezahlschranke einrichten (RevenueCat)

1. Kostenloses Konto auf https://www.revenuecat.com, Projekt anlegen, iOS- und Android-App verbinden.
2. In App Store Connect / Google Play ein Abo anlegen (z. B. 4,99 €/Monat) und in RevenueCat einem
   Entitlement mit der ID `pro` zuordnen. Eine Paywall im RevenueCat-Paywall-Editor gestalten.
3. Die öffentlichen SDK-Schlüssel in `app/.env` eintragen:

```
EXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_...
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=goog_...
```

Die Gratis-Scans werden auf dem Gerät gezählt. Wer die App neu installiert, bekommt sie wieder –
für mehr Schutz später zusätzlich im Worker pro Nutzer zählen.

## 3. In den App Store hochladen

1. **Apple Developer Program** beitreten (99 €/Jahr): https://developer.apple.com/programs/
2. In `app/app.json` `com.DEINNAME.resellerscan` durch eine eigene Bundle-ID ersetzen.
3. Build und Upload über EAS (Expo baut in der Cloud, kein Mac nötig):

   ```bash
   npm install -g eas-cli
   ```

   ```bash
   cd app && eas login && eas build:configure
   ```

   ```bash
   eas build --platform ios --profile production
   ```

   ```bash
   eas submit --platform ios
   ```

   Die Variablen aus `.env` vorher mit `eas env:create` auch für den Cloud-Build hinterlegen.

4. In **App Store Connect** ausfüllen:
   - Screenshots (6,9"- und 6,5"-iPhone), Beschreibung, Keywords, Support-URL
   - **Datenschutzerklärung (Pflicht)**: Fotos werden zur Auswertung an deinen Server und an Anthropic gesendet.
     Unter „App-Datenschutz“ angeben: *Fotos – zur App-Funktionalität, nicht mit Identität verknüpft, kein Tracking*.
   - Altersfreigabe-Fragebogen, Preis (kostenlos oder Abo)
5. Zur Prüfung einreichen – meist 1–3 Tage.

### Vorschlag für den App-Store-Eintrag

- **Name:** Reseller Scan – Maße & SEO
- **Untertitel:** Kleidung messen, Texte für Vinted
- **Keywords:** vinted,ebay,kleinanzeigen,reseller,maße,messen,kleidung,bundweite,secondhand,listing,seo,flohmarkt

## Vor dem Launch noch sinnvoll

- **Rate-Limit pro Gerät** im Worker (Cloudflare KV oder Durable Objects)
- Ein richtiges Splash-Bild und App-Icon vom Designer (`app/assets/icon.png` ist ein Platzhalter)
- Ein paar Testscans mit Maßband nachmessen und den Prompt in `server/src/index.ts` bei Bedarf schärfen
