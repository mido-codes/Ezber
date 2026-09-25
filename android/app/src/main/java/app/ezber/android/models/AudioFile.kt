package app.ezber.android.models

/**
 * One row of the content bundle's audio manifest (`audio_files` in
 * `ezber-content.sqlite`, `audio-files.json` in the web export).
 *
 * URLs are absolute upstream links (internet archive) or paths relative to the
 * bundle; [bytes] and [checksum] are the build-time digest the local cache
 * verifies after downloading.
 */
data class AudioFileEntry(
    val id: Long,
    val reciterId: Int,
    val kind: String,
    val surahId: Int?,
    val ayah: Int?,
    val chapter: Int?,
    val variant: String,
    val url: String,
    val bytes: Long? = null,
    val bitrate: Int? = null,
    val durationMs: Long? = null,
    val checksum: String? = null,
) {
    val isChapter: Boolean get() = kind == "chapter"

    /** Stable cache identity for this manifest row. */
    val cacheKey: String get() = "$reciterId:$variant:$kind:${chapter ?: surahId ?: 0}:${ayah ?: 0}:$id"
}
