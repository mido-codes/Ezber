package app.ezber.android.persistence

import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import app.ezber.android.content.AudioFileContent
import app.ezber.android.content.CachedAyah
import app.ezber.android.content.CachedWord
import app.ezber.android.content.ContentIndex
import app.ezber.android.content.SegmentContent
import app.ezber.android.content.SurahContent
import app.ezber.android.content.TransliterationEdition
import app.ezber.android.models.DownloadState
import app.ezber.android.models.Reciter
import app.ezber.android.models.RevelationPlace
import app.ezber.android.models.Surah
import app.ezber.android.models.Translation
import app.ezber.android.models.Verse
import app.ezber.android.models.VerseRange
import app.ezber.android.models.VerseWord
import app.ezber.android.models.WordSegment

/** Read access to the cached content bundle: surahs, verses, words and reciters. */
interface ContentProviding {
    fun allSurahs(): List<Surah>
    fun surah(id: Int): Surah?
    fun verses(surahId: Int, inRange: VerseRange): List<Verse>
    fun allReciters(): List<Reciter>
    fun reciter(id: Int?): Reciter?
    fun downloadState(reciterId: Int, surahId: Int): DownloadState

    /** Word rows for the given canonical ayah ids, keyed by ayah id, in order. */
    fun words(ayahIds: List<Int>): Map<Int, List<VerseWord>> = emptyMap()

    /** Timing segments for one reciter's take on the given ayahs, keyed by ayah id. */
    fun segments(reciterId: Int, ayahIds: List<Int>): Map<Int, List<WordSegment>> = emptyMap()
}

/**
 * The write side of the content cache. [SqliteContentStore] is the app
 * implementation; tests use an in-memory fake, which keeps the sync engine
 * (`content/ContentRepository`) independent of Android SQLite.
 */
interface ContentCache : ContentProviding {

    fun meta(key: String): String?
    fun setMeta(key: String, value: String?)
    fun catalogDigest(): String?
    fun cachedSurahIds(): Set<Int>
    fun segmentMarkers(): Map<Pair<Int, Int>, String>
    fun cachedTransliterationEditionCount(): Int
    fun hasAudioFiles(): Boolean
    fun counts(): Map<String, Int>

    fun replaceCatalog(index: ContentIndex)
    fun insertCatalog(index: ContentIndex)
    fun putSurahContent(payload: SurahContent, sha256: String?)
    fun putSegments(payload: SegmentContent, sha256: String?)
    fun markSegmentsAbsent(reciterId: Int, surahId: Int)
    fun putTransliterations(editions: List<TransliterationEdition>, sha256: String?)
    fun putAudioFiles(files: List<AudioFileContent>, sha256: String?)
}

/**
 * SQLite-backed cache of the web content bundle, mapped table-for-table to
 * `schema/content_schema.sql`. [ContentRepository] fills it lazily over HTTP;
 * this class owns the SQL and is safe to call from a background dispatcher.
 */
class SqliteContentStore(context: Context) : ContentCache {

    private val helper = ContentDatabase(context)

    // MARK: - ContentProviding

    override fun allSurahs(): List<Surah> = query(
        """
        SELECT id, name_arabic, name_latin, name_english, verses_count, revelation, bismillah_pre
        FROM surahs
        ORDER BY id
        """.trimIndent(),
    ) { cursor ->
        Surah(
            id = cursor.getInt(0),
            nameArabic = cursor.getString(1),
            nameLatin = cursor.getString(2),
            nameEnglish = cursor.getString(3),
            verseCount = cursor.getInt(4),
            revelationPlace = RevelationPlace.fromSchema(cursor.getString(5)),
            bismillahPre = cursor.getInt(6) == 1,
        )
    }

    override fun surah(id: Int): Surah? = allSurahs().firstOrNull { it.id == id }

