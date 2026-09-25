import Foundation

/// Per-preset display and playback preferences.
struct DisplayOptions: Hashable, Codable {
    var showTransliteration: Bool
    var showArabic: Bool
    var translationMode: TranslationMode
    var transliterationStyle: TransliterationStyle
    var pauseBetweenRepeats: TimeInterval
    var loopUntilStopped: Bool

    init(
        showTransliteration: Bool = true,
        showArabic: Bool = false,
        translationMode: TranslationMode = .tapToReveal,
        transliterationStyle: TransliterationStyle = .standard,
        pauseBetweenRepeats: TimeInterval = 0.5,
        loopUntilStopped: Bool = false
    ) {
        self.showTransliteration = showTransliteration
        self.showArabic = showArabic
        self.translationMode = translationMode
        self.transliterationStyle = transliterationStyle
        self.pauseBetweenRepeats = pauseBetweenRepeats
        self.loopUntilStopped = loopUntilStopped
    }
}

enum TranslationMode: String, Codable, CaseIterable, Identifiable {
    case tapToReveal
    case alwaysShown
    case hiddenDuringPlayback

    var id: String { rawValue }

    var label: String {
        switch self {
        case .tapToReveal: return "Tap to reveal"
        case .alwaysShown: return "Always shown"
        case .hiddenDuringPlayback: return "Hidden during playback"
        }
    }
}

enum TransliterationStyle: String, Codable, CaseIterable, Identifiable {
    case standard
    case simplified

    var id: String { rawValue }

    var label: String {
        switch self {
        case .standard: return "Standard"
        case .simplified: return "Simplified"
        }
    }
}
