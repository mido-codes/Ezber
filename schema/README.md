# Ezber shared schema

Two SQLite databases, two files, by design (report §4.1):

| File | Schema | Written by |
|---|---|---|
| `ezber-content.sqlite` | `content_schema.sql` | content pipeline only; read-only in the app |
| `ezber-user.sqlite` | `user_schema.sql` | the app only; never touched by content updates |

Keeping them separate means a content refresh can never risk presets, progress
or notes, and the user DB stays small enough to back up or sync.

## Content database

- `surahs` (114) and `ayahs` (6236): Tanzil text verbatim, plus `verse_key`
  (`"55:3"`) as the stable cross-dataset identity, and juz/hizb/page/sajdah
  metadata derived from Tanzil's `quran-data.xml`.
- `words`: word-level transliteration tokens, produced by splitting each
  Tanzil transliteration ayah line on whitespace (captain decision).
  `text_uthmani` is set only when the token count equals the Uthmani
  space-split word count, otherwise NULL (369 ayahs); `transliteration` is
  always present because it is the primary reading surface.
- `reciters`, `audio_files`, `segments`: recitation catalog and playback data.
  Audio entries stay disabled until Quran Foundation confirms them in writing
  (CD-2), so `audio_files` is currently empty; `reciters` currently carries the
  11 timing-only cpfair/quran-align recitations (`source = "quran_align"`,
  `status = "timing_only"`). `segments` is keyed by
  `(reciter_id, variant, ayah_id, word_index)` and **`word_index = 0` is the
  whole-ayah range while `word_index >= 1` is a word range** matching `words`
  positions. quran-align times are offsets within each ayah's own audio file,
  not within a chapter file.
- `translations` / `translation_rows`: reserved and empty — the English
  translation was dropped by captain decision 2026-09-25.
- `transliterations` / `transliteration_rows`: the Tanzil English
  transliteration edition (`tanzil.en.transliteration`), one row per ayah.
- `content_meta`: schema version, pipeline version, `content_mode`
  (`offline-redistributable`), the logical digest and other build facts. No
  timestamps.

Deviation from the report §4.2 sketch, intentional: `segments` and
`audio_files` carry `variant`/`bitrate` so a reciter can ship multiple styles
and encodings, and `translations`/`transliterations` carry `resource_id` plus
license evidence URLs so the manifest and credits screen can be generated
without a second registry.

## User database

- `presets` + `preset_verses`: a named surah/verse-range/repeat/reciter plan
  with display options, optional per-verse repeat overrides and
  `download_scope` (`inherit` uses `settings['downloads.scope']`, which starts
  as `surah`; `preset` downloads only the preset's verse range).
- `progress`: per `(preset, ayah)` repetition count, memorization state and
  spaced-review date.
- `notes` + `note_fts`: verse-scoped markdown with an FTS5 external-content
  index maintained by triggers (`unicode61 remove_diacritics 2`).
  Search with `JOIN note_fts ON note_fts.rowid = notes.id WHERE note_fts MATCH ?`.
- `sessions`: practice history; `plan_state`: exact resume position written at
  item boundaries; `settings`; `schema_version`.

Foreign keys to content tables are intentionally absent because the databases
are separate files; `ATTACH` the content DB and join on `surah_id`, `ayah_id`,
`reciter_id`, `translation_id` or `verse_key` when needed.

## Versioning

Both schemas carry `schema_version` (currently 1). Because content is rebuilt
from scratch by the pipeline, content-schema changes ship as a pipeline version
bump and a rebuilt bundle; user-DB changes require a real migration and must
never drop user rows. Format dates as ISO-8601 UTC strings so exports round-trip
between GRDB (iOS) and Room (Android).
