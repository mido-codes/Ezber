import Foundation

/// One entry in the drill: a specific repetition of a specific verse. A drill
/// is exactly this queue, so the UI can always show where the listener is and
/// how to resume.
struct DrillItem: Identifiable, Hashable {
    struct ID: Hashable, Codable {
        let verseNumber: Int
        let repeatIndex: Int
    }

    let id: ID
    let verse: Verse
    let repeatIndex: Int
    let repeatCount: Int

    var isFirstRepeat: Bool { repeatIndex <= 1 }
    var isLastRepeat: Bool { repeatIndex >= repeatCount }
}

/// The verse × repetition queue built from a preset.
struct DrillQueue: Hashable {
    let presetID: UUID
    let surah: Surah
    let items: [DrillItem]

    var isEmpty: Bool { items.isEmpty }
    var count: Int { items.count }

    /// Verse numbers in play order, without duplicates.
    var verseNumbers: [Int] {
        var seen = Set<Int>()
        return items.compactMap { item in
            seen.insert(item.verse.number).inserted ? item.verse.number : nil
        }
    }

    static func build(preset: Preset, surah: Surah, verses: [Verse]) -> DrillQueue {
        let selected = verses
            .filter { $0.surahID == preset.surahID && preset.range.contains($0.number) }
            .sorted { $0.number < $1.number }

        var items: [DrillItem] = []
        for verse in selected {
            let repeats = max(1, preset.repeats.repeats(forVerse: verse.number))
            for repeatIndex in 1...repeats {
                items.append(
                    DrillItem(
                        id: DrillItem.ID(verseNumber: verse.number, repeatIndex: repeatIndex),
                        verse: verse,
                        repeatIndex: repeatIndex,
                        repeatCount: repeats
                    )
                )
            }
        }
        return DrillQueue(presetID: preset.id, surah: surah, items: items)
    }

    /// First queue index at or after the given resume point.
    func index(forResume point: ResumePoint) -> Int? {
        items.firstIndex { item in
            item.verse.number > point.verseNumber ||
                (item.verse.number == point.verseNumber && item.repeatIndex >= point.repeatIndex)
        }
    }

    /// Resume point of the item after `index`, or nil when the queue is done.
    func resumePoint(afterCompleting index: Int) -> ResumePoint? {
        let next = index + 1
        guard items.indices.contains(next) else { return nil }
        let item = items[next]
        return ResumePoint(verseNumber: item.verse.number, repeatIndex: item.repeatIndex)
    }

    func firstIndex(ofVerse number: Int) -> Int? {
        items.firstIndex { $0.verse.number == number }
    }

    func firstIndex(ofVerseAfter number: Int) -> Int? {
        items.firstIndex { $0.verse.number > number }
    }

    func firstIndex(ofVerseBefore number: Int) -> Int? {
        items.lastIndex { $0.verse.number < number }
    }
}
