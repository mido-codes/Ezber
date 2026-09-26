package app.ezber.android.content

import app.ezber.android.persistence.ContentCache
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.security.MessageDigest

/**
 * Exercises the lazy-fetch engine with a fake fetcher and an in-memory cache:
 * the catalogue imports once, surah and segment files are fetched once and
 * cached, absent files are remembered, digests are enforced, and a forced
 * refresh with a new bundle digest drops stale pieces.
 */
class ContentRepositoryTest {

    @Test
    fun `imports the catalogue once and fetches each piece only once`() = runBlocking {
        val cache = TestContentCache()
        val fetcher = catalogueFetcher(bundleDigest = "sha256:eeee")
        val repository = repository(cache, fetcher)

        repository.ensureIndex()
        assertEquals(ContentPhase.READY, repository.state.phase)
        assertTrue(repository.state.catalogReady)
        assertEquals(1, cache.allSurahs().size)
        assertEquals(1, cache.allReciters().size)

        repository.ensureIndex()
        assertEquals(1, fetcher.requests.count { it.endsWith("index.json") })

        repository.ensureSurah(55)
        repository.ensureSurah(55)
        assertEquals(1, fetcher.requests.count { it.endsWith("surahs/55.json") })
        assertTrue(repository.state.isSurahCached(55))

        repository.ensureSegments(reciterId = 1, surahId = 55)
        repository.ensureSegments(reciterId = 1, surahId = 55)
        assertEquals(1, fetcher.requests.count { it.endsWith("segments/1/55.json") })
        assertEquals("cached", repository.state.segmentMarker(1, 55))

        // A pair with no timing file is remembered as absent, not refetched.
        repository.ensureSegments(reciterId = 2, surahId = 55)
        repository.ensureSegments(reciterId = 2, surahId = 55)
        assertEquals("absent", repository.state.segmentMarker(2, 55))
        assertEquals(0, fetcher.requests.count { it.endsWith("segments/2/55.json") })
    }

    @Test
    fun `rejects a surah body whose digest does not match the index`() = runBlocking {
        val cache = TestContentCache()
        val fetcher = catalogueFetcher(bundleDigest = "sha256:eeee", corruptSurahDigest = true)
        val repository = repository(cache, fetcher)

        repository.ensureIndex()
        repository.ensureSurah(55)

        val failure = repository.state.surahFailures[55]
        assertNotNull(failure)
        assertTrue(failure!!.contains("digest mismatch"))
        assertTrue(repository.state.cachedSurahs.isEmpty())
    }

    @Test
    fun `a forced refresh with a new digest drops stale pieces`() = runBlocking {
        val cache = TestContentCache()
        val fetcher = catalogueFetcher(bundleDigest = "sha256:aaaa", surahText = "old text")
        val repository = repository(cache, fetcher)

        repository.ensureIndex()
        repository.ensureSurah(55)
        assertTrue(repository.state.isSurahCached(55))

        fetcher.bodies[indexUrl] = indexBody(
            bundleDigest = "sha256:bbbb",
            surahBody = surahBody("new text"),
            transliterationBody = TRANSLITERATIONS,
        )
        repository.ensureIndex(force = true)

        assertTrue(repository.state.cachedSurahs.isEmpty())
        assertTrue(cache.surahContent.isEmpty())
        assertEquals(1, repository.state.counts["surahs"])
    }

    @Test
    fun `a failed refresh keeps the cached catalogue and reports the error`() = runBlocking {
        val cache = TestContentCache()
        val fetcher = catalogueFetcher(bundleDigest = "sha256:aaaa")
        val repository = repository(cache, fetcher)

        repository.ensureIndex()
        fetcher.failAll = true
        repository.ensureIndex(force = true)

        assertEquals(ContentPhase.READY, repository.state.phase)
        assertNotNull(repository.state.lastError)
        assertEquals(1, cache.allSurahs().size)
    }

    @Test
    fun `a new process re-probes the index and keeps cached pieces`() = runBlocking {
        val cache = TestContentCache()
        val fetcher = catalogueFetcher(bundleDigest = "sha256:aaaa")

        val first = repository(cache, fetcher)
        first.ensureIndex()
        first.ensureSurah(55)

        val second = repository(cache, fetcher)
        second.ensureIndex()

        assertEquals(2, fetcher.requests.count { it.endsWith("index.json") })
        assertNotNull(second.state.files["surahs/55.json"])
        assertTrue(second.state.isSurahCached(55))

        // The cached surah is served without another network request.
        second.ensureSurah(55)
        assertEquals(1, fetcher.requests.count { it.endsWith("surahs/55.json") })
    }

    private fun repository(cache: ContentCache, fetcher: ContentFetcher) =
        ContentRepository(
            store = cache,
            fetcher = fetcher,
            baseUrl = { "https://content.test/base/" },
            now = { "2026-01-01T00:00:00.000Z" },
        )

