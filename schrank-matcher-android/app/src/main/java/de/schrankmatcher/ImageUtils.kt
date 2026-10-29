package de.schrankmatcher

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ImageDecoder
import java.io.ByteArrayOutputStream
import kotlin.math.max
import kotlin.math.roundToInt

object ImageUtils {
    /** Dekodiert ein Bild (inkl. EXIF-Drehung) direkt in verkleinerter Größe. */
    fun loadScaled(source: ImageDecoder.Source, maxSide: Int): Bitmap =
        ImageDecoder.decodeBitmap(source) { decoder, info, _ ->
            val w = info.size.width
            val h = info.size.height
            val scale = minOf(1f, maxSide.toFloat() / max(w, h))
            decoder.setTargetSize(max(1, (w * scale).roundToInt()), max(1, (h * scale).roundToInt()))
            decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
        }

    /** JPEG-Bytes; transparente Bereiche (z. B. PNG-Screenshots) werden weiß statt schwarz. */
    fun toJpeg(bitmap: Bitmap, quality: Int = 80): ByteArray {
        val opaque = if (bitmap.hasAlpha()) {
            Bitmap.createBitmap(bitmap.width, bitmap.height, Bitmap.Config.ARGB_8888).also {
                val canvas = Canvas(it)
                canvas.drawColor(Color.WHITE)
                canvas.drawBitmap(bitmap, 0f, 0f, null)
            }
        } else bitmap
        return ByteArrayOutputStream().use {
            opaque.compress(Bitmap.CompressFormat.JPEG, quality, it)
            it.toByteArray()
        }
    }
}
