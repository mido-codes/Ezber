-- Ezber user database schema
--
-- DB file:  ezber-user.sqlite (created by the app on first launch; never rebuilt
--           by the content pipeline, so content updates cannot touch user data)
-- Version:  1 (see schema_version)
--
-- Separation model (report 4.1): the content DB is read-mostly and versioned;
-- the user DB stays small, back-up friendly and syncable. The two files are
-- separate SQLite databases; the app may ATTACH the content DB for joins.
-- Cross-database FOREIGN KEYs are not possible in SQLite, so foreign keys to
-- content tables (surah_id, reciter_id, ...) are intentionally absent here;
-- provide them at query time by ATTACHing.
--
-- Time format: ISO-8601 UTC strings ("2026-09-25T12:00:00.000Z") so exports
-- round-trip between iOS (GRDB) and Android (Room) without timezone drift.

PRAGMA foreign_keys = ON;

CREATE TABLE schema_version (
  version INTEGER NOT NULL
);

-- ---------------------------------------------------------------------------
-- Presets: a saved listening plan (surah + verse range + repeats + reciter)
-- ---------------------------------------------------------------------------

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
  -- Offline downloads default to whole surahs; 'preset' downloads only the
  -- preset's verse range; 'inherit' uses settings['downloads.scope'].
  download_scope        TEXT NOT NULL DEFAULT 'inherit'
                          CHECK (download_scope IN ('inherit', 'surah', 'preset')),
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at            TEXT,
  last_used_at          TEXT
);

CREATE INDEX idx_presets_last_used ON presets (last_used_at DESC);

-- Per-verse repetition override (optional; falls back to presets.repeat_count).
CREATE TABLE preset_verses (
  preset_id     INTEGER NOT NULL REFERENCES presets(id) ON DELETE CASCADE,
  ayah          INTEGER NOT NULL CHECK (ayah > 0),
  repeat_count  INTEGER NOT NULL CHECK (repeat_count > 0),
  PRIMARY KEY (preset_id, ayah)
);

-- ---------------------------------------------------------------------------
-- Progress and practice history
-- ---------------------------------------------------------------------------

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

CREATE INDEX idx_progress_verse ON progress (verse_key);

CREATE TABLE sessions (
  id              INTEGER PRIMARY KEY,
  preset_id       INTEGER REFERENCES presets(id) ON DELETE SET NULL,
  started_at      TEXT NOT NULL,
  ended_at        TEXT,
  verses_covered  INTEGER NOT NULL DEFAULT 0 CHECK (verses_covered >= 0),
  repetitions     INTEGER NOT NULL DEFAULT 0 CHECK (repetitions >= 0),
  interrupted     INTEGER NOT NULL DEFAULT 0 CHECK (interrupted IN (0, 1))
);

CREATE INDEX idx_sessions_preset ON sessions (preset_id, started_at DESC);

-- Exact playback position, written at item boundaries so a killed process can
-- resume on the same repetition.
CREATE TABLE plan_state (
  preset_id               INTEGER PRIMARY KEY REFERENCES presets(id) ON DELETE CASCADE,
  plan_index              INTEGER NOT NULL DEFAULT 0 CHECK (plan_index >= 0),
  position_ms             INTEGER NOT NULL DEFAULT 0 CHECK (position_ms >= 0),
  repetition_counters_json TEXT,
  updated_at              TEXT
);

-- ---------------------------------------------------------------------------
-- Notes with full-text search
-- ---------------------------------------------------------------------------

CREATE TABLE notes (
  id          INTEGER PRIMARY KEY,
  verse_key   TEXT NOT NULL,
  body_md     TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT
);

CREATE INDEX idx_notes_verse ON notes (verse_key);

-- External-content FTS5 index kept in sync by triggers. Search with:
--   SELECT n.* FROM notes n JOIN note_fts f ON f.rowid = n.id
--   WHERE note_fts MATCH ? ORDER BY rank;
-- remove_diacritics 2 keeps Arabic search useful without harakat.
CREATE VIRTUAL TABLE note_fts USING fts5(
  body_md,
  content = 'notes',
  content_rowid = 'id',
  tokenize = "unicode61 remove_diacritics 2"
);

CREATE TRIGGER notes_ai AFTER INSERT ON notes BEGIN
  INSERT INTO note_fts (rowid, body_md) VALUES (new.id, new.body_md);
END;

CREATE TRIGGER notes_ad AFTER DELETE ON notes BEGIN
  INSERT INTO note_fts (note_fts, rowid, body_md) VALUES ('delete', old.id, old.body_md);
END;

CREATE TRIGGER notes_au AFTER UPDATE OF body_md ON notes BEGIN
  INSERT INTO note_fts (note_fts, rowid, body_md) VALUES ('delete', old.id, old.body_md);
  INSERT INTO note_fts (rowid, body_md) VALUES (new.id, new.body_md);
END;

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------

CREATE TABLE settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

-- Defaults the app reads at first launch.
INSERT INTO settings (key, value) VALUES ('downloads.scope', 'surah');

INSERT INTO schema_version (version) VALUES (1);
