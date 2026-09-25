import AVFoundation
import Foundation

/// The AVFoundation-backed drill engine.
///
/// It walks the verse × repetition queue one `DrillItem` at a time, plays the
/// audio its `DrillAudioResolving` returns, and keeps the scaffold's transport
/// semantics: every repeat boundary reports completion (so the study player can
/// persist its resume point), manual transport behaves like the stub, and a
/// repeat whose audio cannot be resolved falls back to timed silent playback so
/// a drill never wedges.
final class AVDrillSessionService: NSObject, DrillSessionService, AudioSessionEventHandler {
    weak var delegate: (any DrillSessionServiceDelegate)?

    private(set) var state = DrillSessionState()
    var queue: DrillQueue? { state.queue }

    private let audioSession: any AudioSessionService
    private let audioResolver: any DrillAudioResolving
    private let callBehavior: () -> AppSettings.CallBehavior
    private let fallbackRepeatDuration: TimeInterval

    private var player: AVAudioPlayer?
    private var currentTrack: DrillAudioTrack?
    private var nowPlayingDescription: DrillNowPlayingDescription?

    /// Seconds left before the next repetition starts (the preset's pause
    /// between repeats), or 0 when nothing is pending.
    private var pendingPause: TimeInterval = 0
    /// Elapsed time of the current repetition when only silent fallback
    /// playback is available.
    private var fallbackElapsed: TimeInterval = 0

    private var tickTimer: Timer?
    private var lastTickDate: Date?
    private var lastNowPlayingPublish = Date.distantPast

    private var resumeAfterInterruption = false
    private var resumeAfterRouteChange = false

    init(
        audioSession: any AudioSessionService,
        audioResolver: any DrillAudioResolving = PlaceholderDrillAudioResolver(),
        fallbackRepeatDuration: TimeInterval = 4,
        callBehavior: @escaping () -> AppSettings.CallBehavior = { .pauseAndResume }
    ) {
        self.audioSession = audioSession
        self.audioResolver = audioResolver
        self.fallbackRepeatDuration = max(1, fallbackRepeatDuration)
        self.callBehavior = callBehavior
        super.init()
    }

    // MARK: - DrillSessionService

    func setNowPlayingDescription(_ description: DrillNowPlayingDescription?) {
        nowPlayingDescription = description
        publishNowPlaying(force: true)
    }

    func load(_ queue: DrillQueue, startingAt resumePoint: ResumePoint?, configuration: DrillSessionConfiguration) {
        cancelPlayback()
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
        resumeAfterInterruption = false
        resumeAfterRouteChange = false
        publishNowPlaying(force: true)
        notify()
    }

    func play() {
        guard state.queue?.isEmpty == false else { return }
        if state.status == .completed {
            restart()
        }
        try? audioSession.activate()
        state.status = .playing
        startOrResumeCurrentItem()
        notify()
    }

    func pause() {
        guard state.status == .playing else { return }
        state.status = .paused
        player?.pause()
        stopTickTimer()
        publishNowPlaying(force: true)
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
        cancelPlayback()
        if state.currentIndex > 0 {
            state.currentIndex -= 1
            state.completedItemCount = min(state.completedItemCount, state.currentIndex)
        }
        notify()
        continuePlayingCurrentItem()
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
        guard let queue = state.queue,
              let index = queue.items.firstIndex(where: { $0.id == item })
        else { return }
        jump(to: index)
    }

    func restart() {
        cancelPlayback()
        state.currentIndex = 0
        state.completedItemCount = 0
        state.status = state.queue?.isEmpty == true ? .completed : .paused
        publishNowPlaying(force: true)
        notify()
    }

    func stop() {
        cancelPlayback()
        state.status = .idle
        publishNowPlaying(force: true)
        try? audioSession.deactivate()
        notify()
    }

    // MARK: - AudioSessionEventHandler

    func audioSession(_ service: any AudioSessionService, didReceive command: AudioRemoteCommand) {
        onMain { [weak self] in
            guard let self else { return }
            switch command {
            case .play:
                self.play()
            case .pause:
                self.pause()
            case .togglePlayPause:
                self.togglePlayPause()
            case .nextVerse:
                self.nextVerse()
            case .previousVerse:
                self.previousVerse()
            case .nextRepeat:
                self.nextRepeat()
            case .previousRepeat:
                self.previousRepeat()
            }
        }
    }

