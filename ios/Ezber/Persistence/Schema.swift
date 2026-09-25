import Foundation

// The iOS SQLite layer, in one place.
//
// `ContentSchema` describes the read-mostly content database (`content.sqlite`)
// that the content pipeline will produce: surahs, verses, transliterations,
// translations, reciter metadata and per-surah availability.
//
// `UserSchema` describes the device-local database (`user.sqlite`): presets,
// verse progress, study sessions, notes, download state and small app state.
// Content and user data stay in separate stores, as the plan describes.
//
// PROVISIONAL: the canonical shared schema is owned by the foundation work
// (planned under `schema/`). Until it lands in `main`, this file is the single
// source of truth for the iOS SQLite layer. When `schema/` lands, replace the
// DDL here and the row mapping in `ContentStore` / `UserDataStore`; do not fork
// a second schema elsewhere.

enum ContentSchema {
    static let version = 1

    static let statements: [String] = [
        """
        CREATE TABLE IF NOT EXISTS content_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS surahs (
            id INTEGER PRIMARY KEY,
            name_arabic TEXT NOT NULL,
            name_latin TEXT NOT NULL,
            name_english TEXT NOT NULL,
            verse_count INTEGER NOT NULL,
            revelation_place TEXT NOT NULL
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS verses (
            surah_id INTEGER NOT NULL REFERENCES surahs(id),
            number INTEGER NOT NULL,
            arabic TEXT NOT NULL,
            transliteration TEXT NOT NULL,
            PRIMARY KEY (surah_id, number)
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS translations (
            id TEXT PRIMARY KEY,
            translator TEXT NOT NULL,
            language_code TEXT NOT NULL,
            license TEXT
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS verse_translations (
            surah_id INTEGER NOT NULL,
            verse_number INTEGER NOT NULL,
            translation_id TEXT NOT NULL REFERENCES translations(id),
            text TEXT NOT NULL,
            PRIMARY KEY (surah_id, verse_number, translation_id)
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS reciters (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            style TEXT NOT NULL,
            language_name TEXT NOT NULL,
            sample_url TEXT,
            audio_base_url TEXT,
            license TEXT
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS reciter_surahs (
            reciter_id TEXT NOT NULL REFERENCES reciters(id),
            surah_id INTEGER NOT NULL,
            PRIMARY KEY (reciter_id, surah_id)
        );
        """
    ]

    static func migrate(_ database: Database) throws {
        for statement in statements {
            try database.execute(statement)
        }
        try database.execute(
            "INSERT OR REPLACE INTO content_meta (key, value) VALUES ('schema_version', ?);",
            [.text(String(version))]
        )
    }
}

enum UserSchema {
    static let version = 1

    static let statements: [String] = [
        """
        CREATE TABLE IF NOT EXISTS user_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS presets (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            surah_id INTEGER NOT NULL,
            range_start INTEGER NOT NULL,
            range_end INTEGER NOT NULL,
            repeats_json TEXT NOT NULL,
            reciter_id TEXT NOT NULL,
            display_json TEXT NOT NULL,
            created_at REAL NOT NULL,
            updated_at REAL NOT NULL,
            last_studied_at REAL
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS verse_progress (
            surah_id INTEGER NOT NULL,
            verse_number INTEGER NOT NULL,
            repetitions_completed INTEGER NOT NULL DEFAULT 0,
            exposure_count INTEGER NOT NULL DEFAULT 0,
            last_played_at REAL,
            state TEXT NOT NULL,
            last_preset_id TEXT,
            PRIMARY KEY (surah_id, verse_number)
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS study_sessions (
            id TEXT PRIMARY KEY,
            preset_id TEXT NOT NULL,
            started_at REAL NOT NULL,
            last_active_at REAL NOT NULL,
            verse_number INTEGER NOT NULL,
            repeat_index INTEGER NOT NULL,
            completed_items INTEGER NOT NULL,
            total_items INTEGER NOT NULL,
            is_completed INTEGER NOT NULL
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS notes (
            id TEXT PRIMARY KEY,
            surah_id INTEGER NOT NULL,
            verse_number INTEGER NOT NULL,
            preset_id TEXT,
            body TEXT NOT NULL,
            kind TEXT NOT NULL,
            transcript TEXT,
            is_transcribed INTEGER NOT NULL DEFAULT 0,
            audio_file_name TEXT,
            created_at REAL NOT NULL,
            updated_at REAL NOT NULL
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS downloads (
            reciter_id TEXT NOT NULL,
            surah_id INTEGER NOT NULL,
            state TEXT NOT NULL,
            byte_count INTEGER,
            updated_at REAL,
            PRIMARY KEY (reciter_id, surah_id)
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS app_state (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        """
    ]

    static func migrate(_ database: Database) throws {
        for statement in statements {
            try database.execute(statement)
        }
        try database.execute(
            "INSERT OR REPLACE INTO user_meta (key, value) VALUES ('schema_version', ?);",
            [.text(String(version))]
        )
    }
}
