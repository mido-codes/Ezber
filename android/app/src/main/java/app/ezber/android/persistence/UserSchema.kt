package app.ezber.android.persistence

import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteException

/**
 * The Android user database schema.
 *
 * This is a copy of the canonical DDL in `schema/user_schema.sql` (owned by the
 * foundation work) with the table order kept identical. The Android app creates
 * this database; the content database is created by the content pipeline and is
 * never written here.
 *
 * The FTS5 objects are created on a best-effort basis: the platform SQLite on
 * API 26–29 has FTS4 but not FTS5, so notes search falls back to `LIKE` there
 * (see SqliteUserDataStore.searchNotes). Everything else is required.
 *
 * If the canonical schema changes, change `schema/` first, bump [VERSION] here,
 * and add a migration in [migrate]; never drop user rows.
 */
object UserSchema {

    const val VERSION = 1

    /** Mirrors `CREATE TABLE`/`CREATE INDEX` from schema/user_schema.sql. */
    val statements: List<String> = listOf(
        """
        CREATE TABLE schema_version (
          version INTEGER NOT NULL
        );
        """.trimIndent(),
        """
        CREATE TABLE presets (
          id                    INTEGER PRIMARY KEY,
          name                  TEXT NOT NULL,
          surah_id              INTEGER,
          from_ayah             INTEGER,
          to_ayah               INTEGER,
          repeat_count          INTEGER NOT NULL DEFAULT 5 CHECK (repeat_count > 0),
          reciter_id            INTEGER,
          transliteration_id    INTEGER,
          translation_id        INTEGER,
          show_arabic           INTEGER NOT NULL DEFAULT 0 CHECK (show_arabic IN (0, 1)),
          show_transliteration  INTEGER NOT NULL DEFAULT 1 CHECK (show_transliteration IN (0, 1)),
          show_translation      INTEGER NOT NULL DEFAULT 1 CHECK (show_translation IN (0, 1)),
          pause_between_repeat_ms INTEGER NOT NULL DEFAULT 0 CHECK (pause_between_repeat_ms >= 0),
          playback_mode         TEXT NOT NULL DEFAULT 'ayah' CHECK (playback_mode IN ('ayah', 'chapter')),
          download_scope        TEXT NOT NULL DEFAULT 'inherit'
                                  CHECK (download_scope IN ('inherit', 'surah', 'preset')),
          created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          updated_at            TEXT,
          last_used_at          TEXT
        );
        """.trimIndent(),
        "CREATE INDEX idx_presets_last_used ON presets (last_used_at DESC);",
        """
        CREATE TABLE preset_verses (
          preset_id     INTEGER NOT NULL REFERENCES presets(id) ON DELETE CASCADE,
          ayah          INTEGER NOT NULL CHECK (ayah > 0),
          repeat_count  INTEGER NOT NULL CHECK (repeat_count > 0),
          PRIMARY KEY (preset_id, ayah)
        );
        """.trimIndent(),
        """
        CREATE TABLE progress (
          preset_id          INTEGER NOT NULL REFERENCES presets(id) ON DELETE CASCADE,
          ayah               INTEGER NOT NULL CHECK (ayah > 0),
          verse_key          TEXT,
          repetitions_done   INTEGER NOT NULL DEFAULT 0 CHECK (repetitions_done >= 0),
          memorization_state TEXT NOT NULL DEFAULT 'learning'
                               CHECK (memorization_state IN ('learning', 'review', 'memorized')),
          last_played_at     TEXT,
          next_review_at     TEXT,
          PRIMARY KEY (preset_id, ayah)
        );
        """.trimIndent(),
        "CREATE INDEX idx_progress_verse ON progress (verse_key);",
        """
        CREATE TABLE sessions (
          id              INTEGER PRIMARY KEY,
          preset_id       INTEGER REFERENCES presets(id) ON DELETE SET NULL,
          started_at      TEXT NOT NULL,
          ended_at        TEXT,
          verses_covered  INTEGER NOT NULL DEFAULT 0 CHECK (verses_covered >= 0),
          repetitions     INTEGER NOT NULL DEFAULT 0 CHECK (repetitions >= 0),
          interrupted     INTEGER NOT NULL DEFAULT 0 CHECK (interrupted IN (0, 1))
        );
        """.trimIndent(),
        "CREATE INDEX idx_sessions_preset ON sessions (preset_id, started_at DESC);",
        """
        CREATE TABLE plan_state (
          preset_id               INTEGER PRIMARY KEY REFERENCES presets(id) ON DELETE CASCADE,
          plan_index              INTEGER NOT NULL DEFAULT 0 CHECK (plan_index >= 0),
          position_ms             INTEGER NOT NULL DEFAULT 0 CHECK (position_ms >= 0),
          repetition_counters_json TEXT,
          updated_at              TEXT
        );
        """.trimIndent(),
        """
        CREATE TABLE notes (
          id          INTEGER PRIMARY KEY,
          verse_key   TEXT NOT NULL,
          body_md     TEXT NOT NULL DEFAULT '',
          created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          updated_at  TEXT
        );
        """.trimIndent(),
        "CREATE INDEX idx_notes_verse ON notes (verse_key);",
        """
        CREATE TABLE settings (
          key    TEXT PRIMARY KEY,
          value  TEXT NOT NULL
        );
        """.trimIndent(),
    )

    /** FTS5 is not available on every supported platform SQLite; see class docs. */
    val ftsStatements: List<String> = listOf(
        """
        CREATE VIRTUAL TABLE note_fts USING fts5(
          body_md,
          content = 'notes',
          content_rowid = 'id',
          tokenize = "unicode61 remove_diacritics 2"
        );
        """.trimIndent(),
        """
        CREATE TRIGGER notes_ai AFTER INSERT ON notes BEGIN
          INSERT INTO note_fts (rowid, body_md) VALUES (new.id, new.body_md);
        END;
        """.trimIndent(),
        """
        CREATE TRIGGER notes_ad AFTER DELETE ON notes BEGIN
          INSERT INTO note_fts (note_fts, rowid, body_md) VALUES ('delete', old.id, old.body_md);
        END;
        """.trimIndent(),
        """
        CREATE TRIGGER notes_au AFTER UPDATE OF body_md ON notes BEGIN
          INSERT INTO note_fts (note_fts, rowid, body_md) VALUES ('delete', old.id, old.body_md);
          INSERT INTO note_fts (rowid, body_md) VALUES (new.id, new.body_md);
        END;
        """.trimIndent(),
    )

    /** Seed rows that ship with the schema (schema/user_schema.sql). */
    val seedStatements: List<String> = listOf(
        "INSERT INTO settings (key, value) VALUES ('downloads.scope', 'surah');",
        "INSERT INTO schema_version (version) VALUES ($VERSION);",
    )

    fun create(db: SQLiteDatabase) {
        for (statement in statements) {
            db.execSQL(statement)
        }
        for (statement in ftsStatements) {
            try {
                db.execSQL(statement)
            } catch (_: SQLiteException) {
                // FTS5 unavailable (pre-API 30 platform SQLite): search degrades
                // to LIKE while the notes table itself stays intact.
            }
        }
        for (statement in seedStatements) {
            db.execSQL(statement)
        }
    }

    /**
     * User-schema changes must preserve rows. There are no migrations yet:
     * version 1 is the initial shared schema.
     */
    fun migrate(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        if (oldVersion == newVersion) return
        if (oldVersion < 1) {
            create(db)
        }
        // Future versions: ALTER TABLE / backfill here; never drop user rows.
        db.execSQL("INSERT INTO schema_version (version) VALUES ($newVersion);")
    }
}
