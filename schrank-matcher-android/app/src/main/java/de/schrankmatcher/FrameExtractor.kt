package de.schrankmatcher

import android.content.Context
import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import android.net.Uri
import java.io.File
import kotlin.math.abs

/** Nimmt 1 Bild pro Sekunde aus dem Video und verwirft Bilder, die dem zuletzt behaltenen zu ähnlich sind. */
object FrameExtractor {
    private const val STEP_MS = 1000L
    private const val MAX_SIDE = 800
    private const val DIFF_THRESHOLD = 18.0 // mittlere Farbdifferenz (0-255) pro Kanal

    fun extract(context: Context, uri: Uri, outDir: File, onProgress: (Float) -> Unit): List<File> {
        outDir.deleteRecursively()
        outDir.mkdirs()

        val retriever = MediaMetadataRetriever()
        try {
            retriever.setDataSource(context, uri)
            val durationMs = retriever
                .extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
                ?.toLongOrNull() ?: 0L

            val files = mutableListOf<File>()
            var lastSignature: IntArray? = null
            var t = 0L
            while (t <= durationMs) {
                val frame = retriever.getScaledFrameAtTime(
                    t * 1000, MediaMetadataRetriever.OPTION_CLOSEST, MAX_SIDE, MAX_SIDE
                )
                if (frame != null) {
                    val signature = signature(frame)
                    val last = lastSignature
                    if (last == null || difference(signature, last) > DIFF_THRESHOLD) {
                        val file = File(outDir, "teil_%03d.jpg".format(files.size + 1))
                        file.outputStream().use { frame.compress(Bitmap.CompressFormat.JPEG, 85, it) }
                        files += file
                        lastSignature = signature
                    }
                    frame.recycle()
                }
                if (durationMs > 0) onProgress((t.toFloat() / durationMs).coerceIn(0f, 1f))
                t += STEP_MS
            }
            return files
        } finally {
            retriever.release()
        }
    }

    /** 32x32-Farbminiatur als Fingerabdruck – Farbe zählt, nicht nur Helligkeit. */
    private fun signature(bitmap: Bitmap): IntArray {
        // In zwei Schritten verkleinern, damit Pixel gemittelt statt nur übersprungen werden
        val mid = Bitmap.createScaledBitmap(bitmap, 128, 128, true)
        val small = Bitmap.createScaledBitmap(mid, 32, 32, true)
        val pixels = IntArray(32 * 32)
        small.getPixels(pixels, 0, 32, 0, 0, 32, 32)
        mid.recycle()
        small.recycle()
        return pixels
    }

    private fun difference(a: IntArray, b: IntArray): Double {
        var sum = 0L
        for (i in a.indices) {
            val x = a[i]
            val y = b[i]
            sum += abs((x shr 16 and 0xFF) - (y shr 16 and 0xFF)) +
                abs((x shr 8 and 0xFF) - (y shr 8 and 0xFF)) +
                abs((x and 0xFF) - (y and 0xFF))
        }
        return sum.toDouble() / (a.size * 3)
    }
}
