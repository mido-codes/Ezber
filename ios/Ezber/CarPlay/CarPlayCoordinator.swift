import CarPlay
import Foundation
import MediaPlayer
import UIKit

/// Drives the car surface from the shared app environment.
///
/// The coordinator owns the CarPlay template hierarchy: a preset list is the
/// root template, and the shared now-playing template is pushed on top when a
/// drill starts. It maps the current verse and the preset's display options
/// onto the drill engine's now-playing description, so the system now-playing
/// screen keeps showing the verse and its transliteration as they change, and
/// it maps the transport controls (previous/next verse and previous/next
/// repeat) back onto the drill session.
///
/// Everything is event-driven and change-gated. The one-second safety tick only
/// exists for the case where the phone's study player owns the drill session
/// delegate; it republishes nothing unless the drill state or the user data
/// revision actually changed, and no screen animates or reloads per frame.
@MainActor
final class CarPlayCoordinator: NSObject, DrillSessionServiceDelegate {
    private let environment: AppEnvironment
    private let interfaceController: CPInterfaceController
    private let drill: any DrillSessionService

    private var presetsTemplate: CPListTemplate?
    private var presetItems: [UUID: CPListItem] = [:]
    private var activePreset: Preset?
    private var activeSurah: Surah?
    private var sessionID = UUID()
    private var sessionStartedAt = Date()
    private var isStarted = false
    private var lastSyncedState: DrillSessionState?
    private var lastDescription: DrillNowPlayingDescription?
    private var lastDataRevision = -1
    private var safetyTick: Timer?
    private var remoteCommandTargets: [(command: MPRemoteCommand, target: Any)] = []

    init(environment: AppEnvironment, interfaceController: CPInterfaceController) {
        self.environment = environment
        self.interfaceController = interfaceController
        self.drill = environment.drillSession
        super.init()
    }

    // MARK: - Lifecycle

    func start() {
        guard !isStarted else { return }
        isStarted = true
        lastDataRevision = environment.dataRevision

        let template = makePresetsTemplate()
        presetsTemplate = template
        interfaceController.setRootTemplate(template, animated: false, completion: nil)

        configureRemoteCommands()
        configureNowPlayingButtons()
        startSafetyTick()
        attachToExistingDrill()
    }

    func stop() {
        guard isStarted else { return }
        isStarted = false

        safetyTick?.invalidate()
        safetyTick = nil
        for entry in remoteCommandTargets {
            entry.command.removeTarget(entry.target)
        }
        remoteCommandTargets.removeAll()

        if drill.delegate === self {
            drill.delegate = nil
        }
        if drill.state.status != .playing {
            drill.setNowPlayingDescription(nil)
            MPNowPlayingInfoCenter.default().playbackState = .stopped
        }
    }

    /// Starts (or resumes) a preset and brings the now-playing surface forward.
    func startDrill(presetID: UUID) {
        guard isStarted,
              let preset = environment.userData.preset(id: presetID),
              let surah = environment.content.surah(id: preset.surahID)
        else { return }

        let verses = environment.content.verses(surahID: preset.surahID, in: preset.range)
        let queue = DrillQueue.build(preset: preset, surah: surah, verses: verses)
        guard !queue.isEmpty else { return }

        let existing = environment.userData.activeSession(for: preset.id)
        sessionID = existing?.id ?? UUID()
        sessionStartedAt = existing?.startedAt ?? Date()
        activePreset = preset
        activeSurah = surah
        lastSyncedState = nil
        lastDescription = nil

        drill.delegate = self
        drill.load(
            queue,
            startingAt: existing?.resumePoint,
            configuration: DrillSessionConfiguration(
                loopUntilStopped: preset.display.loopUntilStopped,
                pauseBetweenRepeats: preset.display.pauseBetweenRepeats
            )
        )
        environment.userData.markPresetUsed(preset.id, at: Date())
        environment.userData.setLastPresetID(preset.id)
        environment.notifyDataChanged()

        applyPlayingIndicator()
        try? environment.audioSession.activate()
        drill.play()
        syncFromSession(force: true)
        if interfaceController.topTemplate !== CPNowPlayingTemplate.shared {
            interfaceController.pushTemplate(CPNowPlayingTemplate.shared, animated: true, completion: nil)
        }
    }

    // MARK: - Templates

