import Foundation

/// One of the 114 chapters of the Quran.
struct Surah: Identifiable, Hashable, Codable {
    let id: Int
    let nameArabic: String
    let nameLatin: String
    let nameEnglish: String
    let verseCount: Int
    let revelationPlace: RevelationPlace

    var subtitle: String {
        "\(nameEnglish) · \(verseCount) verses"
    }
}

enum RevelationPlace: String, Codable, CaseIterable {
    case meccan
    case medinan

    var label: String {
        switch self {
        case .meccan: return "Meccan"
        case .medinan: return "Medinan"
        }
    }
}
