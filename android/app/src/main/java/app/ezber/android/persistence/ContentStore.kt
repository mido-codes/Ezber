package app.ezber.android.persistence

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import app.ezber.android.models.AudioFileEntry
import app.ezber.android.models.DownloadState
import app.ezber.android.models.Reciter
import app.ezber.android.models.RevelationPlace
import app.ezber.android.models.Surah
import app.ezber.android.models.Translation
import app.ezber.android.models.Verse
import app.ezber.android.models.VerseRange
import java.io.File

/** Read access to the content pipeline's output: surahs, verses and reciters. */
interface ContentProviding {
    fun allSurahs(): List<Surah>
    fun surah(id: Int): Surah?
    fun verses(surahId: Int, inRange: VerseRange): List<Verse>
    fun allReciters(): List<Reciter>
    fun reciter(id: Int?): Reciter?
    fun downloadState(reciterId: Int, surahId: Int): DownloadState

    /**
     * The audio manifest rows for one reciter and surah, as shipped by the
     * content pipeline. The drill audio resolver picks an ayah file, else a
     * chapter file, and downloads/caches the result. Stores that predate audio
     * (placeholder content) simply return an empty list.
     */
    fun audioFiles(reciterId: Int, surahId: Int): List<AudioFileEntry> = emptyList()
}

/**
 * Read-only store over `ezber-content.sqlite`, the database produced by the
 * content pipeline (canonical DDL: `schema/content_schema.sql`).
 *
 * The file is looked up in the app's files directory first, then bundled as an
 * asset; when it is absent or incompatible the app falls back to
 * `InMemoryContentStore` with placeholder data. The app never writes to it.
 */
