package de.schrankmatcher

import com.anthropic.client.okhttp.AnthropicOkHttpClient
import com.anthropic.core.JsonValue
import com.anthropic.errors.AnthropicServiceException
import com.anthropic.errors.AnthropicIoException
import com.anthropic.errors.RateLimitException
import com.anthropic.errors.UnauthorizedException
import com.anthropic.models.messages.Base64ImageSource
import com.anthropic.models.messages.ContentBlockParam
import com.anthropic.models.messages.ImageBlockParam
import com.anthropic.models.messages.JsonOutputFormat
import com.anthropic.models.messages.MessageCreateParams
import com.anthropic.models.messages.OutputConfig
import com.anthropic.models.messages.StopReason
import com.anthropic.models.messages.TextBlockParam
import com.fasterxml.jackson.databind.ObjectMapper
import java.time.Duration
import java.util.Base64

data class MatchedItem(
    val teilNummer: Int,
    val bezeichnung: String,
    val entsprichtImInspo: String,
    val begruendung: String,
    val aehnlichkeit: String,
)

data class MatchResult(
    val outfitBeschreibung: String,
    val passendeTeile: List<MatchedItem>,
)

class MatchException(message: String) : Exception(message)

/** Schickt Schrank-Bilder + Inspo-Bild an Claude. Bilder als bereits verkleinerte JPEG-Bytes. */
object ClaudeMatcher {
    const val MODEL = "claude-opus-5-5"

    private const val PROMPT = """Oben siehst du nummerierte Fotos aus meinem Kleiderschrank (je ein Kleidungsstück, in die Kamera gehalten) und zuletzt ein Inspirations-Outfit.

1. Beschreibe das Inspo-Outfit kurz (welche Teile, Farben, Stil).
2. Wähle für jedes Teil des Inspo-Outfits genau ein Teil aus meinem Schrank, das ihm am ähnlichsten ist – auch wenn es nicht perfekt passt, nimm die beste verfügbare Alternative (z. B. gleiche Farbe, ähnlicher Schnitt oder gleiche Funktion im Outfit). Begründe kurz anhand von Farbe, Schnitt und Stil. Nutze nur Teilnummern, die oben vorkommen, und jedes Schrank-Teil höchstens einmal.
Gib bei "aehnlichkeit" genau einen dieser Werte an: "sehr ähnlich", "ähnlich", "beste verfügbare Alternative".

Antworte auf Deutsch. Manche Fotos können unscharf oder doppelt sein, ignoriere unbrauchbare."""

    private val schema: Map<String, Any> = mapOf(
        "type" to "object",
        "properties" to mapOf(
            "outfit_beschreibung" to mapOf("type" to "string"),
            "passende_teile" to mapOf(
                "type" to "array",
                "items" to mapOf(
                    "type" to "object",
                    "properties" to mapOf(
                        "teil_nummer" to mapOf("type" to "integer"),
                        "bezeichnung" to mapOf("type" to "string"),
                        "entspricht_im_inspo" to mapOf("type" to "string"),
                        "begruendung" to mapOf("type" to "string"),
                        "aehnlichkeit" to mapOf(
                            "type" to "string",
                            "enum" to listOf("sehr ähnlich", "ähnlich", "beste verfügbare Alternative"),
                        ),
                    ),
                    "required" to listOf("teil_nummer", "bezeichnung", "entspricht_im_inspo", "begruendung", "aehnlichkeit"),
                    "additionalProperties" to false,
                ),
            ),
        ),
        "required" to listOf("outfit_beschreibung", "passende_teile"),
        "additionalProperties" to false,
    )

    private fun imageBlock(jpeg: ByteArray): ContentBlockParam = ContentBlockParam.ofImage(
        ImageBlockParam.builder()
            .source(
                Base64ImageSource.builder()
                    .mediaType(Base64ImageSource.MediaType.IMAGE_JPEG)
                    .data(Base64.getEncoder().encodeToString(jpeg))
                    .build()
            )
            .build()
    )

    private fun textBlock(text: String): ContentBlockParam =
        ContentBlockParam.ofText(TextBlockParam.builder().text(text).build())

    /** wardrobe: Teilnummer -> JPEG-Bytes. Blockiert – nicht im UI-Thread aufrufen. */
    fun match(apiKey: String, wardrobe: Map<Int, ByteArray>, inspo: ByteArray): MatchResult {
        val content = mutableListOf<ContentBlockParam>()
        for ((nr, jpeg) in wardrobe) {
            content += textBlock("Schrank-Teil $nr:")
            content += imageBlock(jpeg)
        }
        content += textBlock("Inspirations-Outfit:")
        content += imageBlock(inspo)
        content += textBlock(PROMPT)

        val schemaBuilder = JsonOutputFormat.Schema.builder()
        schema.forEach { (k, v) -> schemaBuilder.putAdditionalProperty(k, JsonValue.from(v)) }

        val params = MessageCreateParams.builder()
            .model(MODEL)
            .maxTokens(16000L)
            .outputConfig(
                OutputConfig.builder()
                    .effort(OutputConfig.Effort.LOW)
                    .format(JsonOutputFormat.builder().schema(schemaBuilder.build()).build())
                    .build()
            )
            .addUserMessageOfContentBlockParams(content)
            .build()

        val client = AnthropicOkHttpClient.builder()
            .apiKey(apiKey)
            .timeout(Duration.ofMinutes(3))
            .build()

        val response = try {
            client.messages().create(params)
        } catch (e: UnauthorizedException) {
            throw MatchException("API-Key ungültig. Bitte in den Einstellungen prüfen.")
        } catch (e: RateLimitException) {
            throw MatchException("Rate-Limit erreicht – kurz warten und erneut versuchen.")
        } catch (e: AnthropicServiceException) {
            throw MatchException("Claude-API-Fehler (${e.statusCode()}): ${e.message}")
        } catch (e: AnthropicIoException) {
            throw MatchException("Keine Verbindung zur Claude-API. Internet prüfen.")
        } finally {
            client.close()
        }

        if (response.stopReason().orElse(null) == StopReason.REFUSAL) {
            throw MatchException("Claude hat die Anfrage abgelehnt.")
        }
        val json = response.content().firstNotNullOfOrNull { it.text().orElse(null)?.text() }
            ?: throw MatchException("Claude hat keine auswertbare Antwort geliefert.")

        val root = ObjectMapper().readTree(json)
        return MatchResult(
            outfitBeschreibung = root.path("outfit_beschreibung").asText(),
            passendeTeile = root.path("passende_teile").map {
                MatchedItem(
                    teilNummer = it.path("teil_nummer").asInt(),
                    bezeichnung = it.path("bezeichnung").asText(),
                    entsprichtImInspo = it.path("entspricht_im_inspo").asText(),
                    begruendung = it.path("begruendung").asText(),
                    aehnlichkeit = it.path("aehnlichkeit").asText(),
                )
            }.filter { it.teilNummer in wardrobe },
        )
    }
}
