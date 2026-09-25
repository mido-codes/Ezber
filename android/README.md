# Ezber Android app

A Kotlin + Jetpack Compose app for the Ezber flow, built from the product brief
in [`../README.md`](../README.md). Screens are wired to the shared user store
and to the content bundle's lazily fetched cache; there is no placeholder
content. Audio playback, background audio and Android Auto are the remaining
stub slice (the Media3-shaped interfaces stay stable while the audio engine
lands).

## Requirements

- Android Studio (or command-line Gradle) with JDK 17+
- Android SDK with platform 36 and build-tools 36.0.0
- `minSdk 26`, `compileSdk 36` (see `gradle/libs.versions.toml` for versions)

## Run

```sh
cd android
./gradlew :app:assembleDebug          # debug APK
./gradlew :app:installDebug           # install on a connected device/emulator
./gradlew :app:testDebugUnitTest      # offline JVM unit tests
```

Or open the `android/` directory in Android Studio and run the `app`
configuration. The project is a single `:app` module; new Kotlin files under
`app/src/main/java/` are picked up automatically. The unit tests cover the
grouped content-bundle parsers and the lazy fetch/cache engine.

## Content source

The app never bundles Quran data. It fetches the pipeline's grouped web bundle
(contract: [`../web/CONTENT_BUNDLE.md`](../web/CONTENT_BUNDLE.md); lazy layout)
over HTTP and caches what it fetches in `ezber-content.sqlite`:

- `/content/index.json` — surah list, reciter catalogue, counts and a sha256
  inventory of every other file; fetched once per process.
- `/content/surahs/<surah_id>.json` — that surah's ayahs, words and
  transliteration rows; fetched when the surah is opened.
- `/content/segments/<reciter_id>/<surah_id>.json` — word timings; fetched when
  the audio engine needs them. A pair with no file is remembered as absent.
- `audio-files.json`, `transliterations.json`, `licenses.json` and the Tanzil
  notice are whole-bundle files, fetched on demand.

Nothing is bulk-imported. Fetched bodies are checked against the index's
sha256 digests and inserted into tables mirroring `schema/content_schema.sql`.
Screens gate on the catalogue through `ui/ContentGate.kt` and show loading,
error and retry states; Settings → Content source owns the base URL and the
manual refresh. The default `http://10.0.2.2:3000/content/` reaches a web dev
server on the emulator host (`npm run dev` in `web/`, with
`npm run content:link` to place the export under `web/public/content/`).

## Layout

| Path | Contents |
| --- | --- |
| `app/src/main/java/app/ezber/android/` | `EzberApplication`, `MainActivity`, `AppEnvironment`, `AppSettings` |
| `.../models/` | Preset, drill queue (verse × repetition), progress, notes, reciter, surah/verse/word |
| `.../content/` | Fetcher, bundle parsers and the lazy `ContentRepository` |
| `.../persistence/` | Shared-schema user and content stores, the SQLite helpers and in-memory test/preview stores |
| `.../services/` | Drill session, Media3-shaped audio, voice memo interfaces + stubs |
| `.../features/` | One package per screen |
| `.../ui/` | Theme, navigation stack, shared composables, `ContentGate` |

## Screens

Home/Continue · Surah picker · Section picker · Preset builder · Preset library ·
Study player · Reciter picker · Progress overview (with session history) ·
Verse progress detail · Notes (searchable) · Settings (content source, display,
audio, language, credits) · Credits and licenses.

Navigation is a small per-tab back stack in `ui/Navigation.kt` (`Screen` +
`Navigator`) so each bottom-bar tab keeps its own history, mirroring the iOS
scaffold's `NavigationStack` paths. The study player is driven by
`DrillSessionService`: a drill is a queue of `DrillItem` values (one per verse ×
repetition), and progress/resume points are recorded at every repeat boundary.
`StubDrillSessionService` simulates playback with a main-looper timer so the
flow is clickable; replacing it with an ExoPlayer-based implementation should
not change the screens.

## Stores

The shared schema under `schema/` is authoritative:

- `schema/user_schema.sql` — copied into `persistence/UserSchema.kt`, which
  creates `ezber-user.sqlite` in the app's private database directory via
  `SQLiteOpenHelper`. Presets, per-verse progress (`(preset_id, ayah)`),
  `plan_state` resume points, sessions, notes (with the FTS5 index where the
  platform SQLite supports it) and settings all keep the canonical columns.
  Three per-preset display options have no column there (translation mode,
  transliteration style, loop-until-stopped), so `SqliteUserDataStore` keeps
  them in the `settings` key/value table under `presets.<id>.display_extras`.
- `schema/content_schema.sql` — copied into `persistence/ContentSchema.kt`,
  which creates the app-owned `ezber-content.sqlite` cache in the app's
  database directory. `ContentRepository` fills it lazily over HTTP and
  `SqliteContentStore` reads it; clearing or rebuilding it never touches user
  rows. The API 26–29 platform SQLite lacks FTS5, so notes search falls back to
  `LIKE` there.

All timestamps are ISO-8601 UTC strings (`models/Iso8601.kt`) so exports
round-trip with the iOS app.

If the canonical schema changes, change `schema/` first, then update the DDL in
`persistence/UserSchema.kt` / `persistence/ContentSchema.kt` and the matching
`VERSION`, with a row-preserving migration for user data.

## What is stubbed

- Audio and background playback: `AudioSessionService` / `AudioPlayer` are
  Media3-shaped interfaces (`services/AudioSessionService.kt`) with no-op
  implementations. The real code will wrap ExoPlayer, a MediaSessionService,
  audio focus and a MediaSession for lock-screen / Android Auto metadata.
- Drill playback: `StubDrillSessionService` advances on a 4-second timer.
- Voice memos: `StubVoiceMemoService` records nothing. The shared notes table
  has no memo columns, so a memo is stored as a note whose body marks the
  transcript pending.
- Audio downloads and offline storage management.
- Android Auto and lock-screen/Now Playing integration (out of scope here).
- English-first with Turkish available: the app language setting is applied to
  the composition, but only the strings in `res/values/strings.xml` are
  translated in `res/values-tr/strings.xml`. The iOS String Catalog
  (`ios/Ezber/Resources/Localizable.xcstrings`) is the reference for the full
  key set.
