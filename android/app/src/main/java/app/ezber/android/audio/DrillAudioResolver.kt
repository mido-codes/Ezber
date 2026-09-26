package app.ezber.android.audio

import android.net.Uri
import app.ezber.android.models.AudioFileEntry
import app.ezber.android.persistence.ContentProviding
import java.io.File

/** A manifest row whose audio is present locally and ready for ExoPlayer. */
data class ResolvedVerseAudio(
    val entry: AudioFileEntry,
    val file: File,
    val durationMs: Long?,
) {
    val uri: Uri get() = Uri.fromFile(file)

    val mimeType: String
        get() = when (file.extension.lowercase()) {
            "m4a", "mp4" -> "audio/mp4"
            "wav" -> "audio/wav"
            "ogg", "opus" -> "audio/ogg"
            "flac" -> "audio/flac"
            "webm" -> "audio/webm"
            else -> "audio/mpeg"
        }
}

/** Raised when the content bundle ships no audio manifest row for a verse. */
class NoAudioException(
    val reciterId: Int,
    val surahId: Int,
    val ayah: Int,
) : IllegalStateException(
    "No audio is available in the content bundle for reciter $reciterId at $surahId:$ayah",
)

/**
 * Resolves a verse to local audio using the content bundle's audio manifest.
 *
 * Selection mirrors the web pipeline's resolver: a per-ayah file wins, then a
 * chapter file covering the surah, then anything the manifest has for the
 * surah. The file is downloaded into [AudioCache] before playback; nothing
 * resolves without a manifest row, so there is no placeholder audio path.
 */
class DrillAudioResolver(
    private val content: ContentProviding,
    private val cache: AudioCache,
) {

    suspend fun resolve(reciterId: Int, surahId: Int, ayah: Int): ResolvedVerseAudio {
        val files = content.audioFiles(reciterId, surahId)
        val entry = files.firstOrNull { it.kind == "ayah" && it.ayah == ayah }
            ?: files.firstOrNull { it.isChapter && (it.chapter == surahId || it.surahId == surahId) }
            ?: files.firstOrNull { it.surahId == surahId || it.chapter == surahId }
            ?: throw NoAudioException(reciterId, surahId, ayah)

        val file = cache.ensureCached(entry)
        return ResolvedVerseAudio(entry = entry, file = file, durationMs = entry.durationMs)
    }
}
