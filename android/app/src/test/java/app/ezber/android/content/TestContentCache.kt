package app.ezber.android.content

import app.ezber.android.models.DownloadState
import app.ezber.android.models.Reciter
import app.ezber.android.models.Surah
import app.ezber.android.models.Verse
import app.ezber.android.models.VerseRange
import app.ezber.android.models.VerseWord
import app.ezber.android.models.WordSegment
import app.ezber.android.persistence.ContentCache

/**
 * In-memory [ContentCache] shared by the JVM content tests. It mirrors the
 * writes the repository performs, so the sync engine can be tested without
 * Android SQLite.
 */
internal class TestContentCache : ContentCache {

    private val metaValues = mutableMapOf<String, String>()
    private val surahs = linkedMapOf<Int, Surah>()
    private val reciters = linkedMapOf<Int, Reciter>()
    val surahContent = mutableMapOf<Int, SurahContent>()
    private val segmentContent = mutableMapOf<Pair<Int, Int>, SegmentContent>()
    private val absentSegments = mutableSetOf<Pair<Int, Int>>()
    private val editions = mutableListOf<TransliterationEdition>()
    private val audioFiles = mutableListOf<AudioFileContent>()
    var segmentsRequested = 0

    override fun meta(key: String): String? = metaValues[key]

    override fun setMeta(key: String, value: String?) {
        if (value == null) metaValues.remove(key) else metaValues[key] = value
    }

    override fun catalogDigest(): String? = metaValues["index.bundle_digest"]

    override fun cachedSurahIds(): Set<Int> = surahContent.keys.toSet()

    override fun segmentMarkers(): Map<Pair<Int, Int>, String> =
        segmentContent.keys.associateWith { "cached" } + absentSegments.associateWith { "absent" }

    override fun cachedTransliterationEditionCount(): Int = editions.size

    override fun hasAudioFiles(): Boolean = audioFiles.isNotEmpty()

    override fun counts(): Map<String, Int> = mapOf(
        "surahs" to surahs.size,
        "ayahs" to surahContent.values.sumOf { it.ayahs.size },
        "words" to surahContent.values.sumOf { it.words.size },
        "reciters" to reciters.size,
        "audio_files" to audioFiles.size,
        "segments" to segmentContent.values.sumOf { it.rows.size },
        "transliterations" to editions.size,
    )

    override fun replaceCatalog(index: ContentIndex) {
        surahs.clear()
        reciters.clear()
        surahContent.clear()
        segmentContent.clear()
        absentSegments.clear()
        editions.clear()
        audioFiles.clear()
        metaValues.clear()
        insertCatalog(index)
    }

    override fun insertCatalog(index: ContentIndex) {
        for (surah in index.surahs) surahs[surah.id] = surah
        for (reciter in index.reciters) reciters[reciter.id] = reciter
        metaValues["index.bundle_digest"] = index.bundleDigest.orEmpty()
    }

    override fun putSurahContent(payload: SurahContent, sha256: String?) {
        surahContent[payload.surahId] = payload
        metaValues["surah.${payload.surahId}.sha256"] = sha256 ?: "cached"
    }

    override fun putSegments(payload: SegmentContent, sha256: String?) {
        segmentsRequested++
        segmentContent[payload.reciterId to payload.surahId] = payload
        absentSegments.remove(payload.reciterId to payload.surahId)
        metaValues["segments.${payload.reciterId}.${payload.surahId}"] = sha256 ?: "cached"
    }

    override fun markSegmentsAbsent(reciterId: Int, surahId: Int) {
        absentSegments.add(reciterId to surahId)
        metaValues["segments.$reciterId.$surahId"] = "absent"
    }

    override fun putTransliterations(editions: List<TransliterationEdition>, sha256: String?) {
        this.editions.clear()
        this.editions.addAll(editions)
        metaValues["transliterations.sha256"] = sha256 ?: "cached"
    }

    override fun putAudioFiles(files: List<AudioFileContent>, sha256: String?) {
        audioFiles.clear()
        audioFiles.addAll(files)
        metaValues["audio_files.sha256"] = sha256 ?: "cached"
    }

    // ContentProviding reads

    override fun allSurahs(): List<Surah> = surahs.values.toList()

    override fun surah(id: Int): Surah? = surahs[id]

    override fun verses(surahId: Int, inRange: VerseRange): List<Verse> {
        val payload = surahContent[surahId] ?: return emptyList()
        return payload.ayahs
            .filter { it.ayah in inRange.start..inRange.end }
            .map { ayah ->
                Verse(
                    surahId = surahId,
                    number = ayah.ayah,
                    arabic = ayah.textUthmani,
                    transliteration = payload.transliterationRows
                        .firstOrNull { it.ayahId == ayah.id }?.text.orEmpty(),
                    ayahId = ayah.id,
                )
            }
    }

    override fun allReciters(): List<Reciter> = reciters.values.toList()

    override fun reciter(id: Int?): Reciter? = id?.let { reciters[it] }

    override fun words(ayahIds: List<Int>): Map<Int, List<VerseWord>> =
        surahContent.values
            .flatMap { it.words }
            .filter { it.ayahId in ayahIds }
            .sortedBy { it.position }
            .groupBy { it.ayahId }
            .mapValues { (_, rows) ->
                rows.map { word ->
                    VerseWord(
                        ayahId = word.ayahId,
                        position = word.position,
                        transliteration = word.transliteration,
                        arabic = word.textUthmani,
                        translation = word.translation,
                    )
                }
            }

    override fun segments(reciterId: Int, ayahIds: List<Int>): Map<Int, List<WordSegment>> =
        segmentContent.values
            .filter { it.reciterId == reciterId }
            .flatMap { it.rows }
            .filter { it.ayahId in ayahIds }
            .sortedBy { it.wordIndex }
            .groupBy { it.ayahId }
            .mapValues { (_, rows) ->
                rows.map { segment ->
                    WordSegment(
                        ayahId = segment.ayahId,
                        wordIndex = segment.wordIndex,
                        startMs = segment.startMs,
                        endMs = segment.endMs,
                    )
                }
            }

    override fun downloadState(reciterId: Int, surahId: Int): DownloadState =
        DownloadState.NOT_DOWNLOADED
}
