import Anthropic from "@anthropic-ai/sdk";

// Cloudflare Worker: nimmt ein Foto entgegen, lässt Claude das Kleidungsstück
// vermessen und gibt Maße + SEO-Texte als JSON zurück. Der API-Schlüssel bleibt
// hier auf dem Server und steckt nie in der App.

export interface Env {
  ANTHROPIC_API_KEY: string;
  APP_TOKEN: string; // gemeinsames Geheimnis, das die App mitschickt
}

const MASS = { type: ["number", "null"], description: "Zentimeter, flach gemessen; null wenn bei diesem Teil nicht sinnvoll" };

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "artikel", "kategorie", "marke", "groesse", "farbe", "material", "zustand",
    "masse", "referenz_erkannt", "genauigkeit_cm", "hinweis", "seo_titel", "seo_beschreibung", "hashtags",
  ],
  properties: {
    artikel: { type: "string", description: "Kurzer Name, z. B. 'Levi's 501 Jeans'" },
    kategorie: { type: "string", enum: ["Hose", "Shorts", "Rock", "Kleid", "T-Shirt", "Hemd", "Pullover", "Jacke", "Mantel", "Sonstiges"] },
    marke: { type: ["string", "null"] },
    groesse: { type: ["string", "null"], description: "Etikettgröße falls lesbar" },
    farbe: { type: "string" },
    material: { type: ["string", "null"] },
    zustand: { type: "string", enum: ["Neu mit Etikett", "Wie neu", "Sehr gut", "Gut", "Akzeptabel"] },
    masse: {
      type: "object",
      additionalProperties: false,
      required: [
        "bundweite_cm", "hueftbreite_cm", "brustbreite_cm", "schulterbreite_cm",
        "laenge_cm", "schrittlaenge_cm", "aermellaenge_cm", "beinoeffnung_cm",
      ],
      properties: {
        bundweite_cm: MASS, hueftbreite_cm: MASS, brustbreite_cm: MASS, schulterbreite_cm: MASS,
        laenge_cm: MASS, schrittlaenge_cm: MASS, aermellaenge_cm: MASS, beinoeffnung_cm: MASS,
      },
    },
    referenz_erkannt: { type: "boolean", description: "Ob das DIN-A4-Blatt (21,0 x 29,7 cm) im Bild gefunden wurde" },
    genauigkeit_cm: { type: "number", description: "Geschätzte Unsicherheit der Maße in ± cm" },
    hinweis: { type: ["string", "null"], description: "Tipp für ein besseres Foto, falls nötig" },
    seo_titel: { type: "string", description: "Max. 80 Zeichen, Marke + Artikel + Größe + Farbe + Stil" },
    seo_beschreibung: { type: "string", description: "3-5 Sätze inkl. aller Maße in cm, Zustand, Material, Stil-Keywords" },
    hashtags: { type: "array", items: { type: "string" } },
  },
} as const;

const PROMPT = `Du bist ein Vermessungs- und Listing-Assistent für Second-Hand-Reseller (Vinted, eBay, Kleinanzeigen).

Auf dem Foto liegt ein Kleidungsstück flach, daneben ein DIN-A4-Blatt (21,0 x 29,7 cm) als Maßstab.
1. Finde das A4-Blatt, bestimme daraus den Maßstab (Pixel pro cm) und berücksichtige die Perspektive.
2. Miss das Kleidungsstück wie Reseller es tun, flach liegend:
   - Bundweite: Bund von Kante zu Kante (halber Umfang)
   - Hüftbreite: an der breitesten Stelle unterhalb des Bundes
   - Brustbreite: Achsel zu Achsel
   - Schulterbreite: Schulternaht zu Schulternaht
   - Länge: höchster Punkt bis Saum
   - Innenbein (Schrittlänge), Ärmellänge (Schulternaht bis Bündchen), Beinöffnung
   Maße, die beim Teil keinen Sinn ergeben, sind null. Runde auf 0,5 cm.
3. Ist kein A4-Blatt zu sehen, schätze anhand typischer Proportionen, setze referenz_erkannt=false, eine größere Unsicherheit und einen Hinweis.
4. Lies Marke, Größe und Material vom Etikett, wenn sichtbar. Erfinde nichts: Unbekanntes ist null.
5. Schreibe auf Deutsch einen SEO-Titel (max. 80 Zeichen) und eine verkaufsstarke Beschreibung mit allen Maßen.`;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-app-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...cors } });

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    if (req.method !== "POST" || new URL(req.url).pathname !== "/scan") return json({ error: "Nicht gefunden" }, 404);
    if (req.headers.get("x-app-token") !== env.APP_TOKEN) return json({ error: "Nicht autorisiert" }, 401);

    const { image } = (await req.json()) as { image?: string };
    if (!image || image.length > 7_000_000) return json({ error: "Bild fehlt oder ist zu groß" }, 400);

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    try {
      const response = await client.beta.messages.create({
        model: "claude-opus-5-5",
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
              { type: "text", text: PROMPT },
            ],
          },
        ],
      });

      if (response.stop_reason === "refusal") return json({ error: "Bild konnte nicht ausgewertet werden" }, 422);
      if (response.stop_reason === "max_tokens") return json({ error: "Antwort unvollständig, bitte erneut scannen" }, 502);

      const text = response.content.find((b) => b.type === "text");
      if (!text || text.type !== "text") return json({ error: "Keine Auswertung erhalten" }, 502);
      return json(JSON.parse(text.text));
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) return json({ error: "Zu viele Anfragen, kurz warten" }, 429);
      if (err instanceof Anthropic.APIError) return json({ error: "KI-Dienst nicht erreichbar" }, 502);
      throw err;
    }
  },
};