    private func makePresetsTemplate() -> CPListTemplate {
        let template = CPListTemplate(title: "Ezber", sections: makePresetSections())
        template.emptyViewTitleVariants = ["No presets yet"]
        template.emptyViewSubtitleVariants = ["Open Ezber on iPhone to create a drill."]
        return template
    }

    private func makePresetSections() -> [CPListSection] {
        presetItems.removeAll()
        let presets = environment.userData.allPresets()
        guard !presets.isEmpty else { return [] }

        let lastUsedID = environment.userData.lastPresetID()
        let continueItems = presets.filter { $0.id == lastUsedID }.map(makePresetItem)
        let otherItems = presets.filter { $0.id != lastUsedID }.map(makePresetItem)

        var sections: [CPListSection] = []
        if !continueItems.isEmpty {
            sections.append(CPListSection(items: continueItems, header: "Continue", sectionIndexTitle: nil))
        }
        if !otherItems.isEmpty {
            sections.append(CPListSection(items: otherItems, header: "Presets", sectionIndexTitle: nil))
        }
        applyPlayingIndicator()
        return sections
    }

    private func makePresetItem(_ preset: Preset) -> CPListItem {
        let item = CPListItem(text: preset.name, detailText: presetDetail(preset))
        item.playingIndicatorLocation = .trailing
        item.handler = { [weak self] _, completion in
            self?.startDrill(presetID: preset.id)
            completion()
        }
        presetItems[preset.id] = item
        return item
    }

    private func presetDetail(_ preset: Preset) -> String {
        let surahName = environment.content.surah(id: preset.surahID)?.nameLatin ?? "Surah \(preset.surahID)"
        if let session = environment.userData.activeSession(for: preset.id), !session.isCompleted {
            let repeatCount = preset.repeats.repeats(forVerse: session.resumePoint.verseNumber)
            return "\(surahName) \(session.resumePoint.verseNumber) · resume repeat \(session.resumePoint.repeatIndex) of \(repeatCount)"
        }
        return "\(surahName) \(preset.range.displayString) · \(preset.repeatSummary)"
    }

    private func refreshPresets() {
        guard isStarted, let presetsTemplate else { return }
        presetsTemplate.updateSections(makePresetSections())
    }

    private func applyPlayingIndicator() {
        let activeID = activePreset?.id
        let isActive = drill.state.status == .playing || drill.state.status == .paused
        for (id, item) in presetItems {
            item.isPlaying = isActive && id == activeID
        }
    }

    // MARK: - Now Playing

    private func configureNowPlayingButtons() {
        var buttons: [CPNowPlayingButton] = []
        if let image = UIImage(systemName: "backward.end.fill")?.withRenderingMode(.alwaysTemplate) {
            buttons.append(CPNowPlayingImageButton(image: image) { [weak self] _ in
                self?.drill.previousVerse()
            })
        }
        if let image = UIImage(systemName: "backward.fill")?.withRenderingMode(.alwaysTemplate) {
            buttons.append(CPNowPlayingImageButton(image: image) { [weak self] _ in
                self?.drill.previousRepeat()
            })
        }
        if let image = UIImage(systemName: "forward.fill")?.withRenderingMode(.alwaysTemplate) {
            buttons.append(CPNowPlayingImageButton(image: image) { [weak self] _ in
                self?.drill.nextRepeat()
            })
        }
        if let image = UIImage(systemName: "forward.end.fill")?.withRenderingMode(.alwaysTemplate) {
            buttons.append(CPNowPlayingImageButton(image: image) { [weak self] _ in
                self?.drill.nextVerse()
            })
        }
        CPNowPlayingTemplate.shared.updateNowPlayingButtons(buttons)
    }

