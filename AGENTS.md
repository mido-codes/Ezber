# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- `README.md` is the product brief; it is the source of truth for scope and behavior.
- The ported design system lives in `ios/Ezber/DesignSystem/`: `EzberTheme.swift` is the single source of truth for colour, type, spacing, radius and shadow tokens, and the component files next to it mirror the kit at `data/ezber-design-system` (firstmate workspace). Exact token values are tabulated in `data/ezber-design-review/report.md` §2–5; use those tokens instead of raw colours, fonts or radii. The kit's `accent` (honey) is reserved for the active-verse cue, never actions, progress or tint.
- The kit's OFL fonts (Plus Jakarta Sans, Source Serif 4) ship in `ios/Ezber/Resources/Fonts/` with their licence texts and are registered at runtime by `EzberFont`; there is deliberately no Info.plist `UIAppFonts` entry.
- Open captain calls stay isolated behind `TODO(open-call: ...)` markers: in-car text policy and tab-shell shape. Launch language resolved English-first (2026-09-25) and the app default now follows it.
- There is no iOS test target; verify with the Xcode previews and a macOS `xcodebuild` build. Linux worktrees have no Swift/Xcode toolchain, so a tree-sitter syntax parse is the strongest local gate.
- The iOS app lives in `ios/` (SwiftUI, iOS 17+, Xcode 16+). Build on macOS: `open ios/Ezber.xcodeproj` or `xcodebuild -project ios/Ezber.xcodeproj -scheme Ezber -destination 'platform=iOS Simulator,name=iPhone 16' build`. Linux worktrees have no Swift/Xcode toolchain, so iOS builds cannot be verified there.
- `ios/Ezber.xcodeproj` uses an Xcode file-system-synchronized group: files added under `ios/Ezber/` are compiled automatically and the project file does not need edits.
- iOS persistence keeps content and user data in separate SQLite stores (`content.sqlite`, `user.sqlite`). The DDL lives only in `ios/Ezber/Persistence/Schema.swift` and is provisional until the canonical shared schema lands under `schema/`; replace it there rather than forking.
- Playback is interface-first: `DrillSessionService` expresses a drill as a verse × repetition `DrillQueue`, and `AudioSessionService` is a protocol with a stub. Views must keep working when the stubs are replaced.
- Screens render from `ios/Ezber/Placeholder/PlaceholderContent.swift` until the content pipeline produces `content.sqlite`.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
