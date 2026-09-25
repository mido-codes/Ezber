# Ezber

Ezber (Turkish for "memorization") is a Quran memorization and listening app for iPhone and Android. It is built for learners who memorize in short sections and repeat each verse, and who read Roman transliteration rather than the Arabic script.

## The learner this is for

A person memorizing Surah Ar-Rahman in sections. They drill verses 1–5, repeating each verse five times before moving on. They cannot read the Arabic alphabet, so they keep the transliteration in front of them while a reciter plays. They choose a reciter whose pronunciation suits the passage. They save the whole setup as a preset and reload it later, and they listen in the car on the way to work with navigation on the main display.

## The core loop

1. Choose a surah and a verse range (for example 55:1–5).
2. Set how many times each verse repeats (for example 5), and pick a reciter.
3. Start the drill; the verse or its transliteration stays on screen while it plays.
4. Save the setup as a named preset for next time.
5. Drive to work with it playing in the background and navigation on the main display.
6. Come back to see progress and verse-level notes.

## Screens to design

### 1. Onboarding / first run
Short and skippable. Introduce the drill, offer transliteration as the default reading surface, and set a starter language (English-first, Turkish available). No account required, and no permission requests beyond audio.

### 2. Home / Continue
The most important screen. Shows the last-used preset with a large Continue control, the current verse and where it sits in the section, a quick entry to start a new drill, and a compact progress glance. It should be usable one-handed and glanceable in the car.

### 3. Surah and section picker
Browse the 114 surahs, then choose a verse range for the drill. Show each surah's name in Arabic, Latin and English, its verse count, and a clear from/to range selector. The default range is a short section.

### 4. Preset builder
Define a drill and save it: surah and range; a per-verse repeat count for the section with optional per-verse overrides; reciter; transliteration on/off; Arabic script on/off; translation set to tap-to-reveal, always shown, or hidden during playback; pause between repeats; and a loop-until-stopped option. Name the preset and save it.

### 5. Preset library
A list of saved presets, each showing its key facts (surah, section, repeats, reciter) with one-tap play. Rename, duplicate, edit and delete.

### 6. Study player
The heart of the app while a drill runs. Shows the current verse in transliteration (Arabic optional), highlights the active verse, shows a repeat counter such as "repeat 3 of 5", and offers simple transport: play/pause, previous/next verse, previous/next repeat. The resume point is saved at every repeat boundary.

### 7. Reciter picker
A list of available reciters with name, style and a short sample. Reciters can be chosen per surah.

### 8. In-car / driving view
For CarPlay and Android Auto: minimal and glanceable, showing the current verse number and its transliteration line, large play/pause and next/previous controls, and the preset list. It keeps playing with navigation on the main display, ducks under navigation prompts, pauses for calls, and offers a one-tap Continue when reconnecting.

### 9. Lock screen / Now Playing
Verse and preset metadata and artwork with controls that map next/previous to next/previous verse.

### 10. Progress overview
What has been drilled: per-surah and per-section exposure counts, per-verse states (new, learning, review, strong), and a gentle "what to drill next". It shows honest exposure rather than guilt-driven streaks.

### 11. Verse progress detail
A per-verse view of repetitions completed, when it was last played, and its current state.

### 12. Notes
Verse-level notes, searchable, plus a one-tap voice memo captured while driving and transcribed later.

### 13. Settings
Display (transliteration style, Arabic on/off, translation reveal), audio (default reciter, navigation and call behaviour, loop behaviour), language, and download and storage management.

### 14. Credits and licenses
The text, transliteration, translation and reciter attributions, with their license information.

## Behaviour the screens must express

- **Verse-by-verse repetition.** A drill is a queue of verse × repetition items; the UI must always show where the listener is in that queue and how to resume.
- **Transliteration first.** It is the primary reading surface for this learner; Arabic script is optional and secondary.
- **Calm and quiet.** No gamified pressure, no streak guilt, no celebratory animation. Progress is information, not a score.
- **Car-safe.** Large touch targets, minimal text, nothing animated or scrolling while driving.
- **Offline by default.** Everything works without a connection; downloaded and not-downloaded state must be obvious.

## Look and feel

A restrained, quiet aesthetic suited to focused memorization: generous spacing, a humanist or serif typeface for the transliteration, a warm neutral palette, and a strong dark theme for night and car use. The app name is Turkish; the interface is English-first with Turkish available. Support Dynamic Type and high contrast.

## Platforms and constraints

iPhone first (Swift, SwiftUI), then Android (Kotlin, Jetpack Compose). Native background audio, lock-screen controls, CarPlay and Android Auto. No account. Presets, progress and notes are stored locally, with export as the escape hatch.

## Design scope for this round

The main screens — home/continue, the study player, the preset builder, the preset library, and the in-car view — as high-fidelity iPhone mockups, including the key states (empty, in progress, completed) in both light and dark themes.
