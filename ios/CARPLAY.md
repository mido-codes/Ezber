# CarPlay audio app

This document is the captain's guide to the CarPlay slice: what it does, how
the entitlement is wired, and what to expect before and after Apple approves
the CarPlay Audio entitlement.

## What is implemented

The car surface is built on top of the existing scaffold services and does not
change them (`AudioSessionService` and `DrillSessionService` are untouched; the
player work can land in parallel).

| File | Responsibility |
| --- | --- |
| `Ezber/CarPlay/CarPlaySceneDelegate.swift` | CarPlay scene entry point; builds the coordinator when a head unit connects |
| `Ezber/CarPlay/CarPlayCoordinator.swift` | Preset list template, drill start/resume, now-playing buttons, media remote commands, session persistence |
| `Ezber/CarPlay/CarPlayNowPlayingBuilder.swift` | Turns the current drill item + preset display options into now-playing metadata |
| `Ezber/CarPlay/CarPlayNowPlayingCenter.swift` | Publishes metadata to `AudioSessionService` and mirrors it into `MPNowPlayingInfoCenter` |
| `Ezber/CarPlay/CarPlayRuntime.swift` | Registry that hands the CarPlay scene the same `AppEnvironment` as the phone scene |
| `Ezber/Ezber.entitlements` | `com.apple.developer.carplay-audio` |
| `Info.plist` (at `ios/Info.plist`) | CarPlay scene manifest; intentionally outside the synchronized `Ezber/` group so it is never treated as a bundled resource |

The root template is a `CPListTemplate` of presets — a "Continue" section for
the last-used preset (with its saved resume point) and a "Presets" section for
the rest. Tapping a preset builds the queue from the content store, resumes the
saved session, starts playback and pushes `CPNowPlayingTemplate.shared`.

### The lyrics-style verse surface

CarPlay audio apps cannot host arbitrary custom views, so the supported verse
surface is the system now-playing template. The coordinator publishes the
current item to `MPNowPlayingInfoCenter`, and those lines update as the queue
advances — like a lyrics display, one verse at a time:

- **title**: transliteration when the preset shows it, otherwise Arabic when
  Arabic is on, otherwise the surah/verse reference
- **artist**: Arabic when both transliteration and Arabic are on, otherwise the
  surah name and verse reference
- **album**: preset name and `repeat n of m`
- **queue index/count** and playback rate: the verse × repetition position

The mapping is entirely driven by `Preset.display` (`showTransliteration`,
`showArabic`), so turning either surface off in the preset builder changes the
car immediately. `CarPlayNowPlayingBuilder` is the single place that encodes
this and is easy to unit-test when a test target lands.

### Controls

The now-playing template carries four custom buttons (the CarPlay maximum):

| Button | Drill action |
| --- | --- |
| `backward.end.fill` | previous verse |
| `backward.fill` | previous repeat |
| `forward.fill` | next repeat |
| `forward.end.fill` | next verse |

Play/pause is the system control. The lock-screen and hardware equivalents are
wired through `MPRemoteCommandCenter`: play, pause, toggle, next/previous track
→ next/previous verse, skip forward/back → next/previous repeat.

### Glanceability

- No animations, no timers that redraw: the surface only changes when the verse,
  repeat or playback state actually changes (publishing is change-gated).
- A one-second safety tick exists for the case where the phone's study player
  owns the `DrillSessionService` delegate; it drops identical state and does no
  work otherwise.
- Session progress and resume points are persisted at repeat boundaries through
  the same `UserDataStore`, so a drill started in the car appears in "Continue"
  on the phone.

## Entitlement wiring

`com.apple.developer.carplay-audio` is a managed entitlement: Apple must grant
it to the App ID before a device build can be signed with it.

1. Request CarPlay Audio from Apple at
   <https://developer.apple.com/contact/carplay/> (Audio app category). Approval
   is manual and typically tied to the app's audio use case.
2. Once approved, enable the CarPlay Audio capability for the `app.ezber.Ezber`
   App ID in the Apple Developer portal and regenerate the provisioning
   profile.
3. In Xcode, target **Ezber** → **Signing & Capabilities** should show CarPlay
   Audio for the team; `CODE_SIGN_ENTITLEMENTS = Ezber/Ezber.entitlements`
   is already set for Debug and Release. The entitlements file is the only
   source of the entitlement.

Until approval:

- Simulator builds run unchanged (the simulator does not validate the
  provisioning profile). CarPlay Simulator will list the app because the scene
  is declared.
- Device builds with automatic signing will fail with a provisioning error for
  the missing entitlement; that is the expected gate, not a code problem.

## Testing in the simulator

1. Run the app in an iPhone simulator (`xcodebuild -project ios/Ezber.xcodeproj
   -scheme Ezber -destination 'platform=iOS Simulator,name=iPhone 16' build`).
2. In **Simulator**, open **I/O → External Displays → CarPlay**.
3. Ezber appears in CarPlay's app list (it declares the CarPlay scene). Tap a
   preset: playback starts (stub timer) and the now-playing screen shows the
   current verse line, updating as the queue advances.
4. Use the transport buttons to confirm next/previous verse and repeat, and
   toggle transliteration/Arabic on a preset in the phone app to see the
   metadata change.

## Known limits

- Audio is still the scaffold's `StubDrillSessionService`; the car sheet is
  clickable end to end but silent. When the real playback engine lands, it
  should publish the same `NowPlayingInfo` itself; the mirror in
  `CarPlayNowPlayingCenter` is then redundant for the lock screen but harmless
  (identical, change-gated values).
- `DrillSessionService` has a single delegate. The coordinator takes it only if
  no other surface owns it, and re-reads `state` on its safety tick otherwise.
  A future engine with multiple observers removes the need for the tick.
- Preset artwork is not rendered yet (`artworkName` is nil); it should come from
  the preset/content pipeline rather than hand-drawn placeholders.
- `EzberApp.init()` registers the environment for CarPlay. That is the only
  existing Swift file the CarPlay slice touches besides project wiring.
