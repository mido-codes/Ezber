import Foundation

/// Builds the now-playing presentation context for the current drill item.
///
/// The AVFoundation engine (`AVDrillSessionService`) owns
/// `MPNowPlayingInfoCenter` and republishes its metadata from this description
/// while a drill plays. CarPlay must not publish metadata itself — the engine
/// would overwrite it within a second — so the preset's display options are
/// mapped onto the engine's description instead:
///
/// - `surahName` is the title prefix and the engine appends the verse
///   reference, so the primary line becomes
///   `"<transliteration|Arabic> 55:3"`
/// - `reciterName` is the artist line: Arabic when both reading surfaces are
///   on, otherwise the reciter name
/// - `presetName` is the album line, with the repeat counter
///
/// `DrillNowPlayingDescription` is the only metadata channel CarPlay has; if
/// the engine ever grows a dedicated verse-line field, switch this mapping to
/// it.
enum CarPlayNowPlayingBuilder {
    static func makeDescription(
        preset: Preset,
        surah: Surah,
        reciterName: String,
        state: DrillSessionState
    ) -> DrillNowPlayingDescription? {
        guard let item = state.currentItem else { return nil }

        let verse = item.verse
        let display = preset.display
        let transliteration = display.showTransliteration
            ? verse.transliteration.trimmingCharacters(in: .whitespacesAndNewlines)
            : ""
        let arabic = display.showArabic
            ? verse.arabic.trimmingCharacters(in: .whitespacesAndNewlines)
            : ""

        let primaryLine: String
        if !transliteration.isEmpty {
            primaryLine = transliteration
        } else if !arabic.isEmpty {
            primaryLine = arabic
        } else {
            primaryLine = surah.nameLatin
        }

        let artistLine = (!arabic.isEmpty && arabic != primaryLine) ? arabic : reciterName
        let albumLine = "\(preset.name) · repeat \(item.repeatIndex) of \(item.repeatCount)"

        return DrillNowPlayingDescription(
            presetName: albumLine,
            surahName: primaryLine,
            reciterName: artistLine
        )
    }
}
