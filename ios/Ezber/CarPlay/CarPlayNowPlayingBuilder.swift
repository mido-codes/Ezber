import Foundation

/// Builds the now-playing metadata for the current drill item.
///
/// CarPlay audio apps cannot host arbitrary views on the now-playing screen:
/// the system renders the metadata the app publishes to `MPNowPlayingInfoCenter`
/// and `AudioSessionService`. This builder turns a queue item into that
/// metadata and is the one place that decides what the car shows, so the
/// preset's display options (Arabic on/off, transliteration shown/hidden) are
/// honoured by construction:
///
/// - transliteration shown + Arabic shown: transliteration is the primary line,
///   Arabic the secondary line
/// - transliteration only: transliteration is the primary line, the surah and
///   verse reference the secondary line
/// - Arabic only: Arabic is the primary line, the surah and verse reference the
///   secondary line
/// - neither: the verse reference is the primary line and the preset name the
///   secondary line
enum CarPlayNowPlayingBuilder {
    static func makeNowPlayingInfo(
        preset: Preset,
        surah: Surah,
        state: DrillSessionState
    ) -> NowPlayingInfo? {
        guard let item = state.currentItem else { return nil }

        let verse = item.verse
        let display = preset.display
        let transliteration = display.showTransliteration
            ? verse.transliteration.trimmingCharacters(in: .whitespacesAndNewlines)
            : ""
        let arabic = display.showArabic
            ? verse.arabic.trimmingCharacters(in: .whitespacesAndNewlines)
            : ""
        let reference = "\(surah.nameLatin) \(verse.reference)"

        let title: String
        let subtitle: String
        if !transliteration.isEmpty {
            title = transliteration
            subtitle = arabic.isEmpty ? reference : arabic
        } else if !arabic.isEmpty {
            title = arabic
            subtitle = reference
        } else {
            title = reference
            subtitle = preset.name
        }

        return NowPlayingInfo(
            title: title,
            subtitle: subtitle,
            albumTitle: "\(preset.name) · repeat \(item.repeatIndex) of \(item.repeatCount)",
            artworkName: nil,
            elapsed: 0,
            duration: 0,
            playbackRate: state.status == .playing ? 1 : 0,
            queuePosition: state.currentIndex + 1,
            queueCount: max(1, state.totalItemCount)
        )
    }
}