class SqliteContentStore private constructor(
    private val database: SQLiteDatabase,
) : ContentProviding {

    override fun allSurahs(): List<Surah> = database.rawQuery(
        """
        SELECT id, name_arabic, name_latin, name_english, verses_count, revelation, bismillah_pre
        FROM surahs
        ORDER BY id
        """.trimIndent(),
        null,
    ).use { cursor ->
        buildList {
            while (cursor.moveToNext()) {
                add(
                    Surah(
                        id = cursor.getInt(0),
                        nameArabic = cursor.getString(1),
                        nameLatin = cursor.getString(2),
                        nameEnglish = cursor.getString(3),
                        verseCount = cursor.getInt(4),
                        revelationPlace = RevelationPlace.fromSchema(cursor.getString(5)),
                        bismillahPre = cursor.getInt(6) == 1,
                    ),
                )
            }
        }
    }

    override fun surah(id: Int): Surah? = allSurahs().firstOrNull { it.id == id }

    override fun verses(surahId: Int, inRange: VerseRange): List<Verse> {
        if (inRange.isEmpty) return emptyList()

        val rows = database.rawQuery(
            """
            SELECT a.ayah, a.text_uthmani, t.text AS transliteration
            FROM ayahs AS a
            LEFT JOIN transliteration_rows AS tr ON tr.ayah_id = a.id
            LEFT JOIN transliterations AS t ON t.id = tr.transliteration_id
            WHERE a.surah_id = ? AND a.ayah BETWEEN ? AND ?
            ORDER BY a.ayah, t.id
            """.trimIndent(),
            arrayOf(surahId.toString(), inRange.start.toString(), inRange.end.toString()),
        ).use { cursor ->
            buildList {
                while (cursor.moveToNext()) {
                    add(
                        VerseRow(
                            number = cursor.getInt(0),
                            arabic = cursor.getString(1).orEmpty(),
                            transliteration = cursor.getString(2).orEmpty(),
                        ),
                    )
                }
            }
        }

        // Translation editions are reserved and empty in the M0 bundle; read
        // them anyway so a future cleared edition shows up without code changes.
        val translations = database.rawQuery(
            """
            SELECT a.ayah, t.resource_id, t.author, t.language, r.text
            FROM translation_rows AS r
            JOIN translations AS t ON t.id = r.translation_id
            JOIN ayahs AS a ON a.id = r.ayah_id
            WHERE a.surah_id = ? AND a.ayah BETWEEN ? AND ?
            ORDER BY a.ayah, t.id
            """.trimIndent(),
            arrayOf(surahId.toString(), inRange.start.toString(), inRange.end.toString()),
        ).use { cursor ->
            buildMap<Int, MutableList<Translation>> {
                while (cursor.moveToNext()) {
                    getOrPut(cursor.getInt(0)) { mutableListOf() }.add(
                        Translation(
                            id = cursor.getString(1).orEmpty(),
                            translator = cursor.getString(2) ?: cursor.getString(1).orEmpty(),
                            languageCode = cursor.getString(3).orEmpty(),
                            text = cursor.getString(4).orEmpty(),
                        ),
                    )
                }
            }
        }

        val grouped = rows.groupBy { it.number }
        return grouped.keys.sorted().map { number ->
            val verseRows = grouped.getValue(number)
            Verse(
                surahId = surahId,
                number = number,
                arabic = verseRows.first().arabic,
                transliteration = verseRows.first().transliteration,
                translations = translations[number].orEmpty(),
            )
        }
    }

    override fun allReciters(): List<Reciter> = database.rawQuery(
        """
        SELECT id, remote_id, name, style, qirat, attribution, license_id, has_segments, enabled
        FROM reciters
        WHERE enabled = 1
        ORDER BY id
        """.trimIndent(),
        null,
    ).use { cursor ->
        buildList {
            while (cursor.moveToNext()) {
                add(
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
                    ),
                )
            }
        }
    }

    override fun reciter(id: Int?): Reciter? {
        if (id == null) return null
        return allReciters().firstOrNull { it.id == id }
    }

    override fun downloadState(reciterId: Int, surahId: Int): DownloadState {
        val downloaded = database.rawQuery(
            """
            SELECT COUNT(*)
            FROM audio_files
            WHERE reciter_id = ? AND surah_id = ? AND local_path IS NOT NULL
            """.trimIndent(),
            arrayOf(reciterId.toString(), surahId.toString()),
        ).use { cursor -> if (cursor.moveToFirst()) cursor.getInt(0) else 0 }
        return if (downloaded > 0) DownloadState.DOWNLOADED else DownloadState.NOT_DOWNLOADED
    }

    override fun audioFiles(reciterId: Int, surahId: Int): List<AudioFileEntry> = database.rawQuery(
        """
        SELECT id, reciter_id, kind, surah_id, ayah, chapter, variant, url,
               bytes, bitrate, duration_ms, checksum
        FROM audio_files
        WHERE reciter_id = ?
          AND (surah_id = ? OR chapter = ?)
        ORDER BY kind = 'chapter', ayah, id
        """.trimIndent(),
        arrayOf(reciterId.toString(), surahId.toString(), surahId.toString()),
    ).use { cursor ->
        buildList {
            while (cursor.moveToNext()) {
                add(
                    AudioFileEntry(
                        id = cursor.getLong(0),
                        reciterId = cursor.getInt(1),
                        kind = cursor.getString(2).orEmpty(),
                        surahId = if (cursor.isNull(3)) null else cursor.getInt(3),
                        ayah = if (cursor.isNull(4)) null else cursor.getInt(4),
                        chapter = if (cursor.isNull(5)) null else cursor.getInt(5),
                        variant = cursor.getString(6).orEmpty(),
                        url = cursor.getString(7).orEmpty(),
                        bytes = if (cursor.isNull(8)) null else cursor.getLong(8),
                        bitrate = if (cursor.isNull(9)) null else cursor.getInt(9),
                        durationMs = if (cursor.isNull(10)) null else cursor.getLong(10),
                        checksum = cursor.getString(11),
                    ),
                )
            }
        }
    }

    private data class VerseRow(
        val number: Int,
        val arabic: String,
        val transliteration: String,
    )

    companion object {
        /** File name promised by schema/README.md. */
        const val DATABASE_NAME = "ezber-content.sqlite"

        /**
         * Opens the content database from the app's files directory, copying the
         * bundled asset into place on first run. Returns null when the pipeline
         * has not produced a compatible database yet.
         */
        fun openDefault(context: Context): SqliteContentStore? {
            val appContext = context.applicationContext
            val destination = File(appContext.filesDir, DATABASE_NAME)
            if (!destination.exists()) {
                try {
                    appContext.assets.open(DATABASE_NAME).use { input ->
                        destination.outputStream().use { output -> input.copyTo(output) }
                    }
                } catch (_: Exception) {
                    // No bundled content database: placeholder content is used.
                }
            }
            if (!destination.exists()) return null

            val database = try {
                SQLiteDatabase.openDatabase(
                    destination.path,
                    null,
                    SQLiteDatabase.OPEN_READONLY,
                )
            } catch (_: Exception) {
                return null
            }
            if (!ContentSchema.isCompatible(database)) {
                database.close()
                return null
            }
            return SqliteContentStore(database)
        }
    }
}
