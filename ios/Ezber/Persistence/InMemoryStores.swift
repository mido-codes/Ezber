import Foundation

/// In-memory content store used for previews and whenever the content pipeline
/// has not produced `content.sqlite` yet. It serves curated placeholder verses
/// and generates a placeholder verse for any missing position in a range, so
/// every screen renders.
final class InMemoryContentStore: ContentProviding {
    private let surahs: [Surah]
    private let reciters: [Reciter]
    private let curatedVerses: [Verse]

    init(
        surahs: [Surah] = PlaceholderContent.surahs,
        reciters: [Reciter] = PlaceholderContent.reciters,
        verses: [Verse] = PlaceholderContent.curatedVerses
    ) {
        self.surahs = surahs
        self.reciters = reciters
        self.curatedVerses = verses
    }

    func allSurahs() -> [Surah] { surahs }

    func surah(id: Int) -> Surah? {
        surahs.first { $0.id == id }
    }

    func verses(surahID: Int, in range: VerseRange) -> [Verse] {
        guard !range.isEmpty else { return [] }
        var curated: [Int: Verse] = [:]
        for verse in curatedVerses where verse.surahID == surahID && range.contains(verse.number) {
            curated[verse.number] = verse
        }
        return (range.start...range.end).map { number in
            curated[number] ?? PlaceholderContent.generatedVerse(surahID: surahID, number: number)
        }
    }

    func allReciters() -> [Reciter] { reciters }

    func reciter(id: String) -> Reciter? {
        reciters.first { $0.id == id }
    }
}

/// In-memory user data store used for previews and as a fallback when the
/// SQLite store cannot be opened. Behavior matches `SQLiteUserDataStore`.
final class InMemoryUserDataStore: UserDataStore {
    private var presets: [UUID: Preset] = [:]
    private var progressByVerse: [VerseID: VerseProgress] = [:]
    private var sessions: [UUID: StudySession] = [:]
    private var notesByID: [UUID: Note] = [:]
    private var downloadsByID: [String: Download] = [:]
    private var storedLastPresetID: UUID?
    private var hasSeededPlaceholder = false

    init() {}

    /// A store seeded with the same placeholder data the app seeds into SQLite
    /// on first run, so previews match a fresh install.
    static func seeded() -> InMemoryUserDataStore {
        let store = InMemoryUserDataStore()
        for preset in PlaceholderContent.seededPresets {
            store.save(preset)
        }
        for entry in PlaceholderContent.seededProgress {
            store.save(entry)
        }
        for note in PlaceholderContent.seededNotes {
            store.save(note)
        }
        if let first = PlaceholderContent.seededPresets.first {
            store.setLastPresetID(first.id)
            store.save(
                StudySession(
                    presetID: first.id,
                    resumePoint: ResumePoint(verseNumber: 2, repeatIndex: 3),
                    completedItems: 7,
                    totalItems: max(1, first.totalRepetitions)
                )
            )
        }
        store.markPlaceholderDataSeeded()
        return store
    }

    // MARK: - Presets

    func allPresets() -> [Preset] {
        presets.values.sorted { $0.updatedAt > $1.updatedAt }
    }

    func preset(id: UUID) -> Preset? {
        presets[id]
    }

    func save(_ preset: Preset) {
        presets[preset.id] = preset
    }

    func deletePreset(id: UUID) {
        presets.removeValue(forKey: id)
        sessions = sessions.filter { $0.value.presetID != id }
        if storedLastPresetID == id {
            storedLastPresetID = nil
        }
    }

    func lastUsedPreset() -> Preset? {
        if let storedLastPresetID, let preset = presets[storedLastPresetID] {
            return preset
        }
        return allPresets().first
    }

    func markPresetUsed(_ id: UUID, at date: Date) {
        guard var preset = presets[id] else { return }
        preset.lastStudiedAt = date
        preset.updatedAt = date
        presets[id] = preset
        storedLastPresetID = id
    }

    func lastPresetID() -> UUID? {
        storedLastPresetID
    }

    func setLastPresetID(_ id: UUID?) {
        storedLastPresetID = id
    }

    // MARK: - Progress

    func allProgress() -> [VerseProgress] {
        progressByVerse.values.sorted { $0.verseID < $1.verseID }
    }

    func progress(inSurah surahID: Int) -> [VerseProgress] {
        allProgress().filter { $0.verseID.surah == surahID }
    }

    func progress(for verseID: VerseID) -> VerseProgress? {
        progressByVerse[verseID]
    }

    func save(_ progress: VerseProgress) {
        progressByVerse[progress.verseID] = progress
    }

    func recordCompletion(of item: DrillItem, presetID: UUID, at date: Date) {
        var entry = progressByVerse[item.verse.id] ?? VerseProgress(verseID: item.verse.id)
        entry.repetitionsCompleted += 1
        entry.exposureCount += 1
        entry.lastPlayedAt = date
        entry.lastPresetID = presetID
        entry.state = VerseState.derived(fromRepetitions: entry.repetitionsCompleted)
        progressByVerse[item.verse.id] = entry
    }

    // MARK: - Sessions

    func activeSession(for presetID: UUID) -> StudySession? {
        sessions.values
            .filter { $0.presetID == presetID && !$0.isCompleted }
            .sorted { $0.lastActiveAt > $1.lastActiveAt }
            .first
    }

    func recentSessions(limit: Int) -> [StudySession] {
        Array(
            sessions.values
                .sorted { $0.lastActiveAt > $1.lastActiveAt }
                .prefix(max(1, limit))
        )
    }

    func save(_ session: StudySession) {
        sessions[session.id] = session
    }

    // MARK: - Notes

    func allNotes() -> [Note] {
        notesByID.values.sorted { $0.updatedAt > $1.updatedAt }
    }

    func notes(for verseID: VerseID) -> [Note] {
        allNotes().filter { $0.verseID == verseID }
    }

    func save(_ note: Note) {
        notesByID[note.id] = note
    }

    func deleteNote(id: UUID) {
        notesByID.removeValue(forKey: id)
    }

    // MARK: - Downloads

    func allDownloads() -> [Download] {
        downloadsByID.values.sorted { $0.surahID < $1.surahID }
    }

    func downloadState(reciterID: String, surahID: Int) -> DownloadState {
        downloadsByID["\(reciterID)-\(surahID)"]?.state ?? .notDownloaded
    }

    func save(_ download: Download) {
        downloadsByID[download.id] = download
    }

    func deleteDownload(reciterID: String, surahID: Int) {
        downloadsByID.removeValue(forKey: "\(reciterID)-\(surahID)")
    }

    // MARK: - Placeholder seeding

    func hasSeededPlaceholderData() -> Bool {
        hasSeededPlaceholder
    }

    func markPlaceholderDataSeeded() {
        hasSeededPlaceholder = true
    }
}
