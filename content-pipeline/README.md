# Ezber content pipeline

A stdlib-only Python pipeline that fetches Ezber's Quran content from primary
sources, normalizes it, validates it, and packages a deterministic SQLite
bundle plus machine-readable manifests. It is designed to be re-runnable on any
machine with Python 3.11+ and no installed dependencies.

```sh
python3 -m ezber_pipeline build                 # network build
python3 -m ezber_pipeline build --offline       # rebuild from the HTTP cache
python3 -m ezber_pipeline build --update-lock   # accept reviewed upstream changes
python3 -m ezber_pipeline verify                # verify the built bundle
python3 -m ezber_pipeline export-web            # compact JSON web/PWA bundle under build/web/
python3 -m ezber_pipeline show-config           # resolved config, no secrets
```

## Content policy

The app is fully offline and ships only redistributable content. There is no
Quran Foundation content, no runtime Content API, no OAuth2/token-broker path
and no English translation (captain decisions 2026-09-25). What the pipeline
bundles:

| Data | Source | State |
|---|---|---|
| Quran text + metadata | Tanzil Uthmani v1.1 / quran-data.xml | shipped |
| Ayah transliteration | Tanzil `en.transliteration` (written permission) | shipped |
| Word transliteration | derived by splitting the ayah line on whitespace | shipped |
| Word timings | cpfair/quran-align CC BY 4.0, 2016-11-24 | shipped for 11 of 12 recitations; As-Sudais asset is a crash log and excluded |
| Recitation audio | Quran-Foundation-confirmed sources only | none enabled yet (CD-2) |
| Translation | — | dropped; tables reserved and empty |

Deliberately not used: fawazahmed (mirrors Tanzil; its repo Unlicense does not
cover the content) and ummahapi (Quran-Foundation-derived, not bundleable).

## Data flow

```
Tanzil Uthmani XML v1.1 ─┐
Tanzil quran-data.xml   ─┤
Tanzil transliteration  ─┼─► normalize (normalize.py) ─► validate (validate.py) ─► package (package.py)
quran-align timings     ─┤                                                  ├─ ezber-content.sqlite
audio catalog (gated)   ─┘                                                  ├─ content-manifest.json
                                                                            ├─ audio-manifest.json
                                                                            ├─ EZBER-LICENSES.json
                                                                            ├─ TANZIL-NOTICE.txt
                                                                            └─ build-report.json
```

Modules: `fetch.py` (HTTP + cache), `lockfile.py` (source pinning),
`sources/` (one adapter per upstream), `timing.py` (quran-align → token
alignment), `normalize.py`, `validate.py`, `package.py`, `webexport.py`
(web/PWA export), `canonical.py` (deterministic JSON/digests), `cli.py`.

## Word derivation and timing alignment

- The Tanzil transliteration page is parsed into one line per ayah (6236), with
  presentation markup stripped and the provenance header verified against
  `licenses/notices/tanzil-transliteration-en.transliteration.txt`.
- Each line is split on whitespace; every token becomes a `words` row.
  `text_uthmani` is set only when the token count equals the Uthmani
  space-split word count (94% of ayahs); mismatched ayahs keep NULL rather than
  a wrong word.
- quran-align indexes words in the Uthmani split. Per ayah, `timing.py`
  repairs the released segments into a non-decreasing time function over word
  positions, aligns tokens to words monotonically by rounding the proportional
  boundary `j*M/N` to the nearest token index (so a token never crosses a word
  boundary), and splits each word's span across its tokens by token length.
  Repairs (reversed segments, zero-length, out-of-range, time inversions,
  synthesized ayahs) are counted per recitation in the manifests.
- quran-align times are offsets within each ayah's own audio file, not within a
  chapter file.

## Determinism

- Canonical JSON throughout (`sort_keys`, UTF-8, `\n`) and `sha256:`-prefixed
  digests.
- SQLite is created from `schema/content_schema.sql` with fixed page size,
  deterministic insert order and `VACUUM`; identical inputs produce a
  byte-identical `.sqlite` file (asserted by the test suite). `segments` uses a
  `WITHOUT ROWID` table to keep the ~925k timing rows compact.
- No timestamps land in the SQLite bundle, manifests or credits. Only
  `build-report.json` records a time (from `SOURCE_DATE_EPOCH` when set) and is
  intentionally not tracked by git.