    private func configureRemoteCommands() {
        let center = MPRemoteCommandCenter.shared()

        register(center.playCommand) { [weak self] in
            guard let self, self.drill.state.queue != nil, self.drill.state.status != .playing else {
                return false
            }
            self.drill.play()
            return true
        }
        register(center.pauseCommand) { [weak self] in
            guard let self, self.drill.state.status == .playing else { return false }
            self.drill.pause()
            return true
        }
        register(center.togglePlayPauseCommand) { [weak self] in
            guard let self, self.drill.state.queue != nil else { return false }
            self.drill.togglePlayPause()
            return true
        }
        register(center.nextTrackCommand) { [weak self] in
            guard let self, self.drill.state.queue != nil else { return false }
            self.drill.nextVerse()
            return true
        }
        register(center.previousTrackCommand) { [weak self] in
            guard let self, self.drill.state.queue != nil else { return false }
            self.drill.previousVerse()
            return true
        }
        register(center.skipForwardCommand) { [weak self] in
            guard let self, self.drill.state.queue != nil else { return false }
            self.drill.nextRepeat()
            return true
        }
        register(center.skipBackwardCommand) { [weak self] in
            guard let self, self.drill.state.queue != nil else { return false }
            self.drill.previousRepeat()
            return true
        }
    }

    private func register(_ command: MPRemoteCommand, action: @escaping () -> Bool) {
        let target = command.addTarget { _ in
            action() ? .success : .commandFailed
        }
        remoteCommandTargets.append((command: command, target: target))
    }

    // MARK: - Session mirroring

    private func attachToExistingDrill() {
        if let queue = drill.state.queue,
           let preset = environment.userData.preset(id: queue.presetID) {
            activePreset = preset
            activeSurah = environment.content.surah(id: preset.surahID) ?? queue.surah
        }
        if drill.delegate == nil {
            drill.delegate = self
        }
        lastDescription = nil
        syncFromSession(force: true)
    }

    private func startSafetyTick() {
        let timer = Timer(timeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.tick()
            }
        }
        RunLoop.main.add(timer, forMode: .common)
        safetyTick = timer
    }

    private func tick() {
        let dataChanged = environment.dataRevision != lastDataRevision
        if dataChanged {
            lastDataRevision = environment.dataRevision
            refreshActivePreset()
            refreshPresets()
        }
        syncFromSession(force: dataChanged)
    }

    /// Picks up preset edits (for example a transliteration/Arabic toggle) made
    /// on the phone while the car is playing.
    private func refreshActivePreset() {
        guard let id = activePreset?.id, let updated = environment.userData.preset(id: id) else { return }
        activePreset = updated
    }

    private func syncFromSession(force: Bool = false) {
        let state = drill.state
        if !force, state == lastSyncedState { return }
        lastSyncedState = state

        updatePlaybackState(state)

        guard let preset = activePreset, let surah = activeSurah else { return }
        let reciterName = environment.content.reciter(id: preset.reciterID)?.name ?? preset.reciterID
        let description = CarPlayNowPlayingBuilder.makeDescription(
            preset: preset,
            surah: surah,
            reciterName: reciterName,
            state: state
        )
        if description != lastDescription {
            lastDescription = description
            drill.setNowPlayingDescription(description)
        }
        saveSession(state: state)
    }

    /// The engine owns `MPNowPlayingInfoCenter`; CarPlay only reports the
    /// playback state so the system treats the drill as now playing.
    private func updatePlaybackState(_ state: DrillSessionState) {
        switch state.status {
        case .playing:
            MPNowPlayingInfoCenter.default().playbackState = .playing
        case .paused:
            MPNowPlayingInfoCenter.default().playbackState = .paused
        case .idle, .completed:
            MPNowPlayingInfoCenter.default().playbackState = .stopped
        }
    }

    private func saveSession(state: DrillSessionState) {
        guard let preset = activePreset, state.queue != nil else { return }
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

    // MARK: - DrillSessionServiceDelegate

    // The engine may call its delegate from outside the main actor, so the
    // delegate methods stay nonisolated and hop onto the main actor to touch
    // the coordinator's state.

    nonisolated func drillSession(_ service: any DrillSessionService, didUpdate state: DrillSessionState) {
        Task { @MainActor [weak self] in
            self?.syncFromSession()
        }
    }

    nonisolated func drillSession(_ service: any DrillSessionService, didComplete item: DrillItem, at index: Int) {
        Task { @MainActor [weak self] in
            guard let self, let preset = self.activePreset else { return }
            self.environment.userData.recordCompletion(of: item, presetID: preset.id, at: Date())
            self.environment.notifyDataChanged()
        }
    }

    nonisolated func drillSessionDidFinish(_ service: any DrillSessionService) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            self.syncFromSession(force: true)
            if self.drill.state.status != .playing {
                try? self.environment.audioSession.deactivate()
            }
        }
    }
}
