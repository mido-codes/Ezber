# Shared data model in practice

The table-by-table reference is `schema/README.md`; this note covers how the two
databases are meant to be used together.

## Content vs user data

```
ezber-content.sqlite  (pipeline output, read-only, ~50 MB)
  surahs ─ ayahs ─ words
     │        │
     │        ├── translation_rows ── translations          (reserved, empty)
     │        ├── transliteration_rows ── transliterations  (Tanzil en.transliteration)
     │        └── segments ── reciters ── audio_files       (quran-align timing-only; audio pending rights)
ezber-user.sqlite  (app-owned, small, back-up friendly)
  presets ─ preset_verses, progress, plan_state, sessions
  notes (FTS5: note_fts), settings, schema_version
```

The app opens the user DB read/write and the content DB read-only (or
`ATTACH`es it) and joins on ids or `verse_key`. Example: expand a preset into
the captain's Ar-Rahman drill (`presets` row with `surah_id=55, from_ayah=1,
to_ayah=5, repeat_count=5`):

```sql
-- app-side: repetend list (ayah × repetition) for the preset, joined to the
-- Tanzil transliteration line
SELECT a.verse_key, a.text_uthmani, t.text AS transliteration, rep.n
FROM   ayahs a
JOIN   transliteration_rows t ON t.ayah_id = a.id AND t.transliteration_id = :transliteration_id
JOIN   (WITH RECURSIVE numbers(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM numbers WHERE n < :repeat_count)
        SELECT n FROM numbers) rep
WHERE  a.surah_id = :surah_id AND a.ayah BETWEEN :from_ayah AND :to_ayah
ORDER  BY a.ayah, rep.n;

-- word/verse highlight while a chapter file plays
SELECT word_index, start_ms, end_ms
FROM   segments
WHERE  reciter_id = :reciter_id AND variant = :style AND ayah_id = :ayah_id
ORDER  BY start_ms;

-- note search
SELECT n.* FROM notes n JOIN note_fts f ON f.rowid = n.id
WHERE  note_fts MATCH :query ORDER BY rank;
```

## Conventions that matter across platforms

- `verse_key` is the portable identity; always store it next to numeric ids in
  exports.
- `segments.word_index = 0` is the whole-ayah range; `>= 1` is a word range
  matching `words` positions. quran-align times are offsets within each ayah's
  own audio file (the app pairs them with per-ayah audio); do not treat them
  as chapter-file offsets.
- `audio_files.variant` is the style, `bitrate` the encoding; the app downloads
  one `(variant, bitrate)` per reciter and fills `local_path`/`downloaded_at`.
  Offline downloads default to per surah; `presets.download_scope` can narrow a
  preset to its verse range.
- All dates are ISO-8601 UTC strings, so GRDB (iOS) and Room (Android) can map
  the same file format.
- `content_meta.content_mode` is `offline-redistributable` and
  `content_meta.logical_digest` is the reproducibility check; `verify` also
  checks the file `sha256` recorded in `content-manifest.json`.

## Schema changes

Content schema changes accompany a pipeline version bump and a rebuilt bundle
(no in-place migration needed). User schema changes require a migration and
must preserve existing rows; bump `schema_version` in the same commit.
