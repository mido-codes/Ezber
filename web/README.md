# Ezber web app + PWA

The Ezber MVP as a single codebase that runs on iPhone, Android and desktop from
the browser. It covers everything the native apps do except CarPlay: surah and
section pickers, the preset builder, the study player with per-verse repeats,
reciters, progress, notes and settings — all offline, no account, no server.

The web app is **online-first and lazy**: boot loads a small index (surah names
and reciters), a surah's reading is fetched when that surah is opened, and one
reciter's word timings per surah are fetched when playback needs them. Each
piece is cached in memory and opportunistically in IndexedDB, so visited
content keeps working offline. Presets, progress and notes always stay local.

The app is English-first with Turkish available (captain decision 2026-09-25).

## Commands

```bash
cd web
npm install          # first time only
npm run dev          # http://localhost:3000
npm test             # offline unit tests (Node test runner + fake IndexedDB)
npm run typecheck    # tsc --noEmit
npm run build        # static export to web/out/
npx serve out        # serve the production build
npm run icons        # regenerate the PWA icon set (needs ImageMagick)
npm run content:fixture  # build the fixture from the real export and install it into public/content/
EZBER_CONTENT_EXPORT=/path/to/build/web npm test  # also run the real-export contract tests
```

`npm run build` is a Next.js static export (`output: 'export'`,
`trailingSlash: true`), so `web/out/` can be hosted from any static file server
or CDN. Everything the app needs at runtime lives in the static build, the
content export under `/content/`, IndexedDB and Cache Storage; there is no API.

To use the pipeline's export instead of the fixture:

```bash
npm run content:link   # copies content-pipeline/build/web/ into web/public/content/
```

## Architecture

| Layer | Where | Notes |
| --- | --- | --- |
| Shell + routing | `app/` | Next App Router, every page a client component; static export |
| App state | `lib/app/app-context.tsx` | opens the stores, seeds demo data, exposes settings/i18n/theme |
| Content store | `lib/content/` | grouped lazy loader, placeholder content, IndexedDB cache |
| User store | `lib/user/` | presets, progress, sessions, plan state, notes, ratings, settings |
| Playback engine | `lib/player/` | drill queue, audio resolver, Media Session transport |
| PWA | `public/manifest.webmanifest`, `public/sw.js`, `lib/pwa/` | install, offline shell, audio downloads, wake lock |
| Design system | `components/design-system/` | kit tokens and components copied from `data/ezber-design-system` |
| Tokens | `app/globals.css` | exact kit values; dark accent darkened to `#7E6438` for AA contrast |

Screens: home/continue (`/`), surah picker (`/browse/`), section picker
(`/browse/section/`), preset builder (`/builder/`), preset library (`/presets/`),
study player (`/player/`), reciter picker (`/reciters/`), progress (`/progress/`),
verse progress detail (`/progress/verse/`), notes (`/notes/`), settings
(`/settings/`) and credits (`/credits/`), plus a skippable first-run wizard
(`/welcome/`) and an offline fallback (`/offline/`).

## Storage: IndexedDB mirroring the shared schema

Content and user data stay in **separate IndexedDB databases** exactly as
`schema/content_schema.sql` and `schema/user_schema.sql` keep separate SQLite
files, so a content refresh can never touch presets or notes.

`ezber-content` (v2) stores: `content_meta`, `surahs`, `reciters`, `licenses`
(the boot index), `ayahs`, `words` (per-surah reading cache), `segments` (word
timings per reciter/surah), `audio_files`, plus `surah_cache` and
`segments_cache`, which record what has been fetched for which `bundle_id`.
Records keep the schema's snake_case fields and keys (`verse_key`,
`[ayah_id, position]`, `[reciter_id, variant, ayah_id, word_index]`, …).
The v1 bulk-import tables are retired on upgrade: the old whole-bundle data is
cleared and content is cached per surah from then on. The reserved
`translations`/`translation_rows` tables are intentionally absent: the captain
dropped English translations on 2026-09-25.