- `config/source-lock.json` pins the Tanzil payloads, the transliteration page,
  the quran-align archive and each timing asset. A mismatch aborts the build;
  use `--update-lock` only after reviewing the upstream change.

## Web bundle (web/PWA export)

`export-web` derives a compact JSON payload from the built bundle so the web/PWA
app can seed IndexedDB without parsing SQLite. It reads the same canonical
artifacts (`ezber-content.sqlite`, `content-manifest.json`, `TANZIL-NOTICE.txt`)
and the license registry, verifies the database against the manifest first, and
never modifies the SQLite bundle or the manifests. The default `grouped` layout
is built for lazy loading: the app boots from a small `index.json` and fetches a
surah, or one reciter's timings for a surah, on demand.

| File | Contents |
|---|---|
| `index.json` | version, `layout`, counts, `content_meta`, the surah list and reciter catalogue inline, the `database`/`logical_digest`/`bundle_digest` content digests, `licenses_file`, and a sha256/size inventory of every other file. Carries no verse text and no timings |
| `surahs/<surah_id>.json` | one surah: its `ayahs` (primary transliteration edition joined as `transliteration`), the primary edition's `transliteration_rows` and its `words` |
| `segments/<reciter_id>/<surah_id>.json` | `segments` for one reciter and surah, with `reciter_id`, `variant` and `surah_id` hoisted into the header |
| `audio-files.json` | `audio_files` (url, checksum, bytes, bitrate, duration, kind, chapter/ayah); build-time `local_path`/`downloaded_at` are omitted |
| `transliterations.json`, `translations.json` | edition tables (translations reserved and empty) |
| `licenses.json` | the used `licenses/registry.json` entries, attribution strings and notice digests |
| `TANZIL-NOTICE.txt` | the verbatim Tanzil copyright notice |

`--layout single` (or `export_web(..., layout="single")`) still writes the
original table-per-file payload (`surahs.json`, `ayahs.json`, `words.json`,
`reciters.json`, `segments/<reciter_id>.json`, ...) for older consumers.

Every JSON file is canonical compact UTF-8 (`sort_keys`, one trailing newline)
and table files are `{"columns": [...], "rows": [[...]]}` in primary-key order.
Rows move one-for-one into IndexedDB object stores; `verse_key` is the portable
identity and `segments[].word_index = 0` is the whole-ayah range, `>= 1` a word
range (offsets within the ayah's own audio file, exactly as in the schema). Two
exports over the same build are byte-identical.

```sh
make web                                       # build + export in one command
python3 -m ezber_pipeline export-web           # re-export an existing build
python3 -m ezber_pipeline export-web --web-dir path/to/web   # custom destination
python3 -m ezber_pipeline export-web --layout single         # legacy table files
```

`build/web/` is gitignored: like the SQLite bundle it is a reproducible derived
artifact, not a source. `index.json` is the entry point and lists what to cache;
its `files[].sha256` digests let the app detect a partial download. The exporter
writes through a temporary directory and swaps it in, so a failed run never
destroys a previous bundle.

## The HTTP cache

`content-pipeline/.cache/http/` stores every response with its ETag/Last-Modified
so rebuilds are cheap and `--offline` works. The cache is gitignored.

## Reciter admission

A recording is fetched only when its entry in `config/reciters.json` has
`enabled: true`, which the captain authorizes only after Quran Foundation
confirms the source in writing. When enabled, the pipeline verifies the item's
declared license, resolves all 114 chapter files per style/bitrate, validates
ayah timing against Tanzil verse counts and pins an index digest in the source
lock. QuranicAudio-backed recordings are denied by policy and fail the build.
Disabled candidates and the off Islamic Network fallback are documented in the
audio manifest so reviewers can see what is waiting for rights.

## Tests

```sh
cd content-pipeline && python3 -m unittest discover -s tests -t .
```

The suite is fully offline: `tests/helpers.py` generates a complete synthetic
corpus (114 surahs / 6236 ayahs / Tanzil-style transliteration / a synthetic
quran-align archive with deliberate defects / enabled synthetic audio
reciters) and a `FakeFetcher`, so parsing, repair, validation, packaging, lock
behavior, web export and byte-for-byte determinism are all covered without
touching the network.