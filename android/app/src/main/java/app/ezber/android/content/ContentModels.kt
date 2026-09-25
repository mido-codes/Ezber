package app.ezber.android.content

import app.ezber.android.models.Reciter
import app.ezber.android.models.Surah

/**
 * One file listed in the grouped web bundle's `index.json` inventory. The
 * digest is the pipeline's `sha256:<hex>` string and is verified against the
 * fetched body before anything is cached.
 */
data class ContentBundleFile(
    val path: String,
    val kind: String? = null,
    val sha256: String? = null,
    val bytes: Long? = null,
    val surahId: Int? = null,
    val reciterId: Int? = null,
    val variant: String? = null,
)

/**
 * `/content/index.json` in the grouped layout: the boot catalogue. It carries
 * the surah list and reciter catalogue inline (no verse text and no timings) so
 * it can be fetched eagerly; verse text is fetched per surah on demand.
 */
data class ContentIndex(
    val webBundleVersion: Int,
    val layout: String,
    val bundleDigest: String?,
    val logicalDigest: String?,
    val schemaVersion: Int?,
    val contentMode: String?,
    val generatedBy: Map<String, String>,
    val counts: Map<String, Int>,
    val surahs: List<Surah>,
    val reciters: List<Reciter>,
    val files: List<ContentBundleFile>,
) {
    fun file(path: String): ContentBundleFile? = files.firstOrNull { it.path == path }

    fun surahFile(surahId: Int): ContentBundleFile? = file("surahs/$surahId.json")

    fun segmentFile(reciterId: Int, surahId: Int): ContentBundleFile? =
        file("segments/$reciterId/$surahId.json")
}

/** One `/content/surahs/<id>.json` file: the surah's ayahs, words and transliteration rows. */
data class SurahContent(
    val surahId: Int,
    val ayahs: List<CachedAyah>,
    val transliterationRows: List<CachedTransliterationRow>,
    val words: List<CachedWord>,
)

data class CachedAyah(
    val id: Int,
    val surahId: Int,
    val ayah: Int,
    val verseKey: String,
    val textUthmani: String,
    val transliteration: String?,
    val juz: Int?,
    val hizb: Int?,
    val page: Int?,
    val sajdah: Boolean,
    val sajdahType: String?,
)

data class CachedTransliterationRow(
    val transliterationId: Int,
    val ayahId: Int,
    val text: String,
)

data class CachedWord(
    val id: Int,
    val ayahId: Int,
    val position: Int,
    val textUthmani: String?,
    val transliteration: String,
    val translation: String?,
)

/** One `/content/segments/<reciter_id>/<surah_id>.json` file. */
data class SegmentContent(
    val reciterId: Int,
    val surahId: Int,
    val variant: String,
    val rows: List<CachedSegment>,
)

data class CachedSegment(
    val ayahId: Int,
    val wordIndex: Int,
    val startMs: Long,
    val endMs: Long,
)

/** One row of `transliterations.json`: the edition metadata behind the rows. */
data class TransliterationEdition(
    val id: Int,
    val resourceId: String,
    val name: String,
    val author: String?,
    val language: String,
    val source: String,
    val licenseId: String,
    val licenseUrl: String,
    val licenseEvidenceUrl: String,
    val attribution: String,
)

/** One row of `audio-files.json`. Build-time download bookkeeping is omitted upstream. */
data class AudioFileContent(
    val id: Int,
    val reciterId: Int,
    val kind: String,
    val surahId: Int?,
    val ayah: Int?,
    val chapter: Int?,
    val variant: String,
    val url: String,
    val bytes: Long?,
    val bitrate: Int?,
    val durationMs: Long?,
    val checksum: String?,
)

/** `licenses.json`: used registry entries, attribution strings and notice files. */
data class LicensesContent(
    val licenses: List<LicenseEntry>,
    val attributions: List<AttributionLine>,
    val notices: List<NoticeEntry>,
)

data class LicenseEntry(
    val id: String,
    val name: String,
    val url: String?,
)

data class AttributionLine(
    val licenseId: String,
    val text: String,
    val sourceKind: String?,
    val sourceId: String?,
)

data class NoticeEntry(
    val path: String,
    val sha256: String?,
    val bytes: Long?,
)
