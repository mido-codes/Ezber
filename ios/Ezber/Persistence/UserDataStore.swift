import Foundation

/// Device-local user data: presets, verse progress, study sessions, notes,
/// downloads and small app state. Implemented by `SQLiteUserDataStore` in the
/// app and by `InMemoryUserDataStore` for previews and as a fallback.
protocol UserDataStore {
    // Presets
    func allPresets() -> [Preset]
    func preset(id: UUID) -> Preset?
    func save(_ preset: Preset)
    func deletePreset(id: UUID)
    func lastUsedPreset() -> Preset?
    func markPresetUsed(_ id: UUID, at date: Date)
    func lastPresetID() -> UUID?
    func setLastPresetID(_ id: UUID?)

    // Progress
    func allProgress() -> [VerseProgress]
    func progress(inSurah surahID: Int) -> [VerseProgress]
    func progress(for verseID: VerseID) -> VerseProgress?
    func save(_ progress: VerseProgress)
    func recordCompletion(of item: DrillItem, presetID: UUID, at date: Date)

    // Sessions
    func activeSession(for presetID: UUID) -> StudySession?
    func recentSessions(limit: Int) -> [StudySession]
    func save(_ session: StudySession)

    // Notes
    func allNotes() -> [Note]
    func notes(for verseID: VerseID) -> [Note]
    func save(_ note: Note)
    func deleteNote(id: UUID)

    // Downloads
    func allDownloads() -> [Download]
    func downloadState(reciterID: String, surahID: Int) -> DownloadState
    func save(_ download: Download)
    func deleteDownload(reciterID: String, surahID: Int)

    // Placeholder seeding
    func hasSeededPlaceholderData() -> Bool
    func markPlaceholderDataSeeded()
}

/// SQLite-backed user data store (`user.sqlite` in Application Support).
final class SQLiteUserDataStore: UserDataStore {
    private let database: Database

    init(database: Database) throws {
        self.database = database
        try UserSchema.migrate(database)
    }

    static func openDefault() throws -> SQLiteUserDataStore {
        let fileManager = FileManager.default
        let supportDirectory = try fileManager.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        let directory = supportDirectory.appendingPathComponent("Ezber", isDirectory: true)
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        let url = directory.appendingPathComponent("user.sqlite")
        let database = try Database(path: url.path)
        return try SQLiteUserDataStore(database: database)
    }

    // MARK: - Presets

    func allPresets() -> [Preset] {
        let rows = try? database.query(
            "SELECT \(Self.presetColumns) FROM presets ORDER BY updated_at DESC"
        ) { Self.preset(from: $0) }
        return (rows ?? []).compactMap { $0 }
    }

    func preset(id: UUID) -> Preset? {
        let rows = try? database.query(
            "SELECT \(Self.presetColumns) FROM presets WHERE id = ?",
            [.text(id.uuidString)]
        ) { Self.preset(from: $0) }
        return (rows ?? []).compactMap { $0 }.first
    }

    func save(_ preset: Preset) {
        let sql = """
        INSERT INTO presets (
            id, name, surah_id, range_start, range_end, repeats_json,
            reciter_id, display_json, created_at, updated_at, last_studied_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            surah_id = excluded.surah_id,
            range_start = excluded.range_start,
            range_end = excluded.range_end,
            repeats_json = excluded.repeats_json,
            reciter_id = excluded.reciter_id,
            display_json = excluded.display_json,
            updated_at = excluded.updated_at,
            last_studied_at = excluded.last_studied_at
        """
        try? database.execute(sql, [
            .text(preset.id.uuidString),
            .text(preset.name),
            .integer(preset.surahID),
            .integer(preset.range.start),
            .integer(preset.range.end),
            .text(Self.encodeJSON(preset.repeats)),
            .text(preset.reciterID),
            .text(Self.encodeJSON(preset.display)),
            .real(preset.createdAt.timeIntervalSince1970),
            .real(preset.updatedAt.timeIntervalSince1970),
            preset.lastStudiedAt.map { SQLiteValue.real($0.timeIntervalSince1970) } ?? .null
        ])
    }

    func deletePreset(id: UUID) {
        try? database.transaction {
            try database.execute("DELETE FROM presets WHERE id = ?;", [.text(id.uuidString)])
            try database.execute("DELETE FROM study_sessions WHERE preset_id = ?;", [.text(id.uuidString)])
        }
        if lastPresetID() == id {
            setLastPresetID(nil)
        }
    }

    func lastUsedPreset() -> Preset? {
        if let id = lastPresetID(), let preset = preset(id: id) {
            return preset
        }
        return allPresets().first
    }

