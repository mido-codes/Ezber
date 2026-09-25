package app.ezber.android.persistence

import android.database.sqlite.SQLiteDatabase

/**
 * The content database (`ezber-content.sqlite`) is built by the content
 * pipeline and is read-only in the app; its canonical DDL lives in
 * `schema/content_schema.sql`. Android never creates or migrates it, so this
 * object only records what [SqliteContentStore] expects to find, and the
 * compatibility check that decides whether to fall back to placeholder data.
 */
object ContentSchema {

    const val VERSION = 1

    /** Tables the content store reads. */
    val tables: List<String> = listOf(
        "content_meta",
        "surahs",
        "ayahs",
        "transliterations",
        "transliteration_rows",
        "reciters",
        "audio_files",
    )

    /**
     * True when the database was produced by a compatible pipeline build.
     * `content_meta.content_mode` must be `offline-redistributable`; anything
     * else (a newer schema, a partial build) makes the app fall back to
     * placeholder content rather than showing a half-filled library.
     */
    fun isCompatible(db: SQLiteDatabase): Boolean {
        for (table in tables) {
            if (!tableExists(db, table)) return false
        }
        return readMeta(db, "schema_version")?.toIntOrNull() == VERSION &&
            readMeta(db, "content_mode") == "offline-redistributable"
    }

    private fun readMeta(db: SQLiteDatabase, key: String): String? =
        db.rawQuery("SELECT value FROM content_meta WHERE key = ? LIMIT 1", arrayOf(key)).use { cursor ->
            if (cursor.moveToFirst()) cursor.getString(0) else null
        }

    private fun tableExists(db: SQLiteDatabase, name: String): Boolean =
        db.rawQuery(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
            arrayOf(name),
        ).use { cursor -> cursor.moveToFirst() }
}
