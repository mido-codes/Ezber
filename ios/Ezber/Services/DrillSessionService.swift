import Foundation

/// Playback-related configuration a drill runs with.
struct DrillSessionConfiguration: Hashable {
    var loopUntilStopped: Bool
    var pauseBetweenRepeats: TimeInterval

    init(loopUntilStopped: Bool = false, pauseBetweenRepeats: TimeInterval = 0.5) {
        self.loopUntilStopped = loopUntilStopped
        self.pauseBetweenRepeats = pauseBetweenRepeats
    }
}

/// Presentation context for the lock screen that only the study player knows:
/// the engine can derive the current verse from the queue, but not the preset
/// and reciter names. Engines that do not publish metadata ignore it.
struct DrillNowPlayingDescription: Equatable {
    var presetName: String
    var surahName: String
    var reciterName: String
    var artworkName: String?

    init(presetName: String, surahName: String, reciterName: String, artworkName: String? = nil) {
        self.presetName = presetName
        self.surahName = surahName
        self.reciterName = reciterName
        self.artworkName = artworkName
    }
}

enum DrillSessionStatus: Equatable {
    case idle
    case playing
    case paused
    case completed
}

/// Everything the study player needs to render: the queue, the current item,
/// the repeat counter and the overall position.
struct DrillSessionState: Equatable {
    var queue: DrillQueue?
    var status: DrillSessionStatus = .idle
    var currentIndex: Int = 0
    var completedItemCount: Int = 0
    var totalItemCount: Int = 0
    var configuration: DrillSessionConfiguration = DrillSessionConfiguration()

    var currentItem: DrillItem? {
        guard let queue, queue.items.indices.contains(currentIndex) else { return nil }
        return queue.items[currentIndex]
    }

    var currentRepeat: Int { currentItem?.repeatIndex ?? 0 }
    var repeatCount: Int { currentItem?.repeatCount ?? 0 }
    var currentVerseNumber: Int? { currentItem?.verse.number }

    var resumePoint: ResumePoint? {
        currentItem.map { ResumePoint(verseNumber: $0.verse.number, repeatIndex: $0.repeatIndex) }
    }

    var progress: Double {
        guard totalItemCount > 0 else { return 0 }
        return min(1, max(0, Double(completedItemCount) / Double(totalItemCount)))
    }
}

/// The playback engine speaks to the study player through this delegate. The
/// model records progress and saves the resume point on every completed repeat.
protocol DrillSessionServiceDelegate: AnyObject {
    func drillSession(_ service: any DrillSessionService, didUpdate state: DrillSessionState)
    func drillSession(_ service: any DrillSessionService, didComplete item: DrillItem, at index: Int)
    func drillSessionDidFinish(_ service: any DrillSessionService)
}

/// The drill engine interface. A drill is expressed as a `DrillQueue` — the
/// verse × repetition plan — so any implementation (stub now, AVPlayer later)
/// drives the same UI and the same resume semantics.
protocol DrillSessionService: AnyObject {
    var delegate: (any DrillSessionServiceDelegate)? { get set }
    var state: DrillSessionState { get }
    var queue: DrillQueue? { get }

    func load(_ queue: DrillQueue, startingAt resumePoint: ResumePoint?, configuration: DrillSessionConfiguration)
    func play()
    func pause()
    func togglePlayPause()
    func nextRepeat()
    func previousRepeat()
    func nextVerse()
    func previousVerse()
    func seek(to item: DrillItem.ID)
    func restart()
    func stop()

    /// Additive: describes what the lock screen should show for the queue. The
    /// default implementation below does nothing, so engines that publish no
    /// metadata stay conforming without changes.
    func setNowPlayingDescription(_ description: DrillNowPlayingDescription?)
}

extension DrillSessionService {
    func setNowPlayingDescription(_ description: DrillNowPlayingDescription?) {}
}

/// Simulated playback: advances through the queue on a timer so the whole flow
/// is clickable without audio. Manual transport controls work exactly as the
/// real engine will make them work.
final class StubDrillSessionService: DrillSessionService {
    weak var delegate: (any DrillSessionServiceDelegate)?

    private(set) var state = DrillSessionState()
    var queue: DrillQueue? { state.queue }

    /// How long one simulated repetition lasts. Short enough to see the queue
    /// advance while clicking through.
    var simulatedRepeatDuration: TimeInterval = 4

    private var timer: Timer?
    private var elapsedInRepeat: TimeInterval = 0
    private var lastTick: Date?

