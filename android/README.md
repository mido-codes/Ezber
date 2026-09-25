# Ezber Android scaffold

A Kotlin + Jetpack Compose skeleton for the Ezber Android app, built from the
product brief in [`../README.md`](../README.md). It is a click-through scaffold:
every main screen exists and navigates, backed by placeholder data and stub
services. No real audio playback and no Android Auto in this slice.

## Requirements

- Android Studio (or command-line Gradle) with JDK 17+
- Android SDK with platform 36 and build-tools 36.0.0
- `minSdk 26`, `compileSdk 36` (see `gradle/libs.versions.toml` for versions)

## Run

```sh
cd android
./gradlew :app:assembleDebug          # debug APK
./gradlew :app:installDebug           # install on a connected device/emulator
```

Or open the `android/` directory in Android Studio and run the `app`
configuration. The project is a single `:app` module; new Kotlin files under
`app/src/main/java/` are picked up automatically.

## Layout

| Path | Contents |
| --- | --- |
| `app/src/main/java/app/ezber/android/` | `EzberApplication`, `MainActivity`, `AppEnvironment`, `AppSettings` |
| `.../models/` | Preset, drill queue (verse × repetition), progress, notes, reciter, surah/verse |
| `.../persistence/` | Shared-schema SQLite user store, read-only content store, in-memory fallbacks |
| `.../services/` | Drill session, Media3-shaped audio, voice memo interfaces + stubs |
| `.../placeholder/` | Placeholder surahs, verses, reciters, presets, progress, notes |
| `.../features/` | One package per screen |
| `.../ui/` | Theme, navigation stack, shared composables |

## Screens

Home/Continue · Surah picker · Section picker · Preset builder · Preset library ·
Study player · Reciter picker · Progress overview · Verse progress detail ·
Notes · Settings · Credits and licenses.

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

- `schema/user_schema.sql` — copied into
  `persistence/UserSchema.kt`, which creates `ezber-user.sqlite` in the app's
  private database directory via `SQLiteOpenHelper`. Presets, per-verse
  progress (`(preset_id, ayah)`), `plan_state` resume points, sessions, notes
  (with the FTS5 index where the platform SQLite supports it) and settings all
  keep the canonical columns. Three per-preset display options have no column
  there (translation mode, transliteration style, loop-until-stopped), so
  `SqliteUserDataStore` keeps them in the `settings` key/value table under
  `presets.<id>.display_extras`.
- `schema/content_schema.sql` — read-only. `SqliteContentStore` opens
  `ezber-content.sqlite` from the app's files directory (falling back to a
  bundled asset), validates `content_meta.schema_version` and
  `content_mode = offline-redistributable`, and otherwise falls back to
  `InMemoryContentStore` with placeholder data. The app never writes to it.

All timestamps are ISO-8601 UTC strings (`models/Iso8601.kt`) so exports
round-trip with the iOS app.

If the canonical schema changes, change `schema/` first, then update the DDL in
`persistence/UserSchema.kt` and `UserSchema.VERSION` with a migration that
preserves user rows.

## What is stubbed

- Audio and background playback: `AudioSessionService` / `AudioPlayer` are
  Media3-shaped interfaces (`services/AudioSessionService.kt`) with no-op
  implementations. The real code will wrap ExoPlayer, a MediaSessionService,
  audio focus and a MediaSession for lock-screen / Android Auto metadata.
- Drill playback: `StubDrillSessionService` advances on a 4-second timer.
- Voice memos: `StubVoiceMemoService` records nothing. The shared notes table
  has no memo columns, so a memo is stored as a note whose body marks the
  transcript pending.
- Downloads/storage management, export, and per-surah reciter availability.
- Android Auto and lock-screen/Now Playing integration (out of scope here).
- English-first with Turkish available: the app language setting is applied to
  the composition, but only the strings in `res/values/strings.xml` are
  translated in `res/values-tr/strings.xml`. The iOS String Catalog
  (`ios/Ezber/Resources/Localizable.xcstrings`) is the reference for the full
  key set.
- Credits attributions are provisional; the authoritative license registry is
  under `licenses/`.