    override fun verses(surahId: Int, inRange: VerseRange): List<Verse> {
        if (inRange.isEmpty) return emptyList()

        val rows = query(
            """
            SELECT a.id, a.ayah, a.text_uthmani, tr.text
            FROM ayahs AS a
            LEFT JOIN transliteration_rows AS tr ON tr.ayah_id = a.id
            WHERE a.surah_id = ? AND a.ayah BETWEEN ? AND ?
            ORDER BY a.ayah, tr.transliteration_id
            """.trimIndent(),
            arrayOf(surahId.toString(), inRange.start.toString(), inRange.end.toString()),
        ) { cursor ->
            VerseRow(
                ayahId = cursor.getInt(0),
                number = cursor.getInt(1),
                arabic = cursor.getString(2).orEmpty(),
                transliteration = cursor.getString(3).orEmpty(),
            )
        }

        // Translation editions are reserved and empty in this bundle; read
        // them anyway so a future cleared edition shows up without code changes.
        val translations = query(
            """
            SELECT a.ayah, t.resource_id, t.author, t.language, r.text
            FROM translation_rows AS r
            JOIN translations AS t ON t.id = r.translation_id
            JOIN ayahs AS a ON a.id = r.ayah_id
            WHERE a.surah_id = ? AND a.ayah BETWEEN ? AND ?
            ORDER BY a.ayah, t.id
            """.trimIndent(),
            arrayOf(surahId.toString(), inRange.start.toString(), inRange.end.toString()),
        ) { cursor ->
            cursor.getInt(0) to Translation(
                id = cursor.getString(1).orEmpty(),
                translator = cursor.getString(2) ?: cursor.getString(1).orEmpty(),
                languageCode = cursor.getString(3).orEmpty(),
                text = cursor.getString(4).orEmpty(),
            )
        }.groupBy({ it.first }, { it.second })

        val grouped = rows.groupBy { it.number }
        return grouped.keys.sorted().map { number ->
            val verseRows = grouped.getValue(number)
            Verse(
                surahId = surahId,
                number = number,
                arabic = verseRows.first().arabic,
                transliteration = verseRows.first().transliteration,
                translations = translations[number].orEmpty(),
                ayahId = verseRows.first().ayahId,
            )
        }
    }

    override fun allReciters(): List<Reciter> = query(
        """
        SELECT id, remote_id, name, style, qirat, attribution, license_id, has_segments, enabled,
               source, license_url, license_evidence_url
        FROM reciters
        ORDER BY enabled DESC, id
        """.trimIndent(),
    ) { cursor ->
        Reciter(
            id = cursor.getInt(0),
            remoteId = cursor.getString(1),
            name = cursor.getString(2),
            style = cursor.getString(3),
            qirat = cursor.getString(4),
            attribution = cursor.getString(5).orEmpty(),
            licenseId = cursor.getString(6).orEmpty(),
            hasSegments = cursor.getInt(7) == 1,
            enabled = cursor.getInt(8) == 1,
            source = cursor.getString(9).orEmpty(),
            licenseUrl = cursor.getString(10).orEmpty(),
            licenseEvidenceUrl = cursor.getString(11).orEmpty(),
        )
    }

    override fun reciter(id: Int?): Reciter? {
        if (id == null) return null
        return allReciters().firstOrNull { it.id == id }
    }

    override fun downloadState(reciterId: Int, surahId: Int): DownloadState {
        val downloaded = if (surahId > 0) {
            query(
                """
                SELECT COUNT(*)
                FROM audio_files
                WHERE reciter_id = ? AND surah_id = ? AND local_path IS NOT NULL
                """.trimIndent(),
                arrayOf(reciterId.toString(), surahId.toString()),
            ) { cursor -> cursor.getInt(0) }.firstOrNull() ?: 0
        } else {
            query(
                "SELECT COUNT(*) FROM audio_files WHERE reciter_id = ? AND local_path IS NOT NULL",
                arrayOf(reciterId.toString()),
            ) { cursor -> cursor.getInt(0) }.firstOrNull() ?: 0
        }
        return if (downloaded > 0) DownloadState.DOWNLOADED else DownloadState.NOT_DOWNLOADED
    }

    override fun words(ayahIds: List<Int>): Map<Int, List<VerseWord>> {
        if (ayahIds.isEmpty()) return emptyMap()
        val placeholders = ayahIds.joinToString(",") { "?" }
        val rows = query(
            """
            SELECT ayah_id, position, text_uthmani, transliteration, translation
            FROM words
            WHERE ayah_id IN ($placeholders)
            ORDER BY ayah_id, position
            """.trimIndent(),
            ayahIds.map { it.toString() }.toTypedArray(),
        ) { cursor ->
            cursor.getInt(0) to VerseWord(
                ayahId = cursor.getInt(0),
                position = cursor.getInt(1),
                transliteration = cursor.getString(3).orEmpty(),
                arabic = cursor.stringOrNull(2),
                translation = cursor.stringOrNull(4),
            )
        }
        return rows.groupBy({ it.first }, { it.second })
    }

