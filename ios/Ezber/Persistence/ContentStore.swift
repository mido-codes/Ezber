import Foundation

/// Read access to the content pipeline's output: surahs, verses and reciters.
protocol ContentProviding {
    func allSurahs() -> [Surah]
    func surah(id: Int) -> Surah?
    func verses(surahID: Int, in range: VerseRange) -> [Verse]
    func allReciters() -> [Reciter]
    func reciter(id: String) -> Reciter?
}

/// SQLite-backed content store. The pipeline writes `content.sqlite`; the app
/// copies a bundled database into Application Support on first run and opens it
/// read-write so migrations can run. When no database exists yet, the app falls
/// back to `InMemoryContentStore` with placeholder data.
final class SQLiteContentStore: ContentProviding {
    private let database: Database

    init(database: Database) throws {
        self.database = database
        try ContentSchema.migrate(database)
    }

    /// Opens the content database from Application Support, copying a bundled
    /// `content.sqlite` into place on first run. Returns nil when the content
    /// pipeline has not produced a database yet.
    static func openDefault() -> SQLiteContentStore? {
        let fileManager = FileManager.default
        guard let supportDirectory = try? fileManager.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        ) else {
            return nil
        }

        let directory = supportDirectory.appendingPathComponent("Ezber", isDirectory: true)
        try? fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        let destination = directory.appendingPathComponent("content.sqlite")

        if !fileManager.fileExists(atPath: destination.path),
           let bundled = Bundle.main.url(forResource: "content", withExtension: "sqlite") {
            try? fileManager.copyItem(at: bundled, to: destination)
        }

        guard fileManager.fileExists(atPath: destination.path) else { return nil }
        guard let database = try? Database(path: destination.path) else { return nil }
        return try? SQLiteContentStore(database: database)
    }

    // MARK: - ContentProviding

    func allSurahs() -> [Surah] {
        (try? database.query(
            "SELECT id, name_arabic, name_latin, name_english, verse_count, revelation_place FROM surahs ORDER BY id"
        ) { statement in
            Surah(
                id: statement.int(at: 0),
                nameArabic: statement.string(at: 1) ?? "",
                nameLatin: statement.string(at: 2) ?? "",
                nameEnglish: statement.string(at: 3) ?? "",
                verseCount: statement.int(at: 4),
                revelationPlace: RevelationPlace(rawValue: statement.string(at: 5) ?? "meccan") ?? .meccan
            )
        }) ?? []
    }

    func surah(id: Int) -> Surah? {
        allSurahs().first { $0.id == id }
    }

    func verses(surahID: Int, in range: VerseRange) -> [Verse] {
        guard !range.isEmpty else { return [] }

        let sql = """
        SELECT v.surah_id, v.number, v.arabic, v.transliteration,
               t.id, t.translator, t.language_code, vt.text
        FROM verses AS v
        LEFT JOIN verse_translations AS vt
            ON vt.surah_id = v.surah_id AND vt.verse_number = v.number
        LEFT JOIN translations AS t ON t.id = vt.translation_id
        WHERE v.surah_id = ? AND v.number >= ? AND v.number <= ?
        ORDER BY v.number, t.id
        """

        let rows = (try? database.query(
            sql,
            [.integer(surahID), .integer(range.start), .integer(range.end)]
        ) { statement -> VerseRow in
            let translationID = statement.string(at: 4)
            let translation: Translation?
            if let translationID, let text = statement.string(at: 7) {
                translation = Translation(
                    id: translationID,
                    translator: statement.string(at: 5) ?? translationID,
                    languageCode: statement.string(at: 6) ?? "en",
                    text: text
                )
            } else {
                translation = nil
            }
            return VerseRow(
                number: statement.int(at: 1),
                arabic: statement.string(at: 2) ?? "",
                transliteration: statement.string(at: 3) ?? "",
                translation: translation
            )
        }) ?? []

        var order: [Int] = []
        var grouped: [Int: (arabic: String, transliteration: String, translations: [Translation])] = [:]
        for row in rows {
            if grouped[row.number] == nil {
                order.append(row.number)
                grouped[row.number] = (row.arabic, row.transliteration, [])
            }
            if let translation = row.translation {
                grouped[row.number]?.translations.append(translation)
            }
        }

        return order.compactMap { number in
            guard let entry = grouped[number] else { return nil }
            return Verse(
                surahID: surahID,
                number: number,
                arabic: entry.arabic,
                transliteration: entry.transliteration,
                translations: entry.translations
            )
        }
    }

    func allReciters() -> [Reciter] {
        (try? database.query(
            "SELECT id, name, style, language_name, sample_url, audio_base_url, license FROM reciters ORDER BY name"
        ) { statement in
            Reciter(
                id: statement.string(at: 0) ?? "",
                name: statement.string(at: 1) ?? "",
                style: statement.string(at: 2) ?? "",
                languageName: statement.string(at: 3) ?? "",
                sampleURL: statement.string(at: 4).flatMap(URL.init(string:)),
                audioBaseURL: statement.string(at: 5).flatMap(URL.init(string:)),
                license: statement.string(at: 6)
            )
        }) ?? []
    }

    func reciter(id: String) -> Reciter? {
        allReciters().first { $0.id == id }
    }

    private struct VerseRow {
        let number: Int
        let arabic: String
        let transliteration: String
        let translation: Translation?
    }
}
