import Foundation

/// A saved drill definition: surah and section, per-verse repeats, reciter and
/// display options.
struct Preset: Identifiable, Hashable, Codable {
    var id: UUID
    var name: String
    var surahID: Int
    var range: VerseRange
    var repeats: RepeatPlan
    var reciterID: String
    var display: DisplayOptions
    var createdAt: Date
    var updatedAt: Date
    var lastStudiedAt: Date?

    init(
        id: UUID = UUID(),
        name: String,
        surahID: Int,
        range: VerseRange,
        repeats: RepeatPlan = RepeatPlan(),
        reciterID: String,
        display: DisplayOptions = DisplayOptions(),
        createdAt: Date = Date(),
        updatedAt: Date = Date(),
        lastStudiedAt: Date? = nil
    ) {
        self.id = id
        self.name = name
        self.surahID = surahID
        self.range = range
        self.repeats = repeats
        self.reciterID = reciterID
        self.display = display
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.lastStudiedAt = lastStudiedAt
    }

    var repeatSummary: String {
        if repeats.overrides.isEmpty {
            return "\(repeats.defaultRepeats)× each"
        }
        return "\(repeats.defaultRepeats)× each · \(repeats.overrides.count) override\(repeats.overrides.count == 1 ? "" : "s")"
    }

    var totalRepetitions: Int {
        repeats.totalRepetitions(in: range)
    }
}

/// How many times each verse repeats. `overrides` holds per-verse exceptions to
/// `defaultRepeats`.
struct RepeatPlan: Hashable, Codable {
    var defaultRepeats: Int
    var overrides: [Int: Int]

    init(defaultRepeats: Int = 5, overrides: [Int: Int] = [:]) {
        self.defaultRepeats = max(1, defaultRepeats)
        self.overrides = overrides
    }

    func repeats(forVerse verseNumber: Int) -> Int {
        max(1, overrides[verseNumber] ?? defaultRepeats)
    }

    func totalRepetitions(in range: VerseRange) -> Int {
        guard !range.isEmpty else { return 0 }
        return (range.start...range.end).reduce(0) { $0 + repeats(forVerse: $1) }
    }

    mutating func setRepeats(_ value: Int, forVerse verseNumber: Int) {
        let clamped = max(1, min(99, value))
        if clamped == defaultRepeats {
            overrides.removeValue(forKey: verseNumber)
        } else {
            overrides[verseNumber] = clamped
        }
    }

    mutating func resetOverrides() {
        overrides.removeAll()
    }
}
