# Project agent memory

Ezber is a Quran memorization and listening app for iPhone and Android. The repository holds the content foundation — a reproducible content pipeline and the shared schema — together with the native iOS and Android apps and the web app/PWA in `web/`. The source technical plan is the `quran-app-tech` report (2026-09-25) at `/home/dogukan/dev/firstmate/data/quran-app-tech/report.md`; captain decisions of 2026-09-25 supersede parts of it and are recorded in `docs/captain-decisions.md`.

## Orientation

- `README.md` is the product brief; it is the source of truth for scope and behavior.
- `content-pipeline/README.md` — pipeline architecture, content policy, word derivation and timing alignment, reciter admission, cache and lock.
- `schema/README.md` and `docs/shared-schema.md` — content DB vs user DB, conventions, example joins. Content and user data live in separate SQLite files on purpose.
- `docs/licensing.md` — shipped assets, the Tanzil transliteration grant, the quran-align repair policy, residual risks.
- `docs/captain-decisions.md` — resolved captain decisions and the still-open items. Record new captain calls there; do not decide them in code.
- `content-pipeline/build/` — generated artifacts. Manifests, credits and notices are tracked so reviews can read them; `*.sqlite`, `build-report.json` and the `web/` export (bulk JSON for the web/PWA app) are gitignored.
- The iOS app lives in `ios/` (SwiftUI, iOS 17+, Xcode 16+). Build on macOS with `open ios/Ezber.xcodeproj` or `xcodebuild -project ios/Ezber.xcodeproj -scheme Ezber -destination 'platform=iOS Simulator,name=iPhone 16' build`.
- The Android app lives in `android/` (Kotlin, Jetpack Compose, single `:app` module). Versions are centralized in `android/gradle/libs.versions.toml`; a Gradle wrapper is committed, so use `./gradlew` rather than a system Gradle.
- The web app/PWA lives in `web/` (Next.js App Router, TypeScript, Tailwind v4, static export). `web/README.md` owns its architecture, IndexedDB mapping and commands; `web/CONTENT_BUNDLE.md` is the JSON contract between the app and the pipeline's web export. The kit is copied into `web/components/design-system/` and `web/app/globals.css`; never import from the firstmate workspace at runtime.
- The ported design system lives in `ios/Ezber/DesignSystem/`: `EzberTheme.swift` is the single source of truth for colour, type, spacing, radius and shadow tokens, and the component files next to it mirror the kit at `data/ezber-design-system` (firstmate workspace). Exact token values are tabulated in `data/ezber-design-review/report.md`. Use those tokens instead of raw colours, fonts or radii. The kit's `accent` (honey) is reserved for the active-verse cue, never actions, progress or tint. The Android scaffold mirrors the same tokens in `android/app/src/main/java/app/ezber/android/ui/Theme.kt` (system faces for now; bundling the OFL fonts is a follow-up).
- The kit's OFL fonts (Plus Jakarta Sans, Source Serif 4) ship in `ios/Ezber/Resources/Fonts/` with their licence texts and are registered at runtime by `EzberFont`; there is deliberately no Info.plist `UIAppFonts` entry.

## Commands

- `make test` — offline suite (synthetic 114-surah corpus, a synthetic quran-align archive with deliberate defects, and a fake fetcher); the determinism test asserts byte-identical rebuilds. Gate for every content or pipeline change.
- `make pipeline` — real network build (~20s warm cache, ~50 MB SQLite); `make verify` re-checks the SQLite bundle against the manifest.
- `make web` — build then export the compact web/PWA bundle under `content-pipeline/build/web/`; `python3 -m ezber_pipeline export-web` re-exports an existing build without the network. Format and file inventory are documented in `content-pipeline/README.md`.
- Rebuilds verify `content-pipeline/config/source-lock.json`; upstream changes fail the build until `python3 -m ezber_pipeline build --update-lock` is run deliberately.
- Android build: `cd android && ./gradlew :app:assembleDebug` (JDK 17+, Android SDK platform 36, build-tools 36.0.0). `:app:assembleRelease` and `:app:installDebug` behave as usual; there is no Android test target yet.
- `cd web && npm test` — offline unit suite (Node test runner plus a fake IndexedDB) covering bundle normalisation and import, the drill engine, the repositories and the queue maths. `npm run typecheck` and `npm run build` (static export to `web/out/`) are the other gates; `npm run content:link` copies `content-pipeline/build/web/` into `web/public/content/` for integration runs.
- There is no iOS test target; verify with Xcode previews and a macOS `xcodebuild` build. Linux worktrees have no Swift or Xcode toolchain, so a syntax parse is the strongest local gate.

