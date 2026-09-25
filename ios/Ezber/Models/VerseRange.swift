import Foundation

/// An inclusive from/to range of verse numbers within one surah.
struct VerseRange: Hashable, Codable {
    var start: Int
    var end: Int

    var count: Int { max(0, end - start + 1) }
    var isEmpty: Bool { count == 0 }

    var displayString: String { "\(start)–\(end)" }

    func contains(_ verseNumber: Int) -> Bool {
        verseNumber >= start && verseNumber <= end
    }

    /// The default drill range: a short section of five verses.
    static func short(start: Int = 1, verseCount: Int) -> VerseRange {
        let clampedStart = min(max(1, start), max(1, verseCount))
        let clampedEnd = min(clampedStart + 4, max(1, verseCount))
        return VerseRange(start: clampedStart, end: max(clampedStart, clampedEnd))
    }

    func clamped(toVerseCount verseCount: Int) -> VerseRange {
        let lower = min(max(1, start), max(1, verseCount))
        let upper = min(max(lower, end), max(1, verseCount))
        return VerseRange(start: lower, end: upper)
    }
}
