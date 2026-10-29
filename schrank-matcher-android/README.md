# Schrank-Matcher (Android)

Native Android-App (Kotlin, Jetpack Compose). Alles läuft auf dem Handy – kein PC, kein Server.

1. **Video auswählen** – jedes Kleidungsstück ca. 1–2 Sekunden offen in die Kamera halten.
   Die App nimmt 1 Bild pro Sekunde und sortiert Bilder aus, die dem vorherigen zu ähnlich sind.
2. In der Galerie unbrauchbare Bilder (unscharf, doppelt) per Antippen abwählen.
3. **Inspo-Bild auswählen** (Screenshot von Pinterest/Instagram) → **Outfit abgleichen**.
4. Claude wählt für jedes Teil des Inspo-Outfits das ähnlichste Teil aus deinem Schrank
   und begründet die Wahl (Farbe, Schnitt, Stil).

Bilder werden vor dem Senden verkleinert (Schrank 512 px, Inspo 1024 px, JPEG).

## APK ohne Android Studio (GitHub Actions)

Bei jedem Push, der diesen Ordner ändert, baut der Workflow „Schrank-Matcher APK bauen“ automatisch eine APK.
Auf GitHub: **Actions** → letzten Lauf öffnen → unten unter **Artifacts** `schrank-matcher-apk` herunterladen,
entpacken und die `app-debug.apk` aufs Handy kopieren und installieren
(„Installation aus unbekannten Quellen“ erlauben). Manuell starten geht über **Run workflow**.

## Bauen & installieren

Voraussetzung: [Android Studio](https://developer.android.com/studio) (aktuelle Version).

1. Android Studio → **Open** → diesen Ordner `schrank-matcher-android` wählen.
   Beim ersten Öffnen lädt Android Studio Gradle und alle Abhängigkeiten (dauert ein paar Minuten).
2. Am Handy **Entwickleroptionen** und **USB-Debugging** aktivieren
   (Einstellungen → Über das Telefon → 7× auf „Build-Nummer“ tippen).
3. Handy per USB verbinden, oben das Gerät auswählen und auf **▶ Run** klicken.

Alternativ eine APK erzeugen: **Build → Build App Bundle(s) / APK(s) → Build APK(s)**.
Die Datei liegt dann unter `app/build/outputs/apk/debug/app-debug.apk` und kann aufs Handy kopiert
und installiert werden („Installation aus unbekannten Quellen“ erlauben).

Per Kommandozeile (mit installiertem Android SDK):

```bash
./gradlew assembleDebug
```

## API-Key

Beim ersten Start fragt die App nach deinem Anthropic API-Key (später änderbar über **API-Key** oben rechts).
Er wird nur lokal in den App-Einstellungen gespeichert. Für eine App, die du nur selbst nutzt, ist das okay –
für eine veröffentlichte App sollte der Key nie im Gerät liegen, sondern auf einem eigenen Server.

## Einstellungen im Code

| Wo | Was |
|---|---|
| `FrameExtractor.kt` → `STEP_MS` | Abstand zwischen geprüften Bildern (Standard 1000 ms) |
| `FrameExtractor.kt` → `DIFF_THRESHOLD` | Höher = weniger Duplikate, aber evtl. verpasste Teile |
| `MainViewModel.kt` → `MAX_FRAMES` | Max. Teile pro Anfrage (40) |
| `ClaudeMatcher.kt` → `MODEL` | Standard `claude-opus-5-5`; `claude-haiku-5-5` ist deutlich günstiger |

## Projektaufbau

```
app/src/main/java/de/schrankmatcher/
  MainActivity.kt    – Oberfläche (Compose)
  MainViewModel.kt   – Zustand & Abläufe
  FrameExtractor.kt  – Einzelbilder aus dem Video + Duplikat-Filter
  ImageUtils.kt      – Bilder verkleinern / als JPEG kodieren
  ClaudeMatcher.kt   – Anfrage an die Claude API (offizielles Anthropic Java SDK)
```
