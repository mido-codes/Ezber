package app.ezber.android.persistence

import android.database.sqlite.SQLiteDatabase

/**
 * The Android content database schema.
 *
 * This is a copy of the canonical DDL in `schema/content_schema.sql` (owned by
 * the foundation work) with the table order kept identical. Unlike the earlier
 * scaffold, the app now owns this database: it starts empty and is filled
 * lazily from the web content bundle (see `content/ContentRepository`), one
 * surah file and one segment file at a time. The rows still use exactly the
 * shared schema's columns, so exports and cross-platform queries keep working.
 *
 * If the canonical schema changes, change `schema/` first, bump [VERSION] here
 * and add a migration in [migrate]. Content is a cache, so a migration may
 * discard cached rows and refetch them; user data lives in a separate database
 * and is never touched by this schema.
 */
object ContentSchema {

    const val VERSION = 1

    /** Mirrors `CREATE TABLE` from schema/content_schema.sql. */
    val statements: List<String> = listOf(
        """
        CREATE TABLE content_meta (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        """.trimIndent(),
        """
        CREATE TABLE surahs (
          id                INTEGER PRIMARY KEY CHECK (id BETWEEN 1 AND 114),
          name_arabic       TEXT NOT NULL,
          name_latin        TEXT NOT NULL,
          name_english      TEXT NOT NULL,
          verses_count      INTEGER NOT NULL CHECK (verses_count > 0),
          revelation        TEXT NOT NULL CHECK (revelation IN ('Meccan', 'Medinan')),
          bismillah_pre     INTEGER NOT NULL CHECK (bismillah_pre IN (0, 1)),
          revelation_order  INTEGER,
          rukus             INTEGER
        );
        """.trimIndent(),
        """
        CREATE TABLE ayahs (
          id            INTEGER PRIMARY KEY CHECK (id BETWEEN 1 AND 6236),
          surah_id      INTEGER NOT NULL REFERENCES surahs(id),
          ayah          INTEGER NOT NULL CHECK (ayah > 0),
          verse_key     TEXT NOT NULL UNIQUE,
          text_uthmani  TEXT NOT NULL CHECK (length(text_uthmani) > 0),
          juz           INTEGER CHECK (juz BETWEEN 1 AND 30),
          hizb          INTEGER CHECK (hizb BETWEEN 1 AND 60),
          page          INTEGER CHECK (page BETWEEN 1 AND 604),
          sajdah        INTEGER NOT NULL DEFAULT 0 CHECK (sajdah IN (0, 1)),
          sajdah_type   TEXT CHECK (sajdah_type IN ('recommended', 'obligatory')),
          UNIQUE (surah_id, ayah)
        );
        """.trimIndent(),
        "CREATE INDEX idx_ayahs_surah ON ayahs (surah_id, ayah);",
        "CREATE INDEX idx_ayahs_juz ON ayahs (juz);",
        "CREATE INDEX idx_ayahs_page ON ayahs (page);",
        """
        CREATE TABLE words (
          id              INTEGER PRIMARY KEY,
          ayah_id         INTEGER NOT NULL REFERENCES ayahs(id),
          position        INTEGER NOT NULL CHECK (position > 0),
          text_uthmani    TEXT,
          transliteration TEXT NOT NULL CHECK (length(transliteration) > 0),
          translation     TEXT,
          UNIQUE (ayah_id, position)
        );
        """.trimIndent(),
        "CREATE INDEX idx_words_ayah ON words (ayah_id, position);",
        """
        CREATE TABLE reciters (
          id                    INTEGER PRIMARY KEY,
          remote_id             TEXT NOT NULL UNIQUE,
          name                  TEXT NOT NULL,
          style                 TEXT,
          qirat                 TEXT,
          source                TEXT NOT NULL,
          license_id            TEXT NOT NULL,
          license_url           TEXT NOT NULL,
          license_evidence_url  TEXT NOT NULL,
          attribution           TEXT NOT NULL,
          has_segments          INTEGER NOT NULL DEFAULT 0 CHECK (has_segments IN (0, 1)),
          enabled               INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1))
        );
        """.trimIndent(),
        """
        CREATE TABLE audio_files (
          id             INTEGER PRIMARY KEY,
          reciter_id     INTEGER NOT NULL REFERENCES reciters(id),
          kind           TEXT NOT NULL CHECK (kind IN ('ayah', 'chapter')),
          surah_id       INTEGER REFERENCES surahs(id),
          ayah           INTEGER,
          chapter        INTEGER,
          variant        TEXT NOT NULL,
          url            TEXT NOT NULL,
          local_path     TEXT,
          bytes          INTEGER CHECK (bytes IS NULL OR bytes > 0),
          bitrate        INTEGER,
          duration_ms    INTEGER CHECK (duration_ms IS NULL OR duration_ms > 0),
          checksum       TEXT,
          downloaded_at  TEXT
        );
        """.trimIndent(),
        """
        CREATE UNIQUE INDEX idx_audio_files_identity
          ON audio_files (reciter_id, variant, bitrate, kind, COALESCE(chapter, 0), COALESCE(ayah, 0));
        """.trimIndent(),
        "CREATE INDEX idx_audio_files_reciter ON audio_files (reciter_id, variant, chapter);",
        """
        CREATE TABLE segments (
          reciter_id  INTEGER NOT NULL REFERENCES reciters(id),
          variant     TEXT NOT NULL,
          ayah_id     INTEGER NOT NULL REFERENCES ayahs(id),
          word_index  INTEGER NOT NULL CHECK (word_index >= 0),
          start_ms    INTEGER NOT NULL CHECK (start_ms >= 0),
          end_ms      INTEGER NOT NULL CHECK (end_ms > start_ms),
          PRIMARY KEY (reciter_id, variant, ayah_id, word_index)
        ) WITHOUT ROWID;
        """.trimIndent(),
        "CREATE INDEX idx_segments_ayah ON segments (ayah_id);",
        """
        CREATE TABLE translations (
          id                   INTEGER PRIMARY KEY,
          resource_id          TEXT NOT NULL UNIQUE,
          name                 TEXT NOT NULL,
          author               TEXT,
          language             TEXT NOT NULL,
          source               TEXT NOT NULL,
          license_id           TEXT NOT NULL,
          license_url          TEXT NOT NULL,
          license_evidence_url TEXT NOT NULL,
          attribution          TEXT NOT NULL
        );
        """.trimIndent(),
        """
        CREATE TABLE translation_rows (
          translation_id  INTEGER NOT NULL REFERENCES translations(id),
          ayah_id         INTEGER NOT NULL REFERENCES ayahs(id),
          text            TEXT NOT NULL CHECK (length(text) > 0),
          PRIMARY KEY (translation_id, ayah_id)
        );
        """.trimIndent(),
        """
        CREATE TABLE transliterations (
          id                   INTEGER PRIMARY KEY,
          resource_id          TEXT NOT NULL UNIQUE,
          name                 TEXT NOT NULL,
          author               TEXT,
          language             TEXT NOT NULL,
          source               TEXT NOT NULL,
          license_id           TEXT NOT NULL,
          license_url          TEXT NOT NULL,
          license_evidence_url TEXT NOT NULL,
          attribution          TEXT NOT NULL
        );
        """.trimIndent(),
        """
        CREATE TABLE transliteration_rows (
          transliteration_id  INTEGER NOT NULL REFERENCES transliterations(id),
          ayah_id             INTEGER NOT NULL REFERENCES ayahs(id),
          text                TEXT NOT NULL CHECK (length(text) > 0),
          PRIMARY KEY (transliteration_id, ayah_id)
        );
        """.trimIndent(),
    )

    fun create(db: SQLiteDatabase) {
        for (statement in statements) {
            db.execSQL(statement)
        }
    }

    /**
     * Content is a cache, so the simplest correct migration is to rebuild the
     * cache tables; rows are refetched lazily from the content source.
     */
    fun migrate(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        drop(db)
        create(db)
    }

    /** Drops every cache table; used by migrations and full refreshes. */
    fun drop(db: SQLiteDatabase) {
        val tables = listOf(
            "transliteration_rows",
            "translation_rows",
            "translations",
            "transliterations",
            "segments",
            "audio_files",
            "words",
            "ayahs",
            "reciters",
            "surahs",
            "content_meta",
        )
        for (table in tables) {
            db.execSQL("DROP TABLE IF EXISTS $table")
        }
    }
}