    override fun segments(reciterId: Int, ayahIds: List<Int>): Map<Int, List<WordSegment>> {
        if (ayahIds.isEmpty()) return emptyMap()
        val placeholders = ayahIds.joinToString(",") { "?" }
        val args = listOf(reciterId.toString()) + ayahIds.map { it.toString() }
        val rows = query(
            """
            SELECT ayah_id, word_index, start_ms, end_ms
            FROM segments
            WHERE reciter_id = ? AND ayah_id IN ($placeholders)
            ORDER BY ayah_id, word_index
            """.trimIndent(),
            args.toTypedArray(),
        ) { cursor ->
            cursor.getInt(0) to WordSegment(
                ayahId = cursor.getInt(0),
                wordIndex = cursor.getInt(1),
                startMs = cursor.getLong(2),
                endMs = cursor.getLong(3),
            )
        }
        return rows.groupBy({ it.first }, { it.second })
    }

    // MARK: - Cache inspection

    override fun meta(key: String): String? = query(
        "SELECT value FROM content_meta WHERE key = ?",
        arrayOf(key),
    ) { cursor -> cursor.getString(0) }.firstOrNull()

    override fun catalogDigest(): String? = meta(KEY_BUNDLE_DIGEST)

    /** Surah ids whose ayah text has been cached, parsed from the meta markers. */
    override fun cachedSurahIds(): Set<Int> = query(
        "SELECT key FROM content_meta WHERE key LIKE 'surah.%'",
    ) { cursor -> cursor.getString(0) }
        .mapNotNull { key -> key.removePrefix("surah.").substringBefore('.').toIntOrNull() }
        .toSet()

    /** `(reciter, surah)` to "cached" | "absent" for every timing file already probed. */
    override fun segmentMarkers(): Map<Pair<Int, Int>, String> = query(
        "SELECT key, value FROM content_meta WHERE key LIKE 'segments.%'",
    ) { cursor -> cursor.getString(0) to cursor.getString(1) }
        .mapNotNull { (key, value) ->
            val parts = key.removePrefix("segments.").split('.')
            if (parts.size < 3) return@mapNotNull null
            val reciter = parts[0].toIntOrNull() ?: return@mapNotNull null
            val surah = parts[1].toIntOrNull() ?: return@mapNotNull null
            (reciter to surah) to (value.ifEmpty { "cached" })
        }
        .toMap()

    override fun cachedTransliterationEditionCount(): Int =
        query("SELECT COUNT(*) FROM transliterations") { it.getInt(0) }.firstOrNull() ?: 0

    override fun hasAudioFiles(): Boolean =
        query("SELECT COUNT(*) FROM audio_files") { it.getInt(0) }.firstOrNull()?.let { it > 0 } == true

    override fun counts(): Map<String, Int> {
        val tables = listOf(
            "surahs", "ayahs", "words", "reciters", "audio_files", "segments", "transliterations",
        )
        return tables.associateWith { table ->
            query("SELECT COUNT(*) FROM $table") { it.getInt(0) }.firstOrNull() ?: 0
        }
    }

    // MARK: - Cache writes

    /** Replaces the boot catalogue (surahs and reciters) and the meta it implies. */
    override fun replaceCatalog(index: ContentIndex) {
        transaction { db ->
            deleteAllContent(db)
            insertCatalog(db, index)
        }
    }

    /** Upserts the boot catalogue without clearing cached verse text or timings. */
    override fun insertCatalog(index: ContentIndex) {
        transaction { db -> insertCatalog(db, index) }
    }

    private fun insertCatalog(db: SQLiteDatabase, index: ContentIndex) {
        for (surah in index.surahs) {
            upsert(
                db,
                "surahs",
                surah.id.toLong(),
                ContentValues().apply {
                    put("id", surah.id)
                    put("name_arabic", surah.nameArabic)
                    put("name_latin", surah.nameLatin)
                    put("name_english", surah.nameEnglish)
                    put("verses_count", surah.verseCount)
                    put("revelation", if (surah.revelationPlace == RevelationPlace.MEDINAN) "Medinan" else "Meccan")
                    put("bismillah_pre", if (surah.bismillahPre) 1 else 0)
                },
            )
        }
        for (reciter in index.reciters) {
            upsert(
                db,
                "reciters",
                reciter.id.toLong(),
                ContentValues().apply {
                    put("id", reciter.id)
                    put("remote_id", reciter.remoteId)
                    put("name", reciter.name)
                    put("style", reciter.style)
                    put("qirat", reciter.qirat)
                    put("source", reciter.source.ifEmpty { "bundle" })
                    put("license_id", reciter.licenseId.ifEmpty { "unknown" })
                    put("license_url", reciter.licenseUrl)
                    put("license_evidence_url", reciter.licenseEvidenceUrl)
                    put("attribution", reciter.attribution)
                    put("has_segments", if (reciter.hasSegments) 1 else 0)
                    put("enabled", if (reciter.enabled) 1 else 0)
                },
            )
        }
        putMeta(db, KEY_BUNDLE_DIGEST, index.bundleDigest)
        putMeta(db, KEY_LOGICAL_DIGEST, index.logicalDigest)
        putMeta(db, KEY_SCHEMA_VERSION, index.schemaVersion?.toString())
        putMeta(db, KEY_CONTENT_MODE, index.contentMode)
        putMeta(db, KEY_WEB_BUNDLE_VERSION, index.webBundleVersion.toString())
    }