    func markPresetUsed(_ id: UUID, at date: Date) {
        guard var preset = preset(id: id) else { return }
        preset.lastStudiedAt = date
        preset.updatedAt = date
        save(preset)
        setLastPresetID(id)
    }

    func lastPresetID() -> UUID? {
        let rows = try? database.query(
            "SELECT value FROM app_state WHERE key = 'last_preset_id';"
        ) { $0.string(at: 0) }
        guard let value = (rows ?? []).compactMap({ $0 }).first else { return nil }
        return UUID(uuidString: value)
    }

    func setLastPresetID(_ id: UUID?) {
        if let id {
            try? database.execute(
                "INSERT OR REPLACE INTO app_state (key, value) VALUES ('last_preset_id', ?);",
                [.text(id.uuidString)]
            )
        } else {
            try? database.execute("DELETE FROM app_state WHERE key = 'last_preset_id';")
        }
    }

    // MARK: - Progress

    func allProgress() -> [VerseProgress] {
        let rows = try? database.query(
            "SELECT \(Self.progressColumns) FROM verse_progress ORDER BY surah_id, verse_number"
        ) { Self.progress(from: $0) }
        return (rows ?? []).compactMap { $0 }
    }

    func progress(inSurah surahID: Int) -> [VerseProgress] {
        let rows = try? database.query(
            "SELECT \(Self.progressColumns) FROM verse_progress WHERE surah_id = ? ORDER BY verse_number",
            [.integer(surahID)]
        ) { Self.progress(from: $0) }
        return (rows ?? []).compactMap { $0 }
    }

    func progress(for verseID: VerseID) -> VerseProgress? {
        let rows = try? database.query(
            "SELECT \(Self.progressColumns) FROM verse_progress WHERE surah_id = ? AND verse_number = ?",
            [.integer(verseID.surah), .integer(verseID.number)]
        ) { Self.progress(from: $0) }
        return (rows ?? []).compactMap { $0 }.first
    }

    func save(_ progress: VerseProgress) {
        let sql = """
        INSERT INTO verse_progress (
            surah_id, verse_number, repetitions_completed, exposure_count,
            last_played_at, state, last_preset_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(surah_id, verse_number) DO UPDATE SET
            repetitions_completed = excluded.repetitions_completed,
            exposure_count = excluded.exposure_count,
            last_played_at = excluded.last_played_at,
            state = excluded.state,
            last_preset_id = excluded.last_preset_id
        """
        try? database.execute(sql, [
            .integer(progress.verseID.surah),
            .integer(progress.verseID.number),
            .integer(progress.repetitionsCompleted),
            .integer(progress.exposureCount),
            progress.lastPlayedAt.map { SQLiteValue.real($0.timeIntervalSince1970) } ?? .null,
            .text(progress.state.rawValue),
            progress.lastPresetID.map { SQLiteValue.text($0.uuidString) } ?? .null
        ])
    }

    func recordCompletion(of item: DrillItem, presetID: UUID, at date: Date) {
        var entry = progress(for: item.verse.id) ?? VerseProgress(verseID: item.verse.id)
        entry.repetitionsCompleted += 1
        entry.exposureCount += 1
        entry.lastPlayedAt = date
        entry.lastPresetID = presetID
        entry.state = VerseState.derived(fromRepetitions: entry.repetitionsCompleted)
        save(entry)
    }

    // MARK: - Sessions

    func activeSession(for presetID: UUID) -> StudySession? {
        let rows = try? database.query(
            "SELECT \(Self.sessionColumns) FROM study_sessions WHERE preset_id = ? AND is_completed = 0 ORDER BY last_active_at DESC LIMIT 1",
            [.text(presetID.uuidString)]
        ) { Self.session(from: $0) }
        return (rows ?? []).compactMap { $0 }.first
    }

    func recentSessions(limit: Int) -> [StudySession] {
        let rows = try? database.query(
            "SELECT \(Self.sessionColumns) FROM study_sessions ORDER BY last_active_at DESC LIMIT ?",
            [.integer(max(1, limit))]
        ) { Self.session(from: $0) }
        return (rows ?? []).compactMap { $0 }
    }

    func save(_ session: StudySession) {
        let sql = """
        INSERT INTO study_sessions (
            id, preset_id, started_at, last_active_at, verse_number,
            repeat_index, completed_items, total_items, is_completed
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            preset_id = excluded.preset_id,
            last_active_at = excluded.last_active_at,
            verse_number = excluded.verse_number,
            repeat_index = excluded.repeat_index,
            completed_items = excluded.completed_items,
            total_items = excluded.total_items,
            is_completed = excluded.is_completed
        """
        try? database.execute(sql, [
            .text(session.id.uuidString),
            .text(session.presetID.uuidString),
            .real(session.startedAt.timeIntervalSince1970),
            .real(session.lastActiveAt.timeIntervalSince1970),
            .integer(session.resumePoint.verseNumber),
            .integer(session.resumePoint.repeatIndex),
            .integer(session.completedItems),
            .integer(session.totalItems),
            .integer(session.isCompleted ? 1 : 0)
        ])
    }

