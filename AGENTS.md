# Project agent memory

Ezber is a Quran memorization and listening app for iPhone and Android. The repository holds the content foundation — a reproducible content pipeline and the shared schema — together with the native iOS app.

## Orientation

- `README.md` is the product brief; it is the source of truth for scope and behavior.
- `content-pipeline/README.md` — pipeline architecture, commands, how to add a reciter or translation, cache and lock semantics.
- `schema/README.md` and `docs/shared-schema.md` — content DB vs user DB, conventions, example joins. Content and user data live in separate SQLite files on purpose.
- `docs/licensing.md` — per-asset obligations and residual rights risks; the Tanzil transliteration grant is recorded here.
- `docs/captain-decisions.md` — product/legal calls that belong to the captain. Record new ones there; do not decide them in code.
- `content-pipeline/build/` — generated artifacts. Manifests, credits and notices are tracked so reviews can read them; `*.sqlite` and `build-report.json` are gitignored.
- The iOS app lives in `ios/` (SwiftUI, iOS 17+, Xcode 16+). Build on macOS with `open ios/Ezber.xcodeproj` or `xcodebuild -project ios/Ezber.xcodeproj -scheme Ezber -destination 'platform=iOS Simulator,name=iPhone 16' build`.
- The ported design system lives in `ios/Ezber/DesignSystem/`: `EzberTheme.swift` is the single source of truth for colour, type, spacing, radius and shadow tokens, and the component files next to it mirror the kit at `data/ezber-design-system` (firstmate workspace). Exact token values are tabulated in `data/ezber-design-review/report.md`. Use those tokens instead of raw colours, fonts or radii. The kit's `accent` (honey) is reserved for the active-verse cue, never actions, progress or tint.
- The kit's OFL fonts (Plus Jakarta Sans, Source Serif 4) ship in `ios/Ezber/Resources/Fonts/` with their licence texts and are registered at runtime by `EzberFont`; there is deliberately no Info.plist `UIAppFonts` entry.

## Commands

- `make test` — offline content suite (synthetic 114-surah corpus plus a fake fetcher); the determinism test asserts byte-identical rebuilds. This is the gate for every content or pipeline change.
- `make pipeline` — real network build; `make verify` then re-checks the SQLite bundle against the manifest.
- Rebuilds verify `content-pipeline/config/source-lock.json`; upstream changes fail the build until `python3 -m ezber_pipeline build --update-lock` is run deliberately.
- There is no iOS test target; verify with Xcode previews and a macOS `xcodebuild` build. Linux worktrees have no Swift or Xcode toolchain, so a syntax parse is the strongest local gate.

## Non-negotiables

- Quran text is Tanzil 1.1, verbatim and unmodified; the pipeline compares the upstream copyright notice against `licenses/notices/` and fails on drift.
- No secret in the repository: QF credentials only from `QF_CLIENT_ID` and `QF_CLIENT_SECRET` at runtime; the token endpoint is server-only.
- No QuranicAudio-backed recordings (deny-list in `content-pipeline/config/sources.json`); audio requires machine-checked explicit distribution permission on the item itself.
- Generated manifests, credits and JSON digests must stay deterministic — the test suite builds twice and compares bytes.
- `ios/Ezber.xcodeproj` uses an Xcode file-system-synchronized group: files added under `ios/Ezber/` are compiled automatically and the project file does not need edits.
- iOS persistence keeps content and user data in separate SQLite stores (`content.sqlite`, `user.sqlite`). The DDL lives in `ios/Ezber/Persistence/Schema.swift` and is provisional until the canonical shared schema lands under `schema/`; replace it there rather than forking.
- Playback is interface-first: `DrillSessionService` expresses a drill as a verse × repetition `DrillQueue`, and `AudioSessionService` is a protocol with a stub. Views must keep working when the stubs are replaced.
- Screens render from `ios/Ezber/Placeholder/PlaceholderContent.swift` until the content pipeline produces `content.sqlite`.
- Open captain calls stay isolated behind `TODO(open-call: ...)` markers: in-car text policy and tab-shell shape. Launch language resolved English-first (2026-09-25).

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
