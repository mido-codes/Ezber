# Ezber iOS scaffold

A native SwiftUI skeleton for the Ezber iPhone app, built from the product brief in
[`../README.md`](../README.md). It is a click-through scaffold: every main screen
exists and navigates, backed by placeholder data and stub services. No real audio
playback and no CarPlay in this slice.

## Requirements

- macOS with Xcode 16 or newer (the project uses file-system-synchronized groups)
- iOS 17.0+ simulator

## Run

```sh
open ios/Ezber.xcodeproj      # from the repo root
# or
xcodebuild -project ios/Ezber.xcodeproj -scheme Ezber \
  -destination 'platform=iOS Simulator,name=iPhone 16' build
```

Select an iPhone simulator and run. Adding files under `Ezber/` does not require
editing the Xcode project; the synchronized group picks them up.

## Layout

| Path | Contents |
| --- | --- |
| `Ezber/App/` | App entry, environment, settings, root tab navigation |
| `Ezber/DesignSystem/` | Ported design tokens and reusable components (see `data/ezber-design-review/report.md` in the firstmate workspace) |
| `Ezber/Models/` | Preset, drill queue (verse × repetition), progress, notes, reciter, surah/verse |
| `Ezber/Persistence/` | SQLite wrapper, schema, content store, user data store, in-memory fallbacks |
| `Ezber/Services/` | Audio session, drill session, voice memo protocols + stubs |
| `Ezber/Placeholder/` | Placeholder surahs, verses, presets, progress, notes |
| `Ezber/Features/` | One folder per screen |
| `Ezber/Resources/` | Asset catalog, String Catalog (English source, Turkish translations) and bundled OFL fonts |

## Screens

Home/Continue · Surah and section picker · Preset builder · Preset library ·
Study player · Reciter picker · Progress overview · Verse progress detail ·
Notes · Settings · Credits and licenses.

The study player is driven by `DrillSessionService`: a drill is a queue of
`DrillItem` values (one per verse × repetition), and progress/resume points are
recorded at every repeat boundary. `StubDrillSessionService` simulates playback
with a timer so the flow is clickable; replacing it with a real AVPlayer-based
implementation should not change the views.

## Stores

- `content.sqlite` — content produced by the content pipeline (surahs, verses,
  transliterations, translations, reciter metadata). When it is absent, the app
  falls back to `PlaceholderContent`.
- `user.sqlite` — device-local user data (presets, verse progress, study
  sessions, notes, downloads) in Application Support.

`Ezber/Persistence/Schema.swift` holds both DDLs and is marked provisional: the
canonical shared schema is owned by the foundation work (planned at `schema/`).
When it lands, replace the DDL and row mapping there.

## What is stubbed

- Audio playback and background audio: `StubAudioSessionService` only tracks state.
- Drill playback: `StubDrillSessionService` advances on a 4-second timer.
- Voice memos: `StubVoiceMemoService` records nothing; notes can be marked as
  voice memos with transcription pending.
- Downloads/storage management, export, and per-surah reciter availability.
- CarPlay and lock-screen/Now Playing integration (out of scope for this slice).
- Credits attributions are provisional; the authoritative license registry is
  owned by the rights work under `licenses/`.
