# Ezber content web bundle contract

The content pipeline (task `ezber-content-web-export`) writes a deterministic
web bundle under `content-pipeline/build/web/`. The web app loads it from
`/content/` and imports it into IndexedDB. This file is the contract between the
two lanes; the loader in `web/lib/content/bundle.ts` is deliberately tolerant of
field aliases, but the shapes below are what the app expects.

## Discovery

The loader probes, in order:

1. `/content/index.json`
2. `/content/manifest.json`
3. `/content/bundle.json`

An `index.json`/`manifest.json` points at per-table files; a `bundle.json` may
instead embed the tables as arrays. Either works.

## Manifest

```json
{
  "schema": "ezber-content-web/1",
  "schema_version": 1,
  "pipeline_version": "0.3.0",
  "content_mode": "offline-redistributable",
  "bundle_id": "sha256:…",
  "counts": { "surahs": 114, "ayahs": 6236, "words": 51176, "reciters": 11, "segments": 51176 },
  "files": {
    "surahs": "surahs.json",
    "ayahs": ["ayahs/001.json", "ayahs/002.json"],
    "words": "words.json",
    "reciters": "reciters.json",
    "audio_files": "audio-files.json",
    "segments": ["segments/001.json"],
    "transliterations": "transliterations.json",
    "transliteration_rows": "transliteration-rows.json",
    "licenses": "licenses.json"
  },
  "licenses": [
    { "id": "tanzil-quran-text", "name": "Tanzil Uthmani 1.1", "url": "https://tanzil.net/", "attribution": "…" }
  ],
  "attribution": ["Quran text from the Tanzil Project.", "…"]
}
```

- `bundle_id` must change whenever any file changes; the app re-imports only on
  a new id. Keep it content-derived (e.g. a digest), not a timestamp.
- `generated_at` and other volatile fields are ignored; omit them if you can, so
  two identical builds compare byte-identical.
- `counts` is displayed on the settings screen, so include at least
  `surahs`, `ayahs`, `reciters`, `segments`, `audio_files`.
- Each `files` entry may be a string, an array of strings, or an object with a
  `path`/`paths` field.

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

- The app probes `/content/` once per start. When a bundle is found with a new
  `bundle_id` it clears the content tables and imports everything; when the id is
  unchanged nothing is rewritten.
- Offline (or on a 404) the previously imported content stays; first run falls
  back to `web/lib/content/placeholder.ts`.
- Settings → Content re-probes and re-imports on demand.
- `npm run content:link` copies `content-pipeline/build/web/` into
  `web/public/content/` for local integration testing.