    func audioSessionDidBeginInterruption(_ service: any AudioSessionService) {
        onMain { [weak self] in
            guard let self else { return }
            self.resumeAfterInterruption = self.state.status == .playing
            self.pause()
        }
    }

    func audioSessionDidEndInterruption(_ service: any AudioSessionService, shouldResume: Bool) {
        onMain { [weak self] in
            guard let self else { return }
            let wantsResume = self.resumeAfterInterruption
            self.resumeAfterInterruption = false
            if wantsResume, shouldResume, self.callBehavior() != .pauseOnly {
                self.play()
            }
        }
    }

    func audioSession(_ service: any AudioSessionService, didChangeRoute route: AudioRouteChange) {
        onMain { [weak self] in
            guard let self else { return }
            switch route {
            case .oldDeviceUnavailable:
                // Headphones unplugged: pause rather than blast the speaker.
                self.resumeAfterRouteChange = self.state.status == .playing
                self.pause()
            case .newDeviceAvailable:
                if self.resumeAfterRouteChange {
                    self.resumeAfterRouteChange = false
                    self.play()
                }
            }
        }
    }

    func audioSessionDidResetMediaServices(_ service: any AudioSessionService) {
        onMain { [weak self] in
            guard let self, self.state.status == .playing else { return }
            // Media-services reset invalidates the player; rebuild it and let
            // the session service reconfigure itself.
            try? self.audioSession.activate()
            self.beginCurrentItem(after: 0)
        }
    }

    // MARK: - Private: queue movement

    private func advance(completingCurrent: Bool) {
        guard let queue = state.queue, let item = state.currentItem else { return }
        cancelPlayback()
        let index = state.currentIndex
        if completingCurrent {
            state.completedItemCount = max(state.completedItemCount, index + 1)
        }

        // Move before notifying so a resume point saved from the completion
        // callback points at the next repeat, not the one that just finished.
        if index + 1 < queue.items.count {
            state.currentIndex = index + 1
            if completingCurrent {
                delegate?.drillSession(self, didComplete: item, at: index)
            }
            notify()
            continuePlayingCurrentItem()
        } else if state.configuration.loopUntilStopped {
            state.currentIndex = 0
            state.completedItemCount = 0
            if completingCurrent {
                delegate?.drillSession(self, didComplete: item, at: index)
            }
            notify()
            continuePlayingCurrentItem()
        } else {
            state.status = .completed
            if completingCurrent {
                delegate?.drillSession(self, didComplete: item, at: index)
            }
            publishNowPlaying(force: true)
            notify()
            delegate?.drillSessionDidFinish(self)
        }
    }

    private func jump(to index: Int) {
        guard let queue = state.queue, queue.items.indices.contains(index) else { return }
        cancelPlayback()
        state.currentIndex = index
        state.completedItemCount = max(state.completedItemCount, index)
        notify()
        continuePlayingCurrentItem()
    }

    /// Starts the current item when the drill is playing; otherwise just
    /// refreshes the lock screen for the item that became current.
    private func continuePlayingCurrentItem() {
        guard state.status == .playing else {
            publishNowPlaying(force: true)
            return
        }
        beginCurrentItem(after: max(0, state.configuration.pauseBetweenRepeats))
    }

    private func finishCurrentItem() {
        guard state.status == .playing else { return }
        advance(completingCurrent: true)
    }

    // MARK: - Private: playback

    /// Points the engine at `state.currentItem` and starts it after `delay`
    /// seconds. A non-zero delay is the preset's pause between repeats; the
    /// tick timer counts it down and `play()` resumes it after a pause.
    private func beginCurrentItem(after delay: TimeInterval) {
        cancelPlayback()
        guard state.currentItem != nil else { return }
        pendingPause = max(0, delay)
        if pendingPause <= 0 {
            startPlayerNow()
        }
        if state.status == .playing {
            startTickTimer()
        }
        publishNowPlaying(force: true)
    }

    /// Starts the item after a pause, resuming the same repetition when the
    /// player still holds one and counting down a pending between-repeats gap.
    private func startOrResumeCurrentItem() {
        if pendingPause > 0 {
            startTickTimer()
            publishNowPlaying(force: true)
            return
        }
        if let player, !playerDidReachEnd(player) {
            player.play()
            startTickTimer()
            publishNowPlaying(force: true)
            return
        }
        beginCurrentItem(after: 0)
    }

    private func startPlayerNow() {
        pendingPause = 0
        fallbackElapsed = 0
        guard let item = state.currentItem else { return }
        let track = audioResolver.track(for: item)
        currentTrack = track
        if let track, let prepared = makePlayer(for: track) {
            player = prepared
            prepared.play()
        } else {
            player = nil
        }
    }

