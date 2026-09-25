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
alignment), `normalize.py`, `validate.py`, `package.py`, `canonical.py`
(deterministic JSON/digests), `cli.py`.

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
behavior and byte-for-byte determinism are all covered without touching the
network.