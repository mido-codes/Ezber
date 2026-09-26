package app.ezber.android.content

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Contract tests for the grouped web bundle parser
 * (`web/CONTENT_BUNDLE.md`). Fixtures mirror the exact shapes the pipeline's
 * `export-web` emits.
 */
class ContentJsonTest {

    @Test
    fun `parses the grouped index with inline surahs and reciters`() {
        val index = ContentJson.parseIndex(INDEX)

        assertEquals(2, index.webBundleVersion)
        assertEquals("grouped", index.layout)
        assertEquals("sha256:eeee", index.bundleDigest)
        assertEquals("sha256:1111", index.logicalDigest)
        assertEquals(114, index.counts["surahs"])
        assertEquals("0.3.0", index.generatedBy["pipeline_version"])

        assertEquals(1, index.surahs.size)
        val surah = index.surahs.single()
        assertEquals(55, surah.id)
        assertEquals("الرحمن", surah.nameArabic)
        assertEquals("Ar-Rahman", surah.nameLatin)
        assertEquals("The Beneficent", surah.nameEnglish)
        assertEquals(78, surah.verseCount)
        assertTrue(surah.bismillahPre)
        assertEquals("Medinan", surah.revelationPlace.label)

        assertEquals(2, index.reciters.size)
        val reciter = index.reciters.first()
        assertEquals("Reciter One", reciter.name)
        assertEquals("Murattal", reciter.style)
        assertEquals("Hafs 'an Asim", reciter.qirat)
        assertEquals("lic", reciter.licenseId)
        assertEquals("https://x", reciter.licenseUrl)
        assertTrue(reciter.hasSegments)
        assertTrue(reciter.enabled)
        // Rights-pending reciters stay in the catalogue.
        assertFalse(index.reciters.last().enabled)

        assertEquals(4, index.files.size)
        val surahFile = index.file("surahs/55.json")
        assertNotNull(surahFile)
        assertEquals("sha256:aaaa", surahFile?.sha256)
        assertEquals(55, surahFile?.surahId)
        val segmentFile = index.segmentFile(reciterId = 1, surahId = 55)
        assertEquals("murattal", segmentFile?.variant)
        assertNull(index.segmentFile(reciterId = 2, surahId = 55))
    }

    @Test
    fun `parses one surah file with ayahs, transliteration rows and words`() {
        val content = ContentJson.parseSurah(SURAH)
        assertEquals(55, content.surahId)
        assertEquals(2, content.ayahs.size)

        val first = content.ayahs.first()
        assertEquals(4904, first.id)
        assertEquals("55:1", first.verseKey)
        assertEquals("ٱلرَّحْمَٰنُ", first.textUthmani)
        assertEquals("Ar-Rahman", first.transliteration)
        assertEquals(27, first.juz)
        assertFalse(first.sajdah)

        assertEquals(2, content.transliterationRows.size)
        assertEquals(1, content.transliterationRows.first().transliterationId)
        assertEquals("'Allamal-Qur'an", content.transliterationRows.last().text)

        assertEquals(3, content.words.size)
        assertEquals(1, content.words.first().position)
        assertEquals("Ar-Rahman", content.words.first().transliteration)
    }

    @Test
    fun `parses a grouped segments file with header fields`() {
        val segments = ContentJson.parseSegments(SEGMENTS)
        assertEquals(1, segments.reciterId)
        assertEquals(55, segments.surahId)
        assertEquals("murattal", segments.variant)
        assertEquals(3, segments.rows.size)
        val wholeAyah = segments.rows.first()
        assertEquals(4904, wholeAyah.ayahId)
        assertEquals(0, wholeAyah.wordIndex)
        assertEquals(0L, wholeAyah.startMs)
        assertEquals(4210L, wholeAyah.endMs)
    }

    @Test
    fun `parses licenses, attributions and notices`() {
        val licenses = ContentJson.parseLicenses(LICENSES)
        assertEquals(1, licenses.licenses.size)
        assertEquals("tanzil-quran-text", licenses.licenses.single().id)
        assertEquals("Tanzil Uthmani 1.1", licenses.licenses.single().name)
        assertEquals("https://tanzil.net/", licenses.licenses.single().url)
        assertEquals("Quran text from the Tanzil Project.", licenses.attributions.single().text)
        assertEquals("TANZIL-NOTICE.txt", licenses.notices.single().path)
    }

    @Test
    fun `accepts an array of row objects as a table`() {
        val index = ContentJson.parseIndex(
            """
            {
              "web_bundle_version": 2,
              "layout": "grouped",
              "surahs": [{"id": 1, "name_latin": "Al-Faatiha", "verses_count": 7,
                          "revelation": "Meccan", "bismillah_pre": 0}],
              "reciters": [],
              "files": []
            }
            """.trimIndent(),
        )
        assertEquals(1, index.surahs.size)
        assertEquals("Al-Faatiha", index.surahs.single().nameLatin)
        assertEquals(7, index.surahs.single().verseCount)
        assertFalse(index.surahs.single().bismillahPre)
    }

    @Test
    fun `parses the whole-bundle audio catalogue and transliteration editions`() {
        val editions = ContentJson.parseTransliterations(TRANSLITERATIONS)
        assertEquals(1, editions.size)
        assertEquals("tanzil.en.transliteration", editions.single().resourceId)

        val audio = ContentJson.parseAudioFiles(AUDIO_FILES)
        assertEquals(1, audio.size)
        assertEquals("ayah", audio.single().kind)
        assertEquals(55, audio.single().surahId)
        assertEquals(1, audio.single().ayah)
        assertEquals(4210L, audio.single().durationMs)
    }

