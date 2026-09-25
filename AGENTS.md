# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- `README.md` is the product brief; it is the source of truth for scope and behavior.
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
