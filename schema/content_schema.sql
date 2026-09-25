-- Ezber content database schema
--
-- DB file:   ezber-content.sqlite (built by content-pipeline; read-only in the app)
-- Version:   1 (see content_meta.schema_version)
-- License:   the schema itself is original work; the *data* it stores carries the
--            licenses recorded in licenses/registry.json and the content manifest.
--
-- Conventions:
--   * ayahs.id is the canonical Quran-wide index 1..6236 (surah-major, ayah-minor).
--   * verse_key is "surah:ayah" (e.g. "55:3") and is the stable cross-dataset identity.
--   * segments.word_index = 0 is the whole-ayah range delivered by chapter timing
--     data; word_index >= 1 is a word-level range and must have a matching words row.
--   * This database holds content only. User data lives in a separate DB built from
--     schema/user_schema.sql so content updates never touch notes/presets/progress.
--
-- The pipeline recreates this file from scratch on every build. Do not write to it
-- from the app.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Provenance
-- ---------------------------------------------------------------------------

CREATE TABLE content_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- Quran structure and text
-- ---------------------------------------------------------------------------

CREATE TABLE surahs (
  id                INTEGER PRIMARY KEY CHECK (id BETWEEN 1 AND 114),
  name_arabic       TEXT NOT NULL,
  name_latin        TEXT NOT NULL,           -- Tanzil "tname"
  name_english      TEXT NOT NULL,           -- Tanzil "ename"
  verses_count      INTEGER NOT NULL CHECK (verses_count > 0),
  revelation        TEXT NOT NULL CHECK (revelation IN ('Meccan', 'Medinan')),
  bismillah_pre     INTEGER NOT NULL CHECK (bismillah_pre IN (0, 1)),
  revelation_order  INTEGER,                 -- Tanzil "order"
  rukus             INTEGER                  -- Tanzil "rukus"
);

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

CREATE INDEX idx_ayahs_surah ON ayahs (surah_id, ayah);
CREATE INDEX idx_ayahs_juz ON ayahs (juz);
CREATE INDEX idx_ayahs_page ON ayahs (page);

-- Word-level rows for highlighting. Populated by the configured word-level
-- adapter (see content-pipeline/config/word_level.json and
-- sources/word_level.py). The adapter is disabled until a bundleable,
-- rights-cleared word transliteration + per-word timing source exists, so the
-- M0 bundle leaves this table empty. transliteration is required because it is
-- the primary reading surface for the verse line.
CREATE TABLE words (
  id              INTEGER PRIMARY KEY,
  ayah_id         INTEGER NOT NULL REFERENCES ayahs(id),
  position        INTEGER NOT NULL CHECK (position > 0),
  text_uthmani    TEXT,
  transliteration TEXT NOT NULL CHECK (length(transliteration) > 0),
  translation     TEXT,
  UNIQUE (ayah_id, position)
);

CREATE INDEX idx_words_ayah ON words (ayah_id, position);

-- ---------------------------------------------------------------------------
-- Recitations, audio files and timing segments
-- ---------------------------------------------------------------------------

CREATE TABLE reciters (
  id                    INTEGER PRIMARY KEY,
  remote_id             TEXT NOT NULL UNIQUE,  -- upstream catalog id (e.g. IA item id)
  name                  TEXT NOT NULL,
  style                 TEXT,                  -- Murattal / Mujawwad / Teacher ...
  qirat                 TEXT,                  -- e.g. "Hafs 'an Asim"
  source                TEXT NOT NULL,         -- e.g. "internet_archive"
  license_id            TEXT NOT NULL,         -- must exist in licenses/registry.json
  license_url           TEXT NOT NULL,
  license_evidence_url  TEXT NOT NULL,         -- page proving the license at build time
  attribution           TEXT NOT NULL,
  has_segments          INTEGER NOT NULL DEFAULT 0 CHECK (has_segments IN (0, 1)),
  enabled               INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1))
);