`ezber-user` (v1) stores: `schema_version`, `presets`, `preset_verses`,
`progress`, `sessions`, `plan_state`, `notes`, `settings`, `ratings`. Dates are
ISO-8601 UTC strings, as the schema requires.

Two documented deviations, both forced by the browser or by gaps in the shared
schema:

- **`presets.section_repeats`** (INTEGER, `0` = loop until stopped) is a web
  extension for the journey-decided section-repeat plan (Q5/A2). It should become
  a schema column; until then it lives beside the canonical fields.
- **`ratings`** is a small append-only store used to derive
  `progress.memorization_state` from the self-rating signal (Q3/A9). The schema
  has no ratings table yet.
- Notes search scans `notes` because IndexedDB has no FTS5 equivalent; behaviour
  matches the FTS query the schema documents.

## Content export

The grouped, lazily loaded web contract is documented in
[`CONTENT_BUNDLE.md`](./CONTENT_BUNDLE.md): a small `/content/index.json`
(columnar 114-surah/reciter catalogue plus a payload inventory),
`/content/surahs/<id>.json` (columnar ayahs, transliteration and words) and
`/content/segments/<reciter>/<surah>.json` (columnar timings). The app fetches
only what a view needs and caches every piece; nothing is bulk-imported at boot.
`web/fixtures/content/` is generated from the real pipeline export by
`scripts/build-fixture.mjs` (payload files copied verbatim, index trimmed to the
fixture's files), so the committed fixture cannot drift from the exporter's
shape; `tests/real-export.test.ts` additionally runs a full export through the
loader when `EZBER_CONTENT_EXPORT` points at one. The built-in placeholder
content (real Tanzil Uthmani for a curated set of surahs, generated readings
eitherwise, clearly labelled) fills in only when a document is absent, and a
recorded problem (unsupported layout, HTTP status, parse or network failure) is
surfaced in Settings → Content and the placeholder banner — never silently.
Settings → Content also shows the index source, bundle id and cache contents,
with refresh and clear actions.

## PWA and playback

- `public/manifest.webmanifest` + icons make the app installable; iOS gets
  `apple-touch-icon` and a standalone display mode.
- `public/sw.js` precaches the app shell and every hashed Next.js chunk (listed
  by the `precache-manifest.json` written during `npm run build`), serves
  navigations from the shell cache first, keeps fetched content in the runtime
  cache, and caches downloaded audio in the `ezber-audio-v1` bucket. Visited
  surahs and their timings therefore hydrate and play offline.
- Settings → Downloads can pre-cache every preset's surah/reciter audio.
- Playback uses a single `HTMLAudioElement` driven by `DrillEngine`; the Media
  Session API publishes lock-screen metadata (surah, verse, reciter) and
  play/pause, next/previous, seek-forward/back and stop handlers.
- A screen wake lock is held while a study session is open.

## Known limits

- **No CarPlay** — out of scope for this MVP (the native iOS lane owns it).
- **Browser autoplay** means the first play needs a tap; the player opens paused,
  which is also friendlier in the car.
- **Interruption policy**: the settings mirror the iOS choices (duck navigation
  prompts, pause for calls), but the web platform does not expose navigation
  ducking or call events; OS-level `pause` events are honoured and playback state
  follows them.
- **Placeholder audio** is a soft chime per repeat until rights-cleared
  recitations ship; when the export provides `segments`, the active-word
  highlight follows those real timings even while the chime plays.
- **Offline scope** is what has been visited: the index, opened surahs and their
  timings are cached, so those keep working offline; a surah never opened on
  this device needs the network (or falls back to the placeholder reading).
- Content is read-only in the app, as the schema mandates; the user DB is the
  only thing the app writes.

## Fonts and licences

Plus Jakarta Sans and Source Serif 4 (OFL) are self-hosted from
`web/fonts/`; the licence texts ship in `public/licenses/`. The app's Credits
screen lists the content licences (Tanzil text and transliteration grant,
quran-align CC BY 4.0) and the bundle's own licence registry.
