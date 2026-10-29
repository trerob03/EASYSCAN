package de.schrankmatcher

import android.app.Application
import android.content.Context
import android.graphics.ImageDecoder
import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

data class Frame(val nr: Int, val file: File, val thumb: ImageBitmap)

class MainViewModel(app: Application) : AndroidViewModel(app) {
    companion object {
        const val MAX_FRAMES = 40
        const val WARDROBE_MAX_SIDE = 512
        const val INSPO_MAX_SIDE = 1024
        private const val THUMB_MAX_SIDE = 300
    }

    private val prefs = app.getSharedPreferences("settings", Context.MODE_PRIVATE)
    private val framesDir = File(app.cacheDir, "frames")

    var apiKey by mutableStateOf(prefs.getString("api_key", "") ?: "")
        private set

    val frames = mutableStateListOf<Frame>()
    val excluded = mutableStateMapOf<Int, Boolean>()
    var inspo by mutableStateOf<ImageBitmap?>(null)
        private set
    private var inspoJpeg: ByteArray? = null

    var busy by mutableStateOf(false)
        private set
    var status by mutableStateOf<String?>(null)
        private set
    var error by mutableStateOf<String?>(null)
        private set
    var result by mutableStateOf<MatchResult?>(null)
        private set

    val selectedCount: Int get() = frames.count { excluded[it.nr] != true }
    val canMatch: Boolean get() = !busy && inspo != null && selectedCount in 1..MAX_FRAMES

    fun saveApiKey(key: String) {
        apiKey = key.trim()
        prefs.edit().putString("api_key", apiKey).apply()
    }

    fun toggle(nr: Int) {
        excluded[nr] = excluded[nr] != true
    }

    fun frameFor(nr: Int): Frame? = frames.firstOrNull { it.nr == nr }

    fun loadVideo(uri: Uri) = runTask("Video wird verarbeitet …") {
        frames.clear()
        excluded.clear()
        result = null
        val context = getApplication<Application>()
        val loaded = withContext(Dispatchers.IO) {
            val files = FrameExtractor.extract(context, uri, framesDir) { p ->
                viewModelScope.launch { status = "Video wird verarbeitet … ${(p * 100).toInt()} %" }
            }
            files.mapIndexed { i, file ->
                val thumb = ImageUtils.loadScaled(ImageDecoder.createSource(file), THUMB_MAX_SIDE)
                Frame(i + 1, file, thumb.asImageBitmap())
            }
        }
        frames.addAll(loaded)
        if (loaded.isEmpty()) {
            status = null
            error = "Keine Bilder im Video gefunden."
        } else status = "${loaded.size} Teile gefunden. Tippe auf ein Bild, um es auszuschließen."
    }

    fun loadInspo(uri: Uri) = runTask(null) {
        val context = getApplication<Application>()
        val bitmap = withContext(Dispatchers.IO) {
            ImageUtils.loadScaled(ImageDecoder.createSource(context.contentResolver, uri), INSPO_MAX_SIDE)
        }
        inspoJpeg = withContext(Dispatchers.Default) { ImageUtils.toJpeg(bitmap) }
        inspo = bitmap.asImageBitmap()
        result = null
    }

    fun match() {
        val key = apiKey
        val inspoBytes = inspoJpeg ?: return
        if (key.isBlank()) {
            error = "Bitte zuerst oben rechts deinen API-Key eintragen."
            return
        }
        val selected = frames.filter { excluded[it.nr] != true }
        runTask("Claude vergleicht … (kann bis zu einer Minute dauern)") {
            result = null
            val wardrobe = withContext(Dispatchers.IO) {
                selected.associate { frame ->
                    val bmp = ImageUtils.loadScaled(ImageDecoder.createSource(frame.file), WARDROBE_MAX_SIDE)
                    frame.nr to ImageUtils.toJpeg(bmp)
                }
            }
            result = withContext(Dispatchers.IO) { ClaudeMatcher.match(key, wardrobe, inspoBytes) }
            status = null
        }
    }

    private fun runTask(startStatus: String?, block: suspend () -> Unit) {
        viewModelScope.launch {
            busy = true
            error = null
            status = startStatus
            try {
                block()
            } catch (e: MatchException) {
                error = e.message
                status = null
            } catch (e: Exception) {
                error = "Fehler: ${e.message ?: e.javaClass.simpleName}"
                status = null
            } finally {
                busy = false
            }
        }
    }
}