    private fun catalogueFetcher(
        bundleDigest: String,
        surahText: String = "Ar-Rahman",
        corruptSurahDigest: Boolean = false,
    ): FakeFetcher = FakeFetcher(
        mutableMapOf(
            indexUrl to indexBody(
                bundleDigest = bundleDigest,
                surahBody = surahBody(surahText),
                transliterationBody = TRANSLITERATIONS,
                corruptSurahDigest = corruptSurahDigest,
            ),
            "$baseUrl/surahs/55.json" to surahBody(surahText),
            "$baseUrl/segments/1/55.json" to SEGMENTS,
            "$baseUrl/transliterations.json" to TRANSLITERATIONS,
            "$baseUrl/licenses.json" to LICENSES,
            "$baseUrl/TANZIL-NOTICE.txt" to "Tanzil notice",
        ),
    )

    private fun indexBody(
        bundleDigest: String,
        surahBody: String,
        transliterationBody: String,
        corruptSurahDigest: Boolean = false,
    ): String {
        val surahDigest = if (corruptSurahDigest) sha256("something else") else sha256(surahBody)
        val transliterationDigest = sha256(transliterationBody)
        return """
        {
          "web_bundle_version": 2,
          "layout": "grouped",
          "generated_by": {"pipeline_version": "0.3.0"},
          "content_mode": "offline-redistributable",
          "schema_version": 1,
          "counts": {"surahs": 1, "ayahs": 1, "words": 1, "reciters": 1, "segments": 1},
          "surahs": {"columns": ["id", "name_arabic", "name_latin", "name_english",
                     "verses_count", "revelation", "bismillah_pre"],
                     "rows": [[55, "الرحمن", "Ar-Rahman", "The Beneficent", 78, "Medinan", 1]]},
          "reciters": {"columns": ["id", "remote_id", "name", "style", "qirat", "source",
                       "license_id", "license_url", "license_evidence_url", "attribution",
                       "has_segments", "enabled"],
                       "rows": [[1, "r1", "Reciter One", "Murattal", "Hafs 'an Asim",
                                 "internet_archive", "lic", "", "", "Attribution", 1, 1]]},
          "files": [
            {"path": "surahs/55.json", "kind": "surah", "sha256": "sha256:$surahDigest",
             "bytes": 1, "surah_id": 55},
            {"path": "segments/1/55.json", "kind": "segments", "sha256": "sha256:${sha256(SEGMENTS)}",
             "bytes": 1, "reciter_id": 1, "surah_id": 55, "variant": "murattal"},
            {"path": "transliterations.json", "kind": "transliterations",
             "sha256": "sha256:$transliterationDigest", "bytes": 1},
            {"path": "licenses.json", "kind": "licenses", "sha256": "sha256:${sha256(LICENSES)}",
             "bytes": 1},
            {"path": "TANZIL-NOTICE.txt", "kind": "notice", "sha256": "sha256:${sha256("Tanzil notice")}",
             "bytes": 1}
          ],
          "bundle_digest": "$bundleDigest"
        }
        """.trimIndent()
    }

    private fun surahBody(text: String): String = """
        {
          "surah_id": 55,
          "ayahs": {"columns": ["id", "surah_id", "ayah", "verse_key", "text_uthmani",
                    "transliteration", "juz", "hizb", "page", "sajdah", "sajdah_type"],
                    "rows": [[4904, 55, 1, "55:1", "الرحمن", "$text", 27, 53, 531, 0, null]]},
          "transliteration_rows": {"columns": ["transliteration_id", "ayah_id", "text"],
                                   "rows": [[1, 4904, "$text"]]},
          "words": {"columns": ["id", "ayah_id", "position", "text_uthmani",
                    "transliteration", "translation"],
                    "rows": [[1, 4904, 1, "الرحمن", "$text", null]]}
        }
    """.trimIndent()

    private fun sha256(body: String): String =
        MessageDigest.getInstance("SHA-256")
            .digest(body.toByteArray(Charsets.UTF_8))
            .joinToString("") { byte -> "%02x".format(byte) }

    private class FakeFetcher(
        val bodies: MutableMap<String, String>,
    ) : ContentFetcher {
        val requests = mutableListOf<String>()
        var failAll = false

        override suspend fun fetch(url: String): String {
            requests += url
            if (failAll) throw ContentFetchException("$url: offline")
            return bodies[url] ?: throw ContentFetchException("$url: HTTP 404")
        }
    }

    private companion object {
        const val baseUrl = "https://content.test/base"

        val indexUrl get() = "$baseUrl/index.json"

        const val TRANSLITERATIONS = """
        {"columns": ["id", "resource_id", "name", "author", "language", "source",
                     "license_id", "license_url", "license_evidence_url", "attribution"],
         "rows": [[1, "tanzil.en.transliteration", "Tanzil", "Tanzil", "en", "tanzil",
                   "tanzil-transliteration-permission", "", "", "Tanzil Project"]]}
        """

        const val LICENSES = """
        {"licenses": [{"id": "tanzil-quran-text", "name": "Tanzil Uthmani 1.1"}],
         "attributions": [], "notices": []}
        """

        const val SEGMENTS = """
        {"reciter_id": 1, "variant": "murattal", "surah_id": 55,
         "columns": ["ayah_id", "word_index", "start_ms", "end_ms"],
         "rows": [[4904, 0, 0, 4210]]}
        """
    }
}
