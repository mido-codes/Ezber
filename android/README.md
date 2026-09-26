# Ezber Android app

A Kotlin + Jetpack Compose app for the Ezber flow, built from the product
brief in [`../README.md`](../README.md). Every main screen navigates and the
study player runs on a real Media3 drill engine: ExoPlayer in a
`MediaLibraryService` with background playback, a MediaStyle notification,
lock-screen/headset controls, audio-focus ducking and an Android Auto browse
tree. Audio comes from the content bundle's audio manifest and is cached
locally on demand; screens show placeholder content until the pipeline
database is bundled.

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
| `.../services/` | Drill session and audio interfaces (Media3-shaped), stub implementations for previews |
| `.../audio/` | Media3 engine: `EzberMediaService`, controller-backed player, audio manifest resolver + local cache, now-playing identities |
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
`StubDrillSessionService` (a main-looper timer) is kept for Compose previews;
the live app uses `MediaDrillSessionService` in `audio/`.

## Audio and Android Auto

The playback stack lives in `app/src/main/java/app/ezber/android/audio/`:

- `EzberMediaService` is a Media3 `MediaLibraryService` (a
  `MediaSessionService`) that owns the ExoPlayer and the `MediaLibrarySession`,
  declared in the manifest with `foregroundServiceType="mediaPlayback"`, the
  `FOREGROUND_SERVICE_MEDIA_PLAYBACK` permission and the
  `androidx.media3.session.MediaSessionService` +
  `android.media.browse.MediaBrowserService` intent filters. Audio focus (`duck
  under navigation`), becoming-noisy pause, the MediaStyle notification and the
  lock-screen/headset transport are Media3's. The service also hosts the
  Android Auto browse tree: root → presets (`res/xml/automotive_app_desc.xml`
  declares the media capability); selecting a preset expands its verse ×
  repetition plan through the content manifest and starts it.
- `MediaControllerAudioPlayer` is the `AudioPlayer` implementation the drill
  engine drives; it wraps a `MediaController` to the service (connecting lazily
  and queueing commands issued before the connection resolves).
- `MediaDrillSessionService` is the real `DrillSessionService`: it expands the
  preset into `DrillQueue` items, resolves each distinct verse through the
  audio manifest, caches the files, and plays one media item per repeat. Each
  item's stable id is `preset + verse_key + repeat`, so resume points, the lock
  screen and Android Auto all navigate repeat by repeat. Auto-advance, the
  preset's pause between repeats, loop-until-stopped, manual transport and
  completion all keep the same boundary semantics as the stub.
- `DrillAudioResolver` + `AudioCache` resolve `ContentProviding.audioFiles(...)`
  rows: per-ayah file first, then a chapter file, then any file for the surah.
  Downloads land under `files/audio-cache/<reciter>/` and are verified against
  the manifest's `bytes`/`checksum`. There is deliberately no placeholder audio:
  a verse with no manifest row or a failed download surfaces as an error state
  in the study player instead of fake sound.

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

## What is not finished

- Voice memos: `StubVoiceMemoService` records nothing. The shared notes table
  has no memo columns, so a memo is stored as a note whose body marks the
  transcript pending.
- Downloads/storage management and export: the audio cache is filled on demand
  by playback; there is no bulk "download the surah" UI yet, and the reciter
  picker's download badge still reads the content `local_path` column (which the
  read-only bundle never fills) rather than the cache.
- Process-death resume: playback resumes at the saved repeat boundary whenever
  the app reloads the preset; `MediaSession.Callback.onPlaybackResumption` is
  not implemented, so the media session itself does not rebuild a queue after
  the process is killed.
- English-first with Turkish available: the app language setting is applied to
  the composition, but only the strings in `res/values/strings.xml` are
  translated in `res/values-tr/strings.xml`. The iOS String Catalog
  (`ios/Ezber/Resources/Localizable.xcstrings`) is the reference for the full
  key set.
- Credits attributions are provisional; the authoritative license registry is
  under `licenses/`.