## Non-negotiables

- Quran text is Tanzil 1.1, verbatim and unmodified; the pipeline compares the upstream copyright notice against `licenses/notices/` and fails on drift.
- The Tanzil transliteration is used under a written grant held by the captain; only the page's presentation markup is stripped, and the provenance header is re-verified against `licenses/notices/tanzil-transliteration-en.transliteration.txt`.
- The bundle is offline and redistributable only: no Quran Foundation content, no Content API, OAuth or token broker, and no English translation. Do not add fawazahmed or ummahapi.
- quran-align timings are limited to the recitations the package supports; the As-Sudais asset is a crash log and stays excluded with its hash recorded. Repairs must stay deterministic and counted in the manifest.
- Reciters are enabled only after Quran Foundation confirms the source in writing; disabled candidates and the off Islamic Network fallback stay documented in the audio manifest. QuranicAudio is deny-listed in `content-pipeline/config/sources.json`.
- Generated manifests, credits and JSON digests must stay deterministic — the test suite builds twice and compares bytes.
- The web/PWA bundle (`content-pipeline/ezber_pipeline/webexport.py`) is a read-only projection of the same canonical artifacts; it must not change the SQLite bundle contract, and every export carries the licence registry, attribution strings and the Tanzil notice.
- `ios/Ezber.xcodeproj` uses an Xcode file-system-synchronized group: files added under `ios/Ezber/` are compiled automatically and the project file does not need edits.
- iOS persistence keeps content and user data in separate SQLite stores (`content.sqlite`, `user.sqlite`). The DDL lives only in `ios/Ezber/Persistence/Schema.swift` and is provisional until the canonical shared schema lands under `schema/`; replace it there rather than forking.
- Android persistence copies the canonical user DDL into `android/app/src/main/java/app/ezber/android/persistence/UserSchema.kt` and creates `ezber-user.sqlite` from it. When `schema/` changes, update that file and `UserSchema.VERSION` with a row-preserving migration; the content DB is read-only in the app, which falls back to placeholder content when the database is absent or incompatible. The Android audio interfaces (`AudioPlayer`, `AudioSessionService`) are Media3-shaped but do not depend on Media3 yet.
- Playback is AVFoundation-backed on iOS: `LiveAudioSessionService` runs the audio session (background audio, Now Playing, lock-screen commands, interruptions, route changes; `UIBackgroundModes: audio` lives in `ios/Ezber.xcodeproj/project.pbxproj`) and `AVDrillSessionService` walks the verse × repetition `DrillQueue`. `PlaceholderDrillAudioResolver` supplies bundled or generated placeholder audio until the content pipeline ships rights-cleared recitations; a content-backed `DrillAudioResolving` replaces only that resolver. The scaffold's `AudioSessionService` and `DrillSessionService` protocol shapes stay stable and new capabilities are additive.
- The web app keeps content and user data in separate IndexedDB databases (`ezber-content`, `ezber-user`) mirroring the two SQLite schemas table-for-table; `web/README.md` lists the two documented deviations (`presets.section_repeats`, a `ratings` store). Content is read-only. Content loads from the pipeline's `/content/` web bundle; placeholder content stands in until it lands.
- The web app is installable and offline: `web/public/manifest.webmanifest` and `web/public/sw.js` cache the shell and downloaded audio, and the Media Session API drives lock-screen metadata and controls. CarPlay is deliberately out of scope for the web MVP.
- Web fonts are self-hosted from `web/fonts/` (copied from the cleared iOS resources, with OFL texts in `web/public/licenses/`), so the build never depends on a font CDN.
- Screens render from placeholder content in each app (`ios/Ezber/Placeholder/PlaceholderContent.swift`, `android/app/src/main/java/app/ezber/android/placeholder/PlaceholderContent.kt`) until the content pipeline produces the bundle.
- Open captain calls stay isolated behind `TODO(open-call: ...)` markers: in-car text policy and tab-shell shape. Launch language resolved English-first (2026-09-25); the web app follows it with `web/lib/i18n.ts`.
- CI is `.github/workflows/ci.yml`: PRs to `main` and pushes to `main` run four jobs (`content`, `android`, `ios`, `web`), each a no-op until its directory exists, so landing a platform activates its job automatically. Action versions are pinned by commit SHA.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
