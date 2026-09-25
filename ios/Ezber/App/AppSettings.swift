import SwiftUI

/// User preferences, persisted to UserDefaults. English-first: a device whose
/// language is English gets English, any other language falls back to English
/// until the learner picks Turkish. (Launch-language call resolved 2026-09-25;
/// see the design-port report §8.)
///
/// Properties are plain stored values so Observation tracks them. Persistence
/// happens through `persist()`, which the settings screen calls when its
/// `persistenceToken` changes.
@Observable
final class AppSettings {

    enum Language: String, CaseIterable, Identifiable {
        case turkish = "tr"
        case english = "en"

        var id: String { rawValue }

        var label: String {
            switch self {
            case .turkish: return "Türkçe"
            case .english: return "English"
            }
        }

        var localeIdentifier: String { rawValue }
    }

    enum ThemeMode: String, CaseIterable, Identifiable {
        case system
        case light
        case dark

        var id: String { rawValue }

        var label: String {
            switch self {
            case .system: return "System"
            case .light: return "Light"
            case .dark: return "Dark"
            }
        }

        var colorScheme: ColorScheme? {
            switch self {
            case .system: return nil
            case .light: return .light
            case .dark: return .dark
            }
        }
    }

    enum NavigationBehavior: String, CaseIterable, Identifiable {
        case duck
        case pause
        case keepPlaying

        var id: String { rawValue }

        var label: String {
            switch self {
            case .duck: return "Duck under prompts"
            case .pause: return "Pause for prompts"
            case .keepPlaying: return "Keep playing"
            }
        }
    }

    enum CallBehavior: String, CaseIterable, Identifiable {
        case pauseAndResume
        case pauseOnly
        case keepPlaying

        var id: String { rawValue }

        var label: String {
            switch self {
            case .pauseAndResume: return "Pause, then resume"
            case .pauseOnly: return "Pause, wait for me"
            case .keepPlaying: return "Keep playing"
            }
        }
    }

    var language: Language = .english
    var themeMode: ThemeMode = .system
    var defaultReciterID: String = ""
    var defaultShowArabic = false
    var defaultTransliterationStyle: TransliterationStyle = .standard
    var defaultTranslationMode: TranslationMode = .tapToReveal
    var defaultPauseBetweenRepeats: Double = 0.5
    var defaultLoopUntilStopped = false
    var navigationBehavior: NavigationBehavior = .duck
    var callBehavior: CallBehavior = .pauseAndResume

    private let defaults: UserDefaults

    private enum Key {
        static let language = "settings.language"
        static let themeMode = "settings.themeMode"
        static let defaultReciterID = "settings.defaultReciterID"
        static let defaultShowArabic = "settings.defaultShowArabic"
        static let defaultTransliterationStyle = "settings.defaultTransliterationStyle"
        static let defaultTranslationMode = "settings.defaultTranslationMode"
        static let defaultPauseBetweenRepeats = "settings.defaultPauseBetweenRepeats"
        static let defaultLoopUntilStopped = "settings.defaultLoopUntilStopped"
        static let navigationBehavior = "settings.navigationBehavior"
        static let callBehavior = "settings.callBehavior"
    }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults

        let deviceLanguage = Locale.current.language.languageCode?.identifier ?? "en"
        self.language = Language(rawValue: defaults.string(forKey: Key.language) ?? "")
            ?? Language(rawValue: deviceLanguage)
            ?? .english
        self.themeMode = ThemeMode(rawValue: defaults.string(forKey: Key.themeMode) ?? "") ?? .system
        self.defaultReciterID = defaults.string(forKey: Key.defaultReciterID)
            ?? PlaceholderContent.reciters.first?.id
            ?? ""
        self.defaultShowArabic = defaults.bool(forKey: Key.defaultShowArabic)
        self.defaultTransliterationStyle = TransliterationStyle(
            rawValue: defaults.string(forKey: Key.defaultTransliterationStyle) ?? ""
        ) ?? .standard
        self.defaultTranslationMode = TranslationMode(
            rawValue: defaults.string(forKey: Key.defaultTranslationMode) ?? ""
        ) ?? .tapToReveal
        let storedPause = defaults.object(forKey: Key.defaultPauseBetweenRepeats) as? Double
        self.defaultPauseBetweenRepeats = storedPause ?? 0.5
        self.defaultLoopUntilStopped = defaults.bool(forKey: Key.defaultLoopUntilStopped)
        self.navigationBehavior = NavigationBehavior(
            rawValue: defaults.string(forKey: Key.navigationBehavior) ?? ""
        ) ?? .duck
        self.callBehavior = CallBehavior(
            rawValue: defaults.string(forKey: Key.callBehavior) ?? ""
        ) ?? .pauseAndResume
    }

    /// A value that changes whenever any persisted setting changes. Observe it
    /// to save exactly once per change without property observers.
    var persistenceToken: String {
        [
            language.rawValue,
            themeMode.rawValue,
            defaultReciterID,
            String(defaultShowArabic),
            defaultTransliterationStyle.rawValue,
            defaultTranslationMode.rawValue,
            String(defaultPauseBetweenRepeats),
            String(defaultLoopUntilStopped),
            navigationBehavior.rawValue,
            callBehavior.rawValue
        ].joined(separator: "|")
    }

    func persist() {
        defaults.set(language.rawValue, forKey: Key.language)
        defaults.set(themeMode.rawValue, forKey: Key.themeMode)
        defaults.set(defaultReciterID, forKey: Key.defaultReciterID)
        defaults.set(defaultShowArabic, forKey: Key.defaultShowArabic)
        defaults.set(defaultTransliterationStyle.rawValue, forKey: Key.defaultTransliterationStyle)
        defaults.set(defaultTranslationMode.rawValue, forKey: Key.defaultTranslationMode)
        defaults.set(defaultPauseBetweenRepeats, forKey: Key.defaultPauseBetweenRepeats)
        defaults.set(defaultLoopUntilStopped, forKey: Key.defaultLoopUntilStopped)
        defaults.set(navigationBehavior.rawValue, forKey: Key.navigationBehavior)
        defaults.set(callBehavior.rawValue, forKey: Key.callBehavior)
    }
}