    private companion object {
        const val INDEX = """
        {
          "web_bundle_version": 2,
          "layout": "grouped",
          "generated_by": {"pipeline_version": "0.3.0"},
          "content_mode": "offline-redistributable",
          "schema_version": 1,
          "logical_digest": "sha256:1111",
          "counts": {"surahs": 114, "ayahs": 6236, "words": 51176, "reciters": 2,
                     "audio_files": 10, "segments": 100},
          "surahs": {
            "columns": ["id", "name_arabic", "name_latin", "name_english",
                        "verses_count", "revelation", "bismillah_pre", "revelation_order", "rukus"],
            "rows": [[55, "الرحمن", "Ar-Rahman", "The Beneficent", 78, "Medinan", 1, 97, 3]]
          },
          "reciters": {
            "columns": ["id", "remote_id", "name", "style", "qirat", "source", "license_id",
                        "license_url", "license_evidence_url", "attribution",
                        "has_segments", "enabled"],
            "rows": [
              [1, "r1", "Reciter One", "Murattal", "Hafs 'an Asim", "internet_archive", "lic",
               "https://x", "https://y", "Attribution", 1, 1],
              [2, "r2", "Reciter Two", null, null, "internet_archive", "lic2", "", "", "", 0, 0]
            ]
          },
          "files": [
            {"path": "surahs/55.json", "kind": "surah", "sha256": "sha256:aaaa", "bytes": 100,
             "surah_id": 55, "ayahs": 2, "words": 3, "transliteration_rows": 2},
            {"path": "segments/1/55.json", "kind": "segments", "sha256": "sha256:bbbb",
             "bytes": 50, "rows": 3, "reciter_id": 1, "surah_id": 55, "variant": "murattal"},
            {"path": "licenses.json", "kind": "licenses", "sha256": "sha256:cccc",
             "bytes": 10, "rows": 1},
            {"path": "TANZIL-NOTICE.txt", "kind": "notice", "sha256": "sha256:dddd", "bytes": 10}
          ],
          "bundle_digest": "sha256:eeee"
        }
        """

        const val SURAH = """
        {
          "surah_id": 55,
          "ayahs": {
            "columns": ["id", "surah_id", "ayah", "verse_key", "text_uthmani",
                        "transliteration", "juz", "hizb", "page", "sajdah", "sajdah_type"],
            "rows": [
              [4904, 55, 1, "55:1", "ٱلرَّحْمَٰنُ", "Ar-Rahman", 27, 53, 531, 0, null],
              [4905, 55, 2, "55:2", "عَلَّمَ ٱلْقُرْآنَ", "'Allamal-Qur'an", 27, 53, 531, 0, null]
            ]
          },
          "transliteration_rows": {
            "columns": ["transliteration_id", "ayah_id", "text"],
            "rows": [[1, 4904, "Ar-Rahman"], [1, 4905, "'Allamal-Qur'an"]]
          },
          "words": {
            "columns": ["id", "ayah_id", "position", "text_uthmani", "transliteration", "translation"],
            "rows": [
              [1, 4904, 1, "ٱلرَّحْمَٰنُ", "Ar-Rahman", null],
              [2, 4905, 1, "عَلَّمَ", "'Allama", null],
              [3, 4905, 2, "ٱلْقُرْآنَ", "l-Qur'an", null]
            ]
          }
        }
        """

        const val SEGMENTS = """
        {
          "reciter_id": 1,
          "variant": "murattal",
          "surah_id": 55,
          "columns": ["ayah_id", "word_index", "start_ms", "end_ms"],
          "rows": [[4904, 0, 0, 4210], [4904, 1, 0, 900], [4905, 0, 0, 5000]]
        }
        """

        const val LICENSES = """
        {
          "licenses": [
            {"id": "tanzil-quran-text", "name": "Tanzil Uthmani 1.1", "url": "https://tanzil.net/"}
          ],
          "attributions": [
            {"license_id": "tanzil-quran-text", "text": "Quran text from the Tanzil Project.",
             "source_kind": "asset", "source_id": "quran-text"}
          ],
          "notices": [
            {"path": "TANZIL-NOTICE.txt", "sha256": "sha256:dddd", "bytes": 10}
          ]
        }
        """

        const val TRANSLITERATIONS = """
        {
          "columns": ["id", "resource_id", "name", "author", "language", "source",
                      "license_id", "license_url", "license_evidence_url", "attribution"],
          "rows": [[1, "tanzil.en.transliteration", "Tanzil transliteration", "Tanzil",
                    "en", "tanzil", "tanzil-transliteration-permission", "https://tanzil.net/",
                    "https://tanzil.net/", "Tanzil Project"]]
        }
        """

        const val AUDIO_FILES = """
        {
          "columns": ["id", "reciter_id", "kind", "surah_id", "ayah", "chapter", "variant",
                      "url", "bytes", "bitrate", "duration_ms", "checksum"],
          "rows": [[1, 1, "ayah", 55, 1, null, "murattal", "https://audio/055001.mp3",
                    42311, 128, 4210, "sha1:abc"]]
        }
        """
    }
}
