package app.ezber.android.content

import app.ezber.android.models.VerseRange
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File

/**
 * Runs the lazy fetch engine against the real grouped web bundle when
 * `content-pipeline/build/web/` exists (the `make web` output). It is skipped
 * on machines without a build, so it never blocks the unit suite; when it
 * does run it verifies the producer/consumer seam: the pipeline's file layout,
 * column names and sha256 digests must all satisfy the Android parser.
 */
class ContentBundleIntegrationTest {

    private val bundleDirectory: File? = generateSequence(File("").absoluteFile) { it.parentFile }
        .map { File(it, "content-pipeline/build/web") }
        .firstOrNull { File(it, "index.json").isFile }

    @Test
    fun `parses the real pipeline bundle end to end`() = runBlocking {
        val directory = bundleDirectory
        assumeTrue("no content-pipeline/build/web bundle; run `make web` first", directory != null)

        val cache = TestContentCache()
        val fetcher = DirectoryFetcher(requireNotNull(directory))
        val repository = ContentRepository(
            store = cache,
            fetcher = fetcher,
            baseUrl = { "https://content.local/" },
        )

        repository.ensureIndex()
        assertEquals(ContentPhase.READY, repository.state.phase)
        assertEquals(114, cache.allSurahs().size)
        assertTrue(cache.allReciters().isNotEmpty())
        assertTrue(repository.state.files.size > 1_000)
        assertNotNull(repository.state.files["surahs/55.json"])
        assertNotNull(repository.state.files["licenses.json"])

        repository.ensureSurah(55)
        assertTrue(repository.state.isSurahCached(55))
        val verses = cache.verses(55, VerseRange(1, 78))
        assertEquals(78, verses.size)
        assertTrue(verses.all { it.transliteration.isNotBlank() })
        assertTrue(verses.all { it.ayahId > 0 })
        assertTrue(verses.all { it.arabic.isNotBlank() })

        val ayahIds = verses.map { it.ayahId }
        val words = cache.words(ayahIds)
        assertTrue(words.values.any { it.isNotEmpty() })

        val segmentFile = repository.state.files.values
            .firstOrNull { it.kind == "segments" && it.surahId == 55 && it.reciterId != null }
            ?: repository.state.files.values.first { it.kind == "segments" && it.reciterId != null }
        val segmentSurahId = requireNotNull(segmentFile.surahId)
        val segmentReciterId = requireNotNull(segmentFile.reciterId)
        repository.ensureSurah(segmentSurahId)
        repository.ensureSegments(segmentReciterId, segmentSurahId)
        assertEquals("cached", repository.state.segmentMarker(segmentReciterId, segmentSurahId))
        val segmentAyahIds = cache.verses(segmentSurahId, VerseRange(1, 1)).map { it.ayahId }
        assertTrue(cache.segments(segmentReciterId, segmentAyahIds).values.any { it.isNotEmpty() })

        repository.loadCredits()
        assertTrue(repository.state.licenses.licenses.isNotEmpty())
        assertTrue(repository.state.licenses.attributions.isNotEmpty())
        assertTrue(repository.state.notice.orEmpty().isNotBlank())
    }

    /** Reads bundle files from disk while keeping the repository's URL hashing exact. */
    private class DirectoryFetcher(private val root: File) : ContentFetcher {
        override suspend fun fetch(url: String): String {
            val path = url.removePrefix("https://content.local/")
            val file = File(root, path)
            if (!file.isFile) throw ContentFetchException("$url: HTTP 404")
            return file.readBytes().decodeToString()
        }
    }
}