    // MARK: - Notes

    func allNotes() -> [Note] {
        let rows = try? database.query(
            "SELECT \(Self.noteColumns) FROM notes ORDER BY updated_at DESC"
        ) { Self.note(from: $0) }
        return (rows ?? []).compactMap { $0 }
    }

    func notes(for verseID: VerseID) -> [Note] {
        let rows = try? database.query(
            "SELECT \(Self.noteColumns) FROM notes WHERE surah_id = ? AND verse_number = ? ORDER BY updated_at DESC",
            [.integer(verseID.surah), .integer(verseID.number)]
        ) { Self.note(from: $0) }
        return (rows ?? []).compactMap { $0 }
    }

    func save(_ note: Note) {
        let sql = """
        INSERT INTO notes (
            id, surah_id, verse_number, preset_id, body, kind,
            transcript, is_transcribed, audio_file_name, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            surah_id = excluded.surah_id,
            verse_number = excluded.verse_number,
            preset_id = excluded.preset_id,
            body = excluded.body,
            kind = excluded.kind,
            transcript = excluded.transcript,
            is_transcribed = excluded.is_transcribed,
            audio_file_name = excluded.audio_file_name,
            updated_at = excluded.updated_at
        """
        try? database.execute(sql, [
            .text(note.id.uuidString),
            .integer(note.verseID.surah),
            .integer(note.verseID.number),
            note.presetID.map { SQLiteValue.text($0.uuidString) } ?? .null,
            .text(note.body),
            .text(note.kind.rawValue),
            note.transcript.map { SQLiteValue.text($0) } ?? .null,
            .integer(note.isTranscribed ? 1 : 0),
            note.audioFileName.map { SQLiteValue.text($0) } ?? .null,
            .real(note.createdAt.timeIntervalSince1970),
            .real(note.updatedAt.timeIntervalSince1970)
        ])
    }

    func deleteNote(id: UUID) {
        try? database.execute("DELETE FROM notes WHERE id = ?;", [.text(id.uuidString)])
    }

    // MARK: - Downloads

    func allDownloads() -> [Download] {
        let rows = try? database.query(
            "SELECT reciter_id, surah_id, state, byte_count, updated_at FROM downloads ORDER BY surah_id"
        ) { statement in
            Download(
                reciterID: statement.string(at: 0) ?? "",
                surahID: statement.int(at: 1),
                state: DownloadState(rawValue: statement.string(at: 2) ?? "") ?? .notDownloaded,
                byteCount: statement.isNull(at: 3) ? nil : statement.int(at: 3),
                updatedAt: Self.date(from: statement, at: 4)
            )
        }
        return rows ?? []
    }

    func downloadState(reciterID: String, surahID: Int) -> DownloadState {
        let rows = try? database.query(
            "SELECT state FROM downloads WHERE reciter_id = ? AND surah_id = ?;",
            [.text(reciterID), .integer(surahID)]
        ) { DownloadState(rawValue: $0.string(at: 0) ?? "") ?? .notDownloaded }
        return rows?.first ?? .notDownloaded
    }

    func save(_ download: Download) {
        try? database.execute(
            """
            INSERT INTO downloads (reciter_id, surah_id, state, byte_count, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(reciter_id, surah_id) DO UPDATE SET
                state = excluded.state,
                byte_count = excluded.byte_count,
                updated_at = excluded.updated_at;
            """,
            [
                .text(download.reciterID),
                .integer(download.surahID),
                .text(download.state.rawValue),
                download.byteCount.map { SQLiteValue.integer($0) } ?? .null,
                download.updatedAt.map { SQLiteValue.real($0.timeIntervalSince1970) } ?? .null
            ]
        )
    }

    func deleteDownload(reciterID: String, surahID: Int) {
        try? database.execute(
            "DELETE FROM downloads WHERE reciter_id = ? AND surah_id = ?;",
            [.text(reciterID), .integer(surahID)]
        )
    }

    // MARK: - Placeholder seeding

    func hasSeededPlaceholderData() -> Bool {
        let rows = try? database.query(
            "SELECT value FROM app_state WHERE key = 'placeholder_seeded';"
        ) { $0.string(at: 0) }
        return (rows ?? []).compactMap { $0 }.first == "1"
    }

