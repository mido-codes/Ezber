import Foundation
import Observation

/// Drives the study player: owns the queue, talks to the drill session service,
/// and persists progress and the resume point at every repeat boundary.
@Observable
final class StudyPlayerModel: DrillSessionServiceDelegate {
    let preset: Preset
    let surah: Surah
    let queue: DrillQueue

    private let environment: AppEnvironment
    private var sessionID: UUID
    private var sessionStartedAt: Date

    private(set) var state: DrillSessionState
    var isTranslationRevealed = false
    var noteDraft = ""

    init(preset: Preset, surah: Surah, queue: DrillQueue, environment: AppEnvironment) {
        self.preset = preset
        self.surah = surah
        self.queue = queue
        self.environment = environment

        let existing = environment.userData.activeSession(for: preset.id)
        self.sessionID = existing?.id ?? UUID()
        self.sessionStartedAt = existing?.startedAt ?? Date()

        environment.drillSession.load(
            queue,
            startingAt: existing?.resumePoint,
            configuration: DrillSessionConfiguration(
                loopUntilStopped: preset.display.loopUntilStopped,
                pauseBetweenRepeats: preset.display.pauseBetweenRepeats
            )
        )
        self.state = environment.drillSession.state
        environment.drillSession.delegate = self
        environment.drillSession.setNowPlayingDescription(
            DrillNowPlayingDescription(
                presetName: preset.name,
                surahName: surah.nameLatin,
                reciterName: environment.content.reciter(id: preset.reciterID)?.name ?? preset.reciterID
            )
        )

        environment.userData.markPresetUsed(preset.id, at: Date())
        environment.notifyDataChanged()
    }

    // MARK: - Derived state

    var currentVerse: Verse? { state.currentItem?.verse }

    var currentTranslation: Translation? { currentVerse?.translations.first }

    var positionInSection: Int {
        guard let verse = currentVerse else { return 1 }
        return max(1, verse.number - preset.range.start + 1)
    }

    var sectionCount: Int { max(1, preset.range.count) }

    var reciterName: String {
        environment.content.reciter(id: preset.reciterID)?.name ?? preset.reciterID
    }

    var isPlaying: Bool { state.status == .playing }

    var isCompleted: Bool { state.status == .completed }

    var shouldShowTranslation: Bool {
        switch preset.display.translationMode {
        case .alwaysShown: return true
        case .tapToReveal: return isTranslationRevealed
        case .hiddenDuringPlayback: return !isPlaying
        }
    }

    // MARK: - Transport

    func togglePlayPause() {
        switch state.status {
        case .playing:
            environment.drillSession.pause()
        case .completed:
            environment.drillSession.restart()
            environment.drillSession.play()
        case .idle, .paused:
            environment.drillSession.play()
        }
    }

    func nextRepeat() { environment.drillSession.nextRepeat() }
    func previousRepeat() { environment.drillSession.previousRepeat() }
    func nextVerse() { environment.drillSession.nextVerse() }
    func previousVerse() { environment.drillSession.previousVerse() }
    func toggleTranslation() { isTranslationRevealed.toggle() }

    func teardown() {
        // Stop and release the audio session when the player is left; the
        // resume point was persisted at the last repeat boundary.
        environment.drillSession.stop()
        environment.drillSession.setNowPlayingDescription(nil)
        environment.drillSession.delegate = nil
        saveSession()
        environment.notifyDataChanged()
    }

    // MARK: - Notes

    func saveNote() {
        let body = noteDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty, let verse = currentVerse else { return }
        let note = Note(verseID: verse.id, presetID: preset.id, body: body, kind: .text)
        environment.userData.save(note)
        environment.notifyDataChanged()
        noteDraft = ""
    }

    // MARK: - DrillSessionServiceDelegate

    func drillSession(_ service: any DrillSessionService, didUpdate state: DrillSessionState) {
        self.state = state
        saveSession()
    }

    func drillSession(_ service: any DrillSessionService, didComplete item: DrillItem, at index: Int) {
        environment.userData.recordCompletion(of: item, presetID: preset.id, at: Date())
        saveSession()
        environment.notifyDataChanged()
    }

    func drillSessionDidFinish(_ service: any DrillSessionService) {
        saveSession()
    }

    // MARK: - Session persistence

    private func saveSession() {
        guard state.queue != nil else { return }
        let resume = state.resumePoint ?? ResumePoint(verseNumber: preset.range.end, repeatIndex: 1)
        let session = StudySession(
            id: sessionID,
            presetID: preset.id,
            startedAt: sessionStartedAt,
            lastActiveAt: Date(),
            resumePoint: resume,
            completedItems: state.completedItemCount,
            totalItems: max(1, state.totalItemCount),
            isCompleted: state.status == .completed
        )
        environment.userData.save(session)
    }
}
