# Ezber web app + PWA

The Ezber MVP as a single codebase that runs on iPhone, Android and desktop from
the browser. It covers everything the native apps do except CarPlay: surah and
section pickers, the preset builder, the study player with per-verse repeats,
reciters, progress, notes and settings — all offline, no account, no server.

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
```

`npm run build` is a Next.js static export (`output: 'export'`,
`trailingSlash: true`), so `web/out/` can be hosted from any static file server
or CDN. Everything the app needs at runtime lives in the bundle, IndexedDB and
Cache Storage; there is no API.

To try the real content bundle while the pipeline export is in flight:

```bash
npm run content:link   # copies content-pipeline/build/web/ into web/public/content/
```

## Architecture

| Layer | Where | Notes |
| --- | --- | --- |
| Shell + routing | `app/` | Next App Router, every page a client component; static export |
| App state | `lib/app/app-context.tsx` | opens the stores, seeds demo data, exposes settings/i18n/theme |
| Content store | `lib/content/` | bundle loader, placeholder content, IndexedDB repository |
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

`ezber-content` (v1) stores: `content_meta`, `surahs`, `ayahs`, `words`,
`reciters`, `audio_files`, `segments`, `transliterations`,
`transliteration_rows`, `licenses`. Records keep the schema's snake_case fields
and keys (`verse_key`, `[ayah_id, position]`,
`[reciter_id, variant, ayah_id, word_index]`, …). The reserved
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

## Content bundle

The content pipeline's web export is documented in
[`CONTENT_BUNDLE.md`](./CONTENT_BUNDLE.md). The app probes `/content/` on start
(`index.json`, then `manifest.json`, then `bundle.json`), normalises the tables
into the schema shapes above and imports them when the `bundle_id` changes.
Until a bundle exists the app seeds placeholder content (real Tanzil Uthmani for
a curated set of surahs, generated placeholder readings elsewhere, clearly
labelled in the UI). Settings → Content can re-import at any time.

## PWA and playback

- `public/manifest.webmanifest` + icons make the app installable; iOS gets
  `apple-touch-icon` and a standalone display mode.
- `public/sw.js` precaches the app shell, serves navigations from cache first
  and caches downloaded audio in the `ezber-audio-v1` Cache Storage bucket.
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
  recitations ship; word timings then come from the bundle's `segments`.
- Content is read-only in the app, as the schema mandates; the user DB is the
  only thing the app writes.

## Fonts and licences

Plus Jakarta Sans and Source Serif 4 (OFL) are self-hosted from
`web/fonts/`; the licence texts ship in `public/licenses/`. The app's Credits
screen lists the content licences (Tanzil text and transliteration grant,
quran-align CC BY 4.0) and the bundle's own licence registry.
