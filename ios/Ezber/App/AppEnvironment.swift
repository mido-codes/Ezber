import Foundation
import Observation

/// One object owns the stores and services for the whole app, injected into the
/// SwiftUI environment. Views never construct their own stores.
@Observable
final class AppEnvironment {
    let content: any ContentProviding
    let userData: any UserDataStore
    let audioSession: any AudioSessionService
    let drillSession: any DrillSessionService
    let voiceMemo: any VoiceMemoService
    let settings: AppSettings

    let contentStoreDescription: String
    let userStoreDescription: String

    /// Bumped whenever user data changes so list screens refresh.
    var dataRevision = 0

    init(
        content: any ContentProviding,
        userData: any UserDataStore,
        audioSession: any AudioSessionService,
        drillSession: any DrillSessionService,
        voiceMemo: any VoiceMemoService,
        settings: AppSettings,
        contentStoreDescription: String,
        userStoreDescription: String
    ) {
        self.content = content
        self.userData = userData
        self.audioSession = audioSession
        self.drillSession = drillSession
        self.voiceMemo = voiceMemo
        self.settings = settings
        self.contentStoreDescription = contentStoreDescription
        self.userStoreDescription = userStoreDescription
    }

    func notifyDataChanged() {
        dataRevision &+= 1
    }

    func bootstrap() {
        seedIfNeeded()
        if let eventSource = audioSession as? AudioSessionEventSourcing {
            eventSource.eventHandler = drillSession as? AudioSessionEventHandler
        }
        try? audioSession.configure()
    }

    private func seedIfNeeded() {
        guard !userData.hasSeededPlaceholderData() else { return }
        for preset in PlaceholderContent.seededPresets {
            userData.save(preset)
        }
        for entry in PlaceholderContent.seededProgress {
            userData.save(entry)
        }
        for note in PlaceholderContent.seededNotes {
            userData.save(note)
        }
        if let first = PlaceholderContent.seededPresets.first {
            userData.setLastPresetID(first.id)
            userData.save(
                StudySession(
                    presetID: first.id,
                    resumePoint: ResumePoint(verseNumber: 2, repeatIndex: 3),
                    completedItems: 7,
                    totalItems: max(1, first.totalRepetitions)
                )
            )
        }
        userData.markPlaceholderDataSeeded()
        notifyDataChanged()
    }

    // MARK: - Factories

    static func live() -> AppEnvironment {
        let content: any ContentProviding
        let contentDescription: String
        if let sqliteContent = SQLiteContentStore.openDefault() {
            content = sqliteContent
            contentDescription = "SQLite · content.sqlite"
        } else {
            content = InMemoryContentStore()
            contentDescription = "Placeholder · content pipeline pending"
        }

        let userData: any UserDataStore
        let userDescription: String
        if let sqliteUser = try? SQLiteUserDataStore.openDefault() {
            userData = sqliteUser
            userDescription = "SQLite · user.sqlite"
        } else {
            userData = InMemoryUserDataStore()
            userDescription = "In-memory fallback"
        }

        let settings = AppSettings()
        let audioSession = LiveAudioSessionService()
        let drillSession = AVDrillSessionService(
            audioSession: audioSession,
            callBehavior: { [weak settings] in settings?.callBehavior ?? .pauseAndResume }
        )

        return AppEnvironment(
            content: content,
            userData: userData,
            audioSession: audioSession,
            drillSession: drillSession,
            voiceMemo: StubVoiceMemoService(),
            settings: settings,
            contentStoreDescription: contentDescription,
            userStoreDescription: userDescription
        )
    }

    static func preview() -> AppEnvironment {
        AppEnvironment(
            content: InMemoryContentStore(),
            userData: InMemoryUserDataStore.seeded(),
            audioSession: StubAudioSessionService(),
            drillSession: StubDrillSessionService(),
            voiceMemo: StubVoiceMemoService(),
            settings: AppSettings(defaults: UserDefaults(suiteName: "ezber.preview") ?? .standard),
            contentStoreDescription: "Placeholder · preview",
            userStoreDescription: "In-memory · preview"
        )
    }
}