    private func makePlayer(for track: DrillAudioTrack) -> AVAudioPlayer? {
        guard let prepared = try? AVAudioPlayer(contentsOf: track.url) else { return nil }
        prepared.delegate = self
        prepared.numberOfLoops = 0
        prepared.prepareToPlay()
        if track.startTime > 0 {
            prepared.currentTime = min(track.startTime, prepared.duration)
        }
        return prepared
    }

    private func playerDidReachEnd(_ player: AVAudioPlayer) -> Bool {
        let end = currentTrack?.endTime ?? player.duration
        return player.currentTime >= end - 0.05
    }

    /// Stops any playback and drops the pending between-repeats gap without
    /// touching the queue position or the session state.
    private func cancelPlayback() {
        stopTickTimer()
        player?.stop()
        player?.delegate = nil
        player = nil
        currentTrack = nil
        pendingPause = 0
        fallbackElapsed = 0
    }

    private func startTickTimer() {
        guard tickTimer == nil else { return }
        let interval: TimeInterval = 0.25
        lastTickDate = Date()
        let timer = Timer(
            fire: Date().addingTimeInterval(interval),
            interval: interval,
            repeats: true
        ) { [weak self] _ in
            self?.tick()
        }
        RunLoop.main.add(timer, forMode: .common)
        tickTimer = timer
    }

    private func stopTickTimer() {
        tickTimer?.invalidate()
        tickTimer = nil
        lastTickDate = nil
    }

    private func tick() {
        guard state.status == .playing else { return }
        let now = Date()
        let delta = lastTickDate.map { now.timeIntervalSince($0) } ?? 0
        lastTickDate = now

        if pendingPause > 0 {
            pendingPause = max(0, pendingPause - delta)
            if pendingPause == 0 {
                startPlayerNow()
                publishNowPlaying(force: true)
            }
            return
        }

        if let player {
            if playerDidReachEnd(player) {
                finishCurrentItem()
                return
            }
        } else {
            fallbackElapsed += delta
            if fallbackElapsed >= fallbackRepeatDuration {
                finishCurrentItem()
                return
            }
        }
        publishNowPlaying(force: false)
    }

    // MARK: - Private: Now Playing

    private func publishNowPlaying(force: Bool) {
        let now = Date()
        if !force, now.timeIntervalSince(lastNowPlayingPublish) < 1 {
            return
        }
        lastNowPlayingPublish = now

        guard let queue = state.queue, let item = state.currentItem, state.status != .idle else {
            audioSession.updateNowPlaying(nil)
            return
        }

        let description = nowPlayingDescription
        let surahName = description?.surahName ?? queue.surah.nameLatin
        let elapsed: TimeInterval
        let duration: TimeInterval
        if let player {
            let start = currentTrack?.startTime ?? 0
            let end = currentTrack?.endTime ?? player.duration
            elapsed = max(0, player.currentTime - start)
            duration = max(0.1, end - start)
        } else {
            elapsed = state.status == .completed
                ? fallbackRepeatDuration
                : min(fallbackElapsed, fallbackRepeatDuration)
            duration = fallbackRepeatDuration
        }

        let repeatText = "Repeat \(item.repeatIndex) of \(item.repeatCount)"
        let reciterName = description?.reciterName ?? ""
        let presetName = description?.presetName ?? ""

        let info = NowPlayingInfo(
            title: "\(surahName) \(item.verse.reference)",
            subtitle: reciterName.isEmpty ? repeatText : reciterName,
            albumTitle: presetName.isEmpty ? repeatText : presetName,
            artworkName: description?.artworkName,
            elapsed: elapsed,
            duration: duration,
            playbackRate: state.status == .playing ? 1 : 0,
            queuePosition: state.currentIndex + 1,
            queueCount: state.totalItemCount
        )
        audioSession.updateNowPlaying(info)
    }

    // MARK: - Private: helpers

    private func notify() {
        delegate?.drillSession(self, didUpdate: state)
    }

    private func onMain(_ work: @escaping () -> Void) {
        if Thread.isMainThread {
            work()
        } else {
            DispatchQueue.main.async(execute: work)
        }
    }
}

extension AVDrillSessionService: AVAudioPlayerDelegate {
    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        guard player === self.player else { return }
        finishCurrentItem()
    }

    func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
        guard player === self.player else { return }
        finishCurrentItem()
    }
}
