import Foundation

/// Identifies a single verse across the whole Quran, for example `55:3`.
struct VerseID: Hashable, Codable, CustomStringConvertible, Comparable {
    let surah: Int
    let number: Int

    var description: String { "\(surah):\(number)" }
    var reference: String { description }

    static func < (lhs: VerseID, rhs: VerseID) -> Bool {
        lhs.surah == rhs.surah ? lhs.number < rhs.number : lhs.surah < rhs.surah
    }
}

/// A verse with its reading surfaces. Arabic is secondary; transliteration is
/// the primary reading surface for this audience.
struct Verse: Identifiable, Hashable, Codable {
    let id: VerseID
    let surahID: Int
    let number: Int
    let arabic: String
    let transliteration: String
    let translations: [Translation]

    var reference: String { "\(surahID):\(number)" }

    init(
        surahID: Int,
        number: Int,
        arabic: String,
        transliteration: String,
        translations: [Translation] = []
    ) {
        self.id = VerseID(surah: surahID, number: number)
        self.surahID = surahID
        self.number = number
        self.arabic = arabic
        self.transliteration = transliteration
        self.translations = translations
    }
}

/// One translation attached to a verse. Several translation sets can coexist;
/// the preset decides which one is shown.
struct Translation: Identifiable, Hashable, Codable {
    let id: String
    let translator: String
    let languageCode: String
    let text: String
}