CREATE TABLE audio_files (
  id             INTEGER PRIMARY KEY,
  reciter_id     INTEGER NOT NULL REFERENCES reciters(id),
  kind           TEXT NOT NULL CHECK (kind IN ('ayah', 'chapter')),
  surah_id       INTEGER REFERENCES surahs(id),
  ayah           INTEGER,                     -- NULL for kind='chapter'
  chapter        INTEGER,                     -- surah number for chapter files
  variant        TEXT NOT NULL,               -- style id, e.g. "murattal" (joins segments.variant)
  url            TEXT NOT NULL,
  local_path     TEXT,                        -- populated after download
  bytes          INTEGER CHECK (bytes IS NULL OR bytes > 0),
  bitrate        INTEGER,                     -- kbps when known
  duration_ms    INTEGER CHECK (duration_ms IS NULL OR duration_ms > 0),
  checksum       TEXT,                        -- "sha1:<hex>" from the upstream catalog
  downloaded_at  TEXT
);

-- NULLs compare distinct in SQLite UNIQUE constraints; COALESCE keeps chapter
-- rows unique per (reciter, variant, bitrate).
CREATE UNIQUE INDEX idx_audio_files_identity
  ON audio_files (reciter_id, variant, bitrate, kind, COALESCE(chapter, 0), COALESCE(ayah, 0));
CREATE INDEX idx_audio_files_reciter ON audio_files (reciter_id, variant, chapter);

CREATE TABLE segments (
  reciter_id  INTEGER NOT NULL REFERENCES reciters(id),
  variant     TEXT NOT NULL,
  ayah_id     INTEGER NOT NULL REFERENCES ayahs(id),
  word_index  INTEGER NOT NULL CHECK (word_index >= 0), -- 0 = whole ayah
  start_ms    INTEGER NOT NULL CHECK (start_ms >= 0),
  end_ms      INTEGER NOT NULL CHECK (end_ms > start_ms),
  PRIMARY KEY (reciter_id, variant, ayah_id, word_index)
);

CREATE INDEX idx_segments_ayah ON segments (ayah_id);

-- ---------------------------------------------------------------------------
-- Translation and transliteration editions
-- ---------------------------------------------------------------------------

-- Translation editions are reserved. Captain decision 2026-09-25 dropped the
-- English translation from the product, so this bundle contains no translation
-- rows; the tables remain for a future cleared edition.
CREATE TABLE translations (
  id                   INTEGER PRIMARY KEY,
  resource_id          TEXT NOT NULL UNIQUE,  -- upstream id, e.g. QF "19"
  name                 TEXT NOT NULL,
  author               TEXT,
  language             TEXT NOT NULL,         -- BCP-47-ish, e.g. "en"
  source               TEXT NOT NULL,         -- e.g. "quran_foundation"
  license_id           TEXT NOT NULL,
  license_url          TEXT NOT NULL,
  license_evidence_url TEXT NOT NULL,
  attribution          TEXT NOT NULL
);

CREATE TABLE translation_rows (
  translation_id  INTEGER NOT NULL REFERENCES translations(id),
  ayah_id         INTEGER NOT NULL REFERENCES ayahs(id),
  text            TEXT NOT NULL CHECK (length(text) > 0),
  PRIMARY KEY (translation_id, ayah_id)
);

CREATE TABLE transliterations (
  id                   INTEGER PRIMARY KEY,
  resource_id          TEXT NOT NULL UNIQUE,  -- upstream id, e.g. QF "57"
  name                 TEXT NOT NULL,
  author               TEXT,
  language             TEXT NOT NULL,
  source               TEXT NOT NULL,
  license_id           TEXT NOT NULL,
  license_url          TEXT NOT NULL,
  license_evidence_url TEXT NOT NULL,
  attribution          TEXT NOT NULL
);

CREATE TABLE transliteration_rows (
  transliteration_id  INTEGER NOT NULL REFERENCES transliterations(id),
  ayah_id             INTEGER NOT NULL REFERENCES ayahs(id),
  text                TEXT NOT NULL CHECK (length(text) > 0),
  PRIMARY KEY (transliteration_id, ayah_id)
);
