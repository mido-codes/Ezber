import Foundation

/// Mutable editing state for the preset builder. Converted to a `Preset` on
/// save so the model stays immutable-ish at the store boundary.
struct PresetDraft: Equatable {
    var name = ""
    var surahID = 1
    var range = VerseRange(start: 1, end: 5)
    var defaultRepeats = 5
    var overrides: [Int: Int] = [:]
    var reciterID = ""
    var showTransliteration = true
    var showArabic = false
    var translationMode: TranslationMode = .tapToReveal
    var transliterationStyle: TransliterationStyle = .standard
    var pauseBetweenRepeats: Double = 0.5
    var loopUntilStopped = false

    var repeats: RepeatPlan {
        get { RepeatPlan(defaultRepeats: defaultRepeats, overrides: overrides) }
        set {
            defaultRepeats = newValue.defaultRepeats
            overrides = newValue.overrides
        }
    }

    var verseNumbers: [Int] {
        guard range.end >= range.start else { return [] }
        return Array(range.start...range.end)
    }

    func defaultName(for surah: Surah) -> String {
        "\(surah.nameLatin) \(range.displayString)"
    }

    func makePreset(existing: Preset?, surah: Surah) -> Preset {
        let now = Date()
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        return Preset(
            id: existing?.id ?? UUID(),
            name: trimmedName.isEmpty ? defaultName(for: surah) : trimmedName,
            surahID: surahID,
            range: range,
            repeats: repeats,
            reciterID: reciterID,
            display: DisplayOptions(
                showTransliteration: showTransliteration,
                showArabic: showArabic,
                translationMode: translationMode,
                transliterationStyle: transliterationStyle,
                pauseBetweenRepeats: pauseBetweenRepeats,
                loopUntilStopped: loopUntilStopped
            ),
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
            lastStudiedAt: existing?.lastStudiedAt
        )
    }

    static func from(preset: Preset) -> PresetDraft {
        PresetDraft(
            name: preset.name,
            surahID: preset.surahID,
            range: preset.range,
            defaultRepeats: preset.repeats.defaultRepeats,
            overrides: preset.repeats.overrides,
            reciterID: preset.reciterID,
            showTransliteration: preset.display.showTransliteration,
            showArabic: preset.display.showArabic,
            translationMode: preset.display.translationMode,
            transliterationStyle: preset.display.transliterationStyle,
            pauseBetweenRepeats: preset.display.pauseBetweenRepeats,
            loopUntilStopped: preset.display.loopUntilStopped
        )
    }

    static func new(
        surahID: Int?,
        range: VerseRange?,
        settings: AppSettings,
        reciters: [Reciter]
    ) -> PresetDraft {
        let resolvedSurahID = surahID ?? 1
        var draft = PresetDraft()
        draft.surahID = resolvedSurahID
        draft.range = range ?? VerseRange(start: 1, end: 5)
        draft.defaultRepeats = 5
        draft.reciterID = settings.defaultReciterID.isEmpty
            ? (reciters.first?.id ?? "")
            : settings.defaultReciterID
        draft.showArabic = settings.defaultShowArabic
        draft.translationMode = settings.defaultTranslationMode
        draft.transliterationStyle = settings.defaultTransliterationStyle
        draft.pauseBetweenRepeats = settings.defaultPauseBetweenRepeats
        draft.loopUntilStopped = settings.defaultLoopUntilStopped
        return draft
    }
}

/// Routes into the preset builder: a fresh draft (optionally pre-filled from the
/// surah picker) or an existing preset being edited.
enum PresetBuilderRoute: Hashable {
    case new(surahID: Int?, range: VerseRange?)
    case edit(UUID)
}
