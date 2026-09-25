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
and no English translation (captain decision 2026-09-25). What the pipeline can
bundle:

| Data | State |
|---|---|
| Tanzil Uthmani text v1.1 + metadata | shipped |
| Recitation audio + ayah timing | built only for `enabled: true` reciters; all candidates currently disabled pending Quran Foundation's written confirmation (CD-2) |
| Word-level transliteration + per-word timing | adapter seam in place, disabled until a redistributable source clears rights (CD-6) |
| Translation | dropped; tables reserved and empty |

## Data flow

```
Tanzil Uthmani XML v1.1 ─┐
Tanzil quran-data.xml   ─┼─► normalize (bundle.py) ─► validate (validate.py) ─► package (package.py)
reciters (enabled only) ─┤                                                  ├─ ezber-content.sqlite
word-level adapter      ─┘                                                  ├─ content-manifest.json
                                                                            ├─ audio-manifest.json
                                                                            ├─ EZBER-LICENSES.json
                                                                            ├─ TANZIL-NOTICE.txt
                                                                            └─ build-report.json
```

Modules: `fetch.py` (HTTP + cache), `lockfile.py` (source pinning),
`sources/` (one adapter per upstream), `word_level.py` (the swap-in seam),
`normalize.py`, `validate.py`, `package.py`, `canonical.py` (deterministic
JSON/digests), `cli.py`.

## Determinism

- Canonical JSON throughout (`sort_keys`, UTF-8, `\n`) and `sha256:`-prefixed
  digests.
- SQLite is created from `schema/content_schema.sql` with fixed page size,
  deterministic insert order and `VACUUM`; identical inputs produce a
  byte-identical `.sqlite` file (asserted by the test suite).
- No timestamps land in the SQLite bundle, manifests or credits. Only
  `build-report.json` records a time (from `SOURCE_DATE_EPOCH` when set) and is
  intentionally not tracked by git.
- `config/source-lock.json` pins the Tanzil payloads and, whenever reciters are
  enabled, their timing + audio index digests. A mismatch aborts the build; use
  `--update-lock` only after reviewing the upstream change.

## The HTTP cache

`content-pipeline/.cache/http/` stores every response with its ETag/Last-Modified
so rebuilds are cheap and `--offline` works. The cache is gitignored.

## Word-level adapter (swap-in seam)

Word highlighting needs the transliteration of every word plus per-word
start/end times aligned to a recitation. Because no source that may be
redistributed has cleared rights yet, the pipeline bundles no word rows.

To add a source later:

1. Implement the `WordLevelAdapter` protocol in
   `ezber_pipeline/sources/word_level.py` and register it with
   `register_adapter(source_id, factory)`. `fetch()` returns `WordLevelData`
   with one `WordToken` per word position and, when the source has timings,
   `WordTiming` rows plus a `TimingTarget(reciter_remote_id, variant)`.
2. Add the source's license to `licenses/registry.json`, then set
   `active_source`, `license_id` and (optionally) `timing_target` in
   `config/word_level.json` and switch `enabled` to true.
3. Run the build. Normalization fills `words`, word-level `segments` and the
   transliteration edition rows; validation enforces contiguous word
   positions, non-empty transliterations, complete per-word timing coverage
   and non-overlapping ranges.

The adapter must only be enabled for content the app may redistribute.

## Reciter admission

A recording is fetched only when its entry in `config/reciters.json` has
`enabled: true`, which the captain authorizes only after Quran Foundation
confirms the source in writing. When enabled, the pipeline:

- verifies the Internet Archive item still declares the expected license URL,
- resolves all 114 chapter files for each configured style/bitrate,
- validates ayah timing against Tanzil verse counts (dropping the optional
  ayah-0 preamble row, and refusing incomplete styles),
- records URLs, sizes and sha1/md5 in the audio manifest, and pins an index
  digest in the source lock.

QuranicAudio-backed recordings are denied by the policy list and fail the
build. Disabled candidates and the off Islamic Network fallback are documented
in the audio manifest so reviewers can see what is waiting for rights.

## Tests

```sh
cd content-pipeline && python3 -m unittest discover -s tests -t .
```

The suite is fully offline: `tests/helpers.py` generates a complete synthetic
corpus (114 surahs / 6236 ayahs / enabled synthetic reciters / a fake
word-level adapter) and a `FakeFetcher`, so validation, packaging, lock
behavior and byte-for-byte determinism are all covered without touching the
network.
