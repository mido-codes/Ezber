# Ezber content web bundle contract

The content pipeline writes a deterministic web bundle under
`content-pipeline/build/web/`. The web app loads it from `/content/` and imports
it into IndexedDB. This file is the contract between the two lanes: the grouped
layout below is the exact shape the pipeline emits today and what the app codes
against.

## Grouped layout (current export)

`layout: "grouped"`, `web_bundle_version: 2`. The app boots from
`/content/index.json` and fetches a surah file, or one reciter's timings for a
surah, only when it is opened. The legacy single-bundle export
(`--layout single`) is documented at the end.

### `/content/index.json`

Small on purpose: no verse text and no timings, so it can be fetched eagerly.

```json
{
  "web_bundle_version": 2,
  "layout": "grouped",
  "generated_by": { "…": "…" },
  "content_mode": "offline-redistributable",
  "schema_version": 1,
  "schema_sha256": "sha256:…",
  "logical_digest": "sha256:…",
  "database": { "file": "ezber-content.sqlite", "sha256": "sha256:…", "bytes": 123, "logical_digest": "sha256:…" },
  "counts": { "surahs": 114, "ayahs": 6236, "words": 51176, "reciters": 11, "audio_files": 1254, "segments": 925000, "translations": 0, "transliterations": 1 },
  "meta": { "…": "…" },
  "distribution_policy": { "…": "…" },
  "licenses_file": "licenses.json",
  "surahs": { "columns": ["id", "name_arabic", "name_latin", "name_english", "verses_count", "revelation", "bismillah_pre", "revelation_order", "rukus"], "rows": [[1, "الفاتحة", "Al-Faatiha", "The Opening", 7, "Meccan", 1, 5, 1]] },
  "reciters": { "columns": ["id", "remote_id", "name", "style", "qirat", "source", "license_id", "license_url", "license_evidence_url", "attribution", "has_segments", "enabled"], "rows": [[1, "…", "…", "Murattal", "Hafs 'an Asim", "internet_archive", "…", "…", "…", "…", 1, 1]] },
  "files": [
    { "path": "surahs/1.json", "kind": "surah", "sha256": "sha256:…", "bytes": 12345, "surah_id": 1, "ayahs": 7, "words": 29, "transliteration_rows": 7 },
    { "path": "segments/1/1.json", "kind": "segments", "sha256": "sha256:…", "bytes": 678, "rows": 29, "reciter_id": 1, "surah_id": 1, "variant": "murattal" },
    { "path": "audio-files.json", "kind": "audio_files", "sha256": "sha256:…", "bytes": 40000, "rows": 1254 },
    { "path": "licenses.json", "kind": "licenses", "sha256": "sha256:…", "bytes": 5000, "rows": 12, "license_count": 4 },
    { "path": "TANZIL-NOTICE.txt", "kind": "notice", "sha256": "sha256:…", "bytes": 400 }
  ],
  "bundle_digest": "sha256:…"
}
```

- `bundle_digest` is the re-import identity: it digests the index payload
  (counts, inline tables and the file inventory), so it changes whenever any
  emitted data changes. `logical_digest` is the canonical content database
  digest and identifies the same corpus on every platform.
- `surahs` and `reciters` are `{"columns", "rows"}` table documents inlined so
  the boot request carries the surah list and the reciter catalogue.
- `files` is a flat, path-sorted inventory of every other file with its
  `sha256` and byte size, so a lazy fetch can be verified. `kind` is `surah`,
  `segments`, `audio_files`, `translations`, `transliterations`, `licenses` or
  `notice`; surah entries add `surah_id`, `ayahs`, `words` and
  `transliteration_rows` counts, segment entries add `reciter_id`, `surah_id`,
  `variant` and a row count.

### `/content/surahs/<surah_id>.json`

One file per surah (plain integer ids: `surahs/1.json` … `surahs/114.json`),
fetched when the surah is opened.

```json
{
  "surah_id": 55,
  "ayahs": { "columns": ["id", "surah_id", "ayah", "verse_key", "text_uthmani", "transliteration", "juz", "hizb", "page", "sajdah", "sajdah_type"], "rows": [[...]] },
  "transliteration_rows": { "columns": ["transliteration_id", "ayah_id", "text"], "rows": [[1, 4904, "…"]] },
  "words": { "columns": ["id", "ayah_id", "position", "text_uthmani", "transliteration", "translation"], "rows": [[...]] }
}
```

- `ayahs` covers only that surah. The primary transliteration edition is
  already joined as `transliteration`; `transliteration_rows` carries the same
  edition's rows for consumers that join by `ayah_id` instead.
- `words` covers only that surah's ayahs. `text_uthmani` is NULL when the token
  count did not match the Uthmani word count, mirroring the pipeline rule.

### `/content/segments/<reciter_id>/<surah_id>.json`

One file per reciter and surah, fetched when that recitation is selected.

```json
{
  "reciter_id": 1,
  "variant": "murattal",
  "surah_id": 55,
  "columns": ["ayah_id", "word_index", "start_ms", "end_ms"],
  "rows": [[4904, 0, 0, 4210], [4904, 1, 0, 900]]
}
```

`word_index = 0` is the whole-ayah range; `>= 1` maps to `words.position` and
drives the active-word highlight. Times are offsets inside that ayah's audio
file, not a chapter file. A reciter/surah pair with no timing rows has no file.

### Other files

`audio-files.json`, `translations.json`, `transliterations.json`,
`licenses.json` and `TANZIL-NOTICE.txt` are whole-bundle files, listed in
`index.json.files`, and fetched only when needed. Their table shapes are below.

## Legacy single-bundle layout (`layout: "single"`)

`python3 -m ezber_pipeline export-web --layout single` writes the original
table-per-file payload: `index.json` (version 1) plus `surahs.json`,
`ayahs.json`, `words.json`, `reciters.json`, `audio-files.json`,
`segments/<reciter_id>.json`, `translations.json`, `transliterations.json`,
`licenses.json` and `TANZIL-NOTICE.txt`. The table descriptions below still
apply to it; the grouped layout above is what the app loads.

## Tables

Field names match `schema/content_schema.sql`; the loader also accepts the
aliases in brackets.

### surahs

```json
{ "id": 55, "name_arabic": "الرحمن", "name_latin": "Ar-Rahman",
  "name_english": "The Beneficent", "verses_count": 78,
  "revelation": "Medinan", "bismillah_pre": 1 }
```

Aliases: `chapters` for the file/table name; `verses_count` may be `verse_count`
or `verses`; `name_latin`/`name_english` may be `nameLatin`/`nameEnglish`.

### ayahs

```json
{ "id": 4904, "surah_id": 55, "ayah": 3, "verse_key": "55:3",
  "text_uthmani": "خَلَقَ ٱلْإِنسَٰنَ", "juz": 27, "hizb": 53, "page": 531,
  "sajdah": 0, "transliteration": "Khalaqal-insan" }
```

- `transliteration` is the Tanzil English ayah line. If it is absent the loader
  joins the ayah's `words[].transliteration` in order.
- A grouped form is accepted: `{ id, name_latin, …, ayahs: [ … ] }` (surah-major
  chunks) under any of the `ayahs` / `verses` / `chapters` keys.
- `id` is the Quran-wide ayah index 1…6236. If omitted, the loader derives it
  from the surah verse counts.

### words (optional when ayahs embed them)

```json
{ "ayah_id": 4904, "position": 1, "text_uthmani": "خَلَقَ",
  "transliteration": "Khalaqa", "translation": null }
```

`text_uthmani` is only set when the token count matches the Uthmani word count,
mirroring the pipeline rule. Inline `words: ["Khalaqa", "…"]` or
`words: [{ position, transliteration, … }]` inside an ayah are also accepted.

### reciters

```json
{ "id": 1, "remote_id": "…", "name": "…", "style": "Murattal",
  "qirat": "Hafs 'an Asim", "source": "…", "license_id": "…",
  "license_url": "…", "license_evidence_url": "…", "attribution": "…",
  "has_segments": 1, "enabled": 0 }
```

Reciters with `enabled: 0` are still importable and shown as pending in the
picker; the app never hides the rights state.

### audio_files

```json
{ "id": 1, "reciter_id": 1, "kind": "ayah", "surah_id": 55, "ayah": 3,
  "chapter": null, "variant": "murattal", "url": "https://…/055003.mp3",
  "bytes": 42311, "bitrate": 128, "duration_ms": 4210, "checksum": "sha1:…" }
```

`kind` is `ayah` or `chapter`; `chapter` files cover every ayah in a surah.
URLs may be absolute or relative to the bundle. The app caches them for offline
playback on demand and falls back to the placeholder chime when a reciter has no
audio yet.

### segments

```json
{ "reciter_id": 1, "variant": "murattal", "ayah_id": 4904,
  "word_index": 0, "start_ms": 0, "end_ms": 4210 }
```

`word_index = 0` is the whole-ayah range; `>= 1` maps to `words.position` and
drives the active-word highlight. Times are offsets inside that ayah's audio
file, not a chapter file.

### transliterations / transliteration_rows

```json
{ "id": 1, "resource_id": "tanzil.en.transliteration", "name": "…",
  "author": "…", "language": "en", "source": "tanzil",
  "license_id": "tanzil-transliteration-permission", "license_url": "…",
  "license_evidence_url": "…", "attribution": "…" }
```

```json
{ "transliteration_id": 1, "ayah_id": 4904, "text": "Khalaqal-insan" }
```

Rows may also use `surah_id` + `ayah` (or `verse_number`) instead of `ayah_id`.

## Loader behaviour

- The app probes `/content/index.json` once per start. When `bundle_digest` (or
  `logical_digest`) differs from the imported copy it clears the content tables
  and imports the boot catalogue; surah and segment files are fetched and
  cached on demand. When the id is unchanged nothing is rewritten.
- Offline (or on a 404) the previously imported content stays; first run falls
  back to `web/lib/content/placeholder.ts`.
- Settings → Content re-probes and re-imports on demand.
- `npm run content:link` copies `content-pipeline/build/web/` into
  `web/public/content/` for local integration testing.
