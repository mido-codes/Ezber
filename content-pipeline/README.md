# Ezber content pipeline

A stdlib-only Python pipeline that fetches Ezber's Quran content from primary
sources, normalizes it, validates it, and packages a deterministic SQLite
bundle plus machine-readable manifests. It is designed to be re-runnable on any
machine with Python 3.11+ and no installed dependencies.

```sh
python3 -m ezber_pipeline build                 # network build
python3 -m ezber_pipeline build --offline       # rebuild from the HTTP cache
python3 -m ezber_pipeline build --update-lock   # accept reviewed upstream changes
python3 -m ezber_pipeline build --require-qf-auth  # fail unless QF creds are set
python3 -m ezber_pipeline verify                # verify the built bundle
python3 -m ezber_pipeline show-config           # resolved config, no secrets
```

## Data flow

```
Tanzil Uthmani XML v1.1 ─┐
Tanzil quran-data.xml   ─┤
QF resource 57 / 19     ─┼─► normalize (bundle.py) ─► validate (validate.py) ─► package (package.py)
IA CC BY 4.0 metadata   ─┤                                                  ├─ ezber-content.sqlite
IA timing.json          ─┘                                                  ├─ content-manifest.json
                                                                            ├─ audio-manifest.json
                                                                            ├─ EZBER-LICENSES.json
                                                                            ├─ TANZIL-NOTICE.txt
                                                                            └─ build-report.json
```

Modules: `fetch.py` (HTTP + cache), `lockfile.py` (source pinning),
`sources/` (one adapter per upstream), `normalize.py`, `validate.py`,
`package.py`, `canonical.py` (deterministic JSON/digests), `cli.py`.

## Determinism

- Canonical JSON throughout (`sort_keys`, UTF-8, `\n`) and `sha256:`-prefixed
  digests.
- SQLite is created from `schema/content_schema.sql` with fixed page size,
  deterministic insert order and `VACUUM`; identical inputs produce a
  byte-identical `.sqlite` file (asserted by the test suite).
- No timestamps land in the SQLite bundle, manifests or credits. Only
  `build-report.json` records a time (from `SOURCE_DATE_EPOCH` when set) and is
  intentionally not tracked by git.
- `config/source-lock.json` pins the Tanzil payloads, the QF corpus digests and
  each reciter's timing + audio index. A mismatch aborts the build; use
  `--update-lock` only after reviewing the upstream change.

## The HTTP cache

`content-pipeline/.cache/http/` stores every response with its ETag/Last-Modified
so rebuilds are cheap and `--offline` works. The cache is gitignored. OAuth
tokens are never written to it.

## Quran Foundation access

- Default (no secrets): the unauthenticated legacy endpoint at
  `https://api.quran.com/api/v4` via `verses/by_chapter/{n}?translations=19,57`.
  This keeps CI and fresh clones runnable with zero credentials.
- With `QF_CLIENT_ID`/`QF_CLIENT_SECRET` in the environment: OAuth2
  client-credentials against the QF prelive/production Content API
  (`QF_ENV` selects the environment). The secret is used once for the token
  exchange, never cached, never logged, never written to a manifest. This is
  the QF Server-Only Rule.
- `--require-qf-auth` makes a build fail unless credentials are present, so a
  release job can assert that it used the authenticated path.

## Adding a reciter

1. Find an Internet Archive item that declares an explicit distribution
   license (the current catalog uses the CC BY 4.0 "Dhikr Al-Huda" items, whose
   audio is chapter-level with `timing.json`).
2. Add an entry to `config/reciters.json`: `remote_id`, display metadata,
   `license_metadata_url`, `expected_license_url_prefix`, styles, timing path,
   bitrates.
3. Run `python3 -m ezber_pipeline build`; the pipeline machine-checks the
   declared license, resolves all 114 chapter files, validates ayah timing
   against Tanzil verse counts and writes the new hashes into the lock.

Recordings without an explicit license, and anything QuranicAudio-backed, are
rejected by `validate.py` and the deny-list in `config/sources.json`.

## Adding a translation or transliteration

Add an edition to `config/translations.json` or `config/transliterations.json`
with the QF resource id, `license_id` from `licenses/registry.json`, evidence
URL and attribution. The pipeline fetches every ayah and fails if coverage is
incomplete. QF terms forbid redistributing raw rows; see `docs/licensing.md`.

## Tests

```sh
cd content-pipeline && python3 -m unittest discover -s tests -t .
```

The suite is fully offline: `tests/helpers.py` generates a complete synthetic
corpus (114 surahs / 6236 ayahs / two synthetic reciters) and a `FakeFetcher`,
so validation, packaging, lock behavior and byte-for-byte determinism are all
covered without touching the network.