    /** Inserts one surah's ayahs, words and transliteration rows. */
    override fun putSurahContent(payload: SurahContent, sha256: String?) {
        transaction { db ->
            for (ayah in payload.ayahs) {
                upsert(db, "ayahs", ayah.id.toLong(), ayahValues(ayah))
            }
            for (row in payload.transliterationRows) {
                db.insertWithOnConflict(
                    "transliteration_rows",
                    null,
                    ContentValues().apply {
                        put("transliteration_id", row.transliterationId)
                        put("ayah_id", row.ayahId)
                        put("text", row.text)
                    },
                    SQLiteDatabase.CONFLICT_REPLACE,
                )
            }
            for (word in payload.words) {
                db.insertWithOnConflict("words", null, wordValues(word), SQLiteDatabase.CONFLICT_REPLACE)
            }
            putMeta(db, surahMarkerKey(payload.surahId), sha256 ?: "cached")
        }
    }

    /** Inserts one reciter's timings for one surah. */
    override fun putSegments(payload: SegmentContent, sha256: String?) {
        transaction { db ->
            // A fresh fetch replaces whatever was cached for this pair.
            db.delete(
                "segments",
                "reciter_id = ? AND variant = ? AND ayah_id IN (SELECT id FROM ayahs WHERE surah_id = ?)",
                arrayOf(payload.reciterId.toString(), payload.variant, payload.surahId.toString()),
            )
            for (row in payload.rows) {
                db.insertWithOnConflict(
                    "segments",
                    null,
                    ContentValues().apply {
                        put("reciter_id", payload.reciterId)
                        put("variant", payload.variant)
                        put("ayah_id", row.ayahId)
                        put("word_index", row.wordIndex)
                        put("start_ms", row.startMs)
                        put("end_ms", row.endMs)
                    },
                    SQLiteDatabase.CONFLICT_REPLACE,
                )
            }
            putMeta(db, segmentMarkerKey(payload.reciterId, payload.surahId), sha256 ?: "cached")
        }
    }

    /** Records that the bundle lists no timings file for this reciter/surah pair. */
    override fun markSegmentsAbsent(reciterId: Int, surahId: Int) {
        transaction { db ->
            putMeta(db, segmentMarkerKey(reciterId, surahId), "absent")
        }
    }

    override fun putTransliterations(editions: List<TransliterationEdition>, sha256: String?) {
        transaction { db ->
            for (edition in editions) {
                upsert(
                    db,
                    "transliterations",
                    edition.id.toLong(),
                    ContentValues().apply {
                        put("id", edition.id)
                        put("resource_id", edition.resourceId)
                        put("name", edition.name)
                        put("author", edition.author)
                        put("language", edition.language)
                        put("source", edition.source)
                        put("license_id", edition.licenseId)
                        put("license_url", edition.licenseUrl)
                        put("license_evidence_url", edition.licenseEvidenceUrl)
                        put("attribution", edition.attribution)
                    },
                )
            }
            putMeta(db, KEY_TRANSLITERATIONS_DIGEST, sha256 ?: "cached")
        }
    }

    override fun putAudioFiles(files: List<AudioFileContent>, sha256: String?) {
        transaction { db ->
            for (file in files) {
                db.insertWithOnConflict(
                    "audio_files",
                    null,
                    ContentValues().apply {
                        put("id", file.id)
                        put("reciter_id", file.reciterId)
                        put("kind", file.kind)
                        put("surah_id", file.surahId)
                        put("ayah", file.ayah)
                        put("chapter", file.chapter)
                        put("variant", file.variant)
                        put("url", file.url)
                        put("bytes", file.bytes)
                        put("bitrate", file.bitrate)
                        put("duration_ms", file.durationMs)
                        put("checksum", file.checksum)
                    },
                    SQLiteDatabase.CONFLICT_REPLACE,
                )
            }
            putMeta(db, KEY_AUDIO_FILES_DIGEST, sha256 ?: "cached")
        }
    }

    /** Used by the audio engine once a file is on disk. */
    fun markAudioDownloaded(audioFileId: Int, localPath: String, downloadedAt: String) {
        transaction { db ->
            db.update(
                "audio_files",
                ContentValues().apply {
                    put("local_path", localPath)
                    put("downloaded_at", downloadedAt)
                },
                "id = ?",
                arrayOf(audioFileId.toString()),
            )
        }
    }

    override fun setMeta(key: String, value: String?) {
        transaction { db -> putMeta(db, key, value) }
    }

    fun close() {
        helper.close()
    }

    // MARK: - Row mapping

    private fun ayahValues(ayah: CachedAyah) = ContentValues().apply {
        put("id", ayah.id)
        put("surah_id", ayah.surahId)
        put("ayah", ayah.ayah)
        put("verse_key", ayah.verseKey)
        put("text_uthmani", ayah.textUthmani)
        put("juz", ayah.juz)
        put("hizb", ayah.hizb)
        put("page", ayah.page)
        put("sajdah", if (ayah.sajdah) 1 else 0)
        put("sajdah_type", ayah.sajdahType)
    }

    private fun wordValues(word: CachedWord) = ContentValues().apply {
        put("id", word.id)
        put("ayah_id", word.ayahId)
        put("position", word.position)
        put("text_uthmani", word.textUthmani)
        put("transliteration", word.transliteration)
        put("translation", word.translation)
    }

    private data class VerseRow(
        val ayahId: Int,
        val number: Int,
        val arabic: String,
        val transliteration: String,
    )

    // MARK: - SQL plumbing

    private fun deleteAllContent(db: SQLiteDatabase) {
        val tables = listOf(
            "transliteration_rows",
            "translation_rows",
            "segments",
            "words",
            "ayahs",
            "audio_files",
            "reciters",
            "surahs",
            "translations",
            "transliterations",
            "content_meta",
        )
        for (table in tables) {
            db.delete(table, null, null)
        }
    }

    private fun putMeta(db: SQLiteDatabase, key: String, value: String?) {
        if (value == null) {
            db.delete("content_meta", "key = ?", arrayOf(key))
        } else {
            db.insertWithOnConflict(
                "content_meta",
                null,
                ContentValues().apply {
                    put("key", key)
                    put("value", value)
                },
                SQLiteDatabase.CONFLICT_REPLACE,
            )
        }
    }

    /** Update-then-insert: never `INSERT OR REPLACE` a parent row with children. */
    private fun upsert(db: SQLiteDatabase, table: String, id: Long, values: ContentValues) {
        val updated = db.update(table, values, "id = ?", arrayOf(id.toString()))
        if (updated == 0) db.insertOrThrow(table, null, values)
    }

    private fun <T> transaction(block: (SQLiteDatabase) -> T): T {
        val db = helper.writableDatabase
        db.beginTransaction()
        try {
            val result = block(db)
            db.setTransactionSuccessful()
            return result
        } finally {
            db.endTransaction()
        }
    }

    private fun <T> query(
        sql: String,
        selectionArgs: Array<String>? = null,
        map: (Cursor) -> T,
    ): List<T> = helper.readableDatabase.rawQuery(sql, selectionArgs).use { cursor ->
        buildList {
            while (cursor.moveToNext()) {
                add(map(cursor))
            }
        }
    }

    private fun Cursor.stringOrNull(index: Int): String? = if (isNull(index)) null else getString(index)

    companion object {
        const val KEY_BUNDLE_DIGEST = "index.bundle_digest"
        const val KEY_LOGICAL_DIGEST = "index.logical_digest"
        const val KEY_SCHEMA_VERSION = "index.schema_version"
        const val KEY_CONTENT_MODE = "index.content_mode"
        const val KEY_WEB_BUNDLE_VERSION = "index.web_bundle_version"
        const val KEY_FETCHED_AT = "index.fetched_at"
        const val KEY_TRANSLITERATIONS_DIGEST = "transliterations.sha256"
        const val KEY_AUDIO_FILES_DIGEST = "audio_files.sha256"
        const val KEY_LICENSES_BODY = "licenses.body"
        const val KEY_NOTICE_TEXT = "notice.text"
        const val KEY_NOTICE_PATH = "notice.path"

        fun surahMarkerKey(surahId: Int): String = "surah.$surahId.sha256"

        fun segmentMarkerKey(reciterId: Int, surahId: Int): String =
            "segments.$reciterId.$surahId"
    }
}