    func markPlaceholderDataSeeded() {
        try? database.execute(
            "INSERT OR REPLACE INTO app_state (key, value) VALUES ('placeholder_seeded', '1');"
        )
    }

    // MARK: - Row mapping

    private static let presetColumns = """
    id, name, surah_id, range_start, range_end, repeats_json, reciter_id, \
    display_json, created_at, updated_at, last_studied_at
    """

    private static let progressColumns = """
    surah_id, verse_number, repetitions_completed, exposure_count, \
    last_played_at, state, last_preset_id
    """

    private static let sessionColumns = """
    id, preset_id, started_at, last_active_at, verse_number, \
    repeat_index, completed_items, total_items, is_completed
    """

    private static let noteColumns = """
    id, surah_id, verse_number, preset_id, body, kind, transcript, \
    is_transcribed, audio_file_name, created_at, updated_at
    """

    private static func preset(from statement: Statement) -> Preset? {
        guard
            let idString = statement.string(at: 0),
            let id = UUID(uuidString: idString),
            let name = statement.string(at: 1)
        else {
            return nil
        }
        let repeats = decodeJSON(RepeatPlan.self, statement.string(at: 5)) ?? RepeatPlan()
        let display = decodeJSON(DisplayOptions.self, statement.string(at: 7)) ?? DisplayOptions()
        return Preset(
            id: id,
            name: name,
            surahID: statement.int(at: 2),
            range: VerseRange(start: statement.int(at: 3), end: statement.int(at: 4)),
            repeats: repeats,
            reciterID: statement.string(at: 6) ?? "",
            display: display,
            createdAt: Date(timeIntervalSince1970: statement.double(at: 8)),
            updatedAt: Date(timeIntervalSince1970: statement.double(at: 9)),
            lastStudiedAt: date(from: statement, at: 10)
        )
    }

    private static func progress(from statement: Statement) -> VerseProgress? {
        guard let state = VerseState(rawValue: statement.string(at: 5) ?? "") else { return nil }
        return VerseProgress(
            verseID: VerseID(surah: statement.int(at: 0), number: statement.int(at: 1)),
            repetitionsCompleted: statement.int(at: 2),
            exposureCount: statement.int(at: 3),
            lastPlayedAt: date(from: statement, at: 4),
            state: state,
            lastPresetID: statement.string(at: 6).flatMap(UUID.init(uuidString:))
        )
    }

    private static func session(from statement: Statement) -> StudySession? {
        guard
            let idString = statement.string(at: 0),
            let id = UUID(uuidString: idString),
            let presetString = statement.string(at: 1),
            let presetID = UUID(uuidString: presetString)
        else {
            return nil
        }
        return StudySession(
            id: id,
            presetID: presetID,
            startedAt: Date(timeIntervalSince1970: statement.double(at: 2)),
            lastActiveAt: Date(timeIntervalSince1970: statement.double(at: 3)),
            resumePoint: ResumePoint(
                verseNumber: statement.int(at: 4),
                repeatIndex: statement.int(at: 5)
            ),
            completedItems: statement.int(at: 6),
            totalItems: statement.int(at: 7),
            isCompleted: statement.int(at: 8) != 0
        )
    }

    private static func note(from statement: Statement) -> Note? {
        guard
            let idString = statement.string(at: 0),
            let id = UUID(uuidString: idString),
            let body = statement.string(at: 4)
        else {
            return nil
        }
        return Note(
            id: id,
            verseID: VerseID(surah: statement.int(at: 1), number: statement.int(at: 2)),
            presetID: statement.string(at: 3).flatMap(UUID.init(uuidString:)),
            body: body,
            kind: NoteKind(rawValue: statement.string(at: 5) ?? "") ?? .text,
            transcript: statement.string(at: 6),
            isTranscribed: statement.int(at: 7) != 0,
            audioFileName: statement.string(at: 8),
            createdAt: Date(timeIntervalSince1970: statement.double(at: 9)),
            updatedAt: Date(timeIntervalSince1970: statement.double(at: 10))
        )
    }

    private static func date(from statement: Statement, at index: Int32) -> Date? {
        guard !statement.isNull(at: index) else { return nil }
        return Date(timeIntervalSince1970: statement.double(at: index))
    }

    private static func encodeJSON<T: Encodable>(_ value: T) -> String {
        guard
            let data = try? JSONEncoder().encode(value),
            let string = String(data: data, encoding: .utf8)
        else {
            return "{}"
        }
        return string
    }

    private static func decodeJSON<T: Decodable>(_ type: T.Type, _ string: String?) -> T? {
        guard let string, let data = string.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }
}