    func load(_ queue: DrillQueue, startingAt resumePoint: ResumePoint?, configuration: DrillSessionConfiguration) {
        var newState = DrillSessionState()
        newState.queue = queue
        newState.totalItemCount = queue.count
        newState.configuration = configuration
        if let resumePoint, let index = queue.index(forResume: resumePoint) {
            newState.currentIndex = index
            newState.completedItemCount = index
        }
        newState.status = queue.isEmpty ? .completed : .paused
        state = newState
        elapsedInRepeat = 0
        lastTick = nil
        stopTimer()
        notify()
    }

    func play() {
        guard state.queue?.isEmpty == false else { return }
        if state.status == .completed {
            restart()
        }
        state.status = .playing
        lastTick = Date()
        startTimer()
        notify()
    }

    func pause() {
        guard state.status == .playing else { return }
        state.status = .paused
        stopTimer()
        notify()
    }

    func togglePlayPause() {
        if state.status == .playing {
            pause()
        } else {
            play()
        }
    }

    func nextRepeat() {
        guard state.status != .completed else { return }
        advance(completingCurrent: true)
    }

    func previousRepeat() {
        guard let queue = state.queue, !queue.isEmpty, state.status != .completed else { return }
        if state.currentIndex > 0 {
            state.currentIndex -= 1
            state.completedItemCount = min(state.completedItemCount, state.currentIndex)
        }
        elapsedInRepeat = 0
        lastTick = state.status == .playing ? Date() : nil
        notify()
    }

    func nextVerse() {
        guard let queue = state.queue, let current = state.currentItem else { return }
        if let index = queue.firstIndex(ofVerseAfter: current.verse.number) {
            jump(to: index)
        } else if !queue.isEmpty {
            jump(to: queue.count - 1)
        }
    }

    func previousVerse() {
        guard let queue = state.queue, let current = state.currentItem else { return }
        if let index = queue.firstIndex(ofVerseBefore: current.verse.number) {
            let previousVerseNumber = queue.items[index].verse.number
            jump(to: queue.firstIndex(ofVerse: previousVerseNumber) ?? index)
        } else {
            jump(to: 0)
        }
    }

    func seek(to item: DrillItem.ID) {
        guard let queue = state.queue, let index = queue.items.firstIndex(where: { $0.id == item }) else { return }
        jump(to: index)
    }

    func restart() {
        state.currentIndex = 0
        state.completedItemCount = 0
        state.status = state.queue?.isEmpty == true ? .completed : .paused
        elapsedInRepeat = 0
        lastTick = nil
        stopTimer()
        notify()
    }

    func stop() {
        stopTimer()
        state.status = .idle
        elapsedInRepeat = 0
        lastTick = nil
        notify()
    }

    // MARK: - Private

    private func advance(completingCurrent: Bool) {
        guard let queue = state.queue, let item = state.currentItem else { return }
        let index = state.currentIndex
        if completingCurrent {
            state.completedItemCount = max(state.completedItemCount, index + 1)
        }

        // Advance the queue before notifying so a resume point saved from the
        // completion callback points at the next repeat, not the finished one.
        if index + 1 < queue.items.count {
            state.currentIndex = index + 1
            elapsedInRepeat = 0
            lastTick = state.status == .playing ? Date() : nil
            if completingCurrent {
                delegate?.drillSession(self, didComplete: item, at: index)
            }
            notify()
        } else if state.configuration.loopUntilStopped {
            state.currentIndex = 0
            state.completedItemCount = 0
            elapsedInRepeat = 0
            lastTick = Date()
            if completingCurrent {
                delegate?.drillSession(self, didComplete: item, at: index)
            }
            notify()
        } else {
            state.status = .completed
            stopTimer()
            if completingCurrent {
                delegate?.drillSession(self, didComplete: item, at: index)
            }
            notify()
            delegate?.drillSessionDidFinish(self)
        }
    }

    private func jump(to index: Int) {
        guard let queue = state.queue, queue.items.indices.contains(index) else { return }
        state.currentIndex = index
        state.completedItemCount = max(state.completedItemCount, index)
        elapsedInRepeat = 0
        lastTick = state.status == .playing ? Date() : nil
        notify()
    }

    private func startTimer() {
        stopTimer()
        let timer = Timer(timeInterval: 0.5, repeats: true) { [weak self] _ in
            self?.tick()
        }
        RunLoop.main.add(timer, forMode: .common)
        self.timer = timer
    }

    private func stopTimer() {
        timer?.invalidate()
        timer = nil
    }

    private func tick() {
        guard state.status == .playing, let lastTick = lastTick else { return }
        let now = Date()
        elapsedInRepeat += now.timeIntervalSince(lastTick)
        self.lastTick = now
        if elapsedInRepeat >= simulatedRepeatDuration {
            advance(completingCurrent: true)
        }
    }

    private func notify() {
        delegate?.drillSession(self, didUpdate: state)
    }
}
