import AVFoundation
import MediaPlayer
import UIKit

/// The real audio session.
///
/// It configures `AVAudioSession` for background playback that keeps going
/// with the silent switch on (`.playback`), publishes Now Playing metadata to
/// the lock screen and Control Center, maps their transport commands onto the
/// drill, and forwards interruptions, route changes and media-services resets
/// through `AudioSessionEventSourcing`.
final class LiveAudioSessionService: NSObject, AudioSessionService, AudioSessionEventSourcing {
    weak var eventHandler: (any AudioSessionEventHandler)?

    private(set) var state: AudioSessionState = .idle
    private(set) var nowPlaying: NowPlayingInfo?

    private let session = AVAudioSession.sharedInstance()
    private var isConfigured = false
    private var notificationObservers: [NSObjectProtocol] = []
    private var remoteCommandTargets: [(command: MPRemoteCommand, token: Any)] = []

    deinit {
        removeNotificationObservers()
        removeRemoteCommands()
    }

    // MARK: - AudioSessionService

    func configure() throws {
        if !isConfigured {
            try session.setCategory(.playback, mode: .spokenAudio, options: [])
            registerNotificationObservers()
            registerRemoteCommands()
            isConfigured = true
        }
        state = .idle
    }

    func activate() throws {
        if !isConfigured {
            try configure()
        }
        try session.setActive(true)
        state = .active
    }

    func deactivate() throws {
        try session.setActive(false, options: .notifyOthersOnDeactivation)
        state = .idle
    }

    func updateNowPlaying(_ info: NowPlayingInfo?) {
        nowPlaying = info
        guard let info else {
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
            return
        }

        var metadata: [String: Any] = [
            MPMediaItemPropertyTitle: info.title,
            MPMediaItemPropertyArtist: info.subtitle,
            MPMediaItemPropertyAlbumTitle: info.albumTitle,
            MPMediaItemPropertyPlaybackDuration: NSNumber(value: max(0, info.duration)),
            MPNowPlayingInfoPropertyElapsedPlaybackTime: NSNumber(value: max(0, info.elapsed)),
            MPNowPlayingInfoPropertyPlaybackRate: NSNumber(value: info.playbackRate),
            MPNowPlayingInfoPropertyDefaultPlaybackRate: NSNumber(value: 1),
            MPNowPlayingInfoPropertyPlaybackQueueIndex: NSNumber(value: max(0, info.queuePosition - 1)),
            MPNowPlayingInfoPropertyPlaybackQueueCount: NSNumber(value: max(0, info.queueCount))
        ]
        if let name = info.artworkName, let artwork = Self.artwork(named: name) {
            metadata[MPMediaItemPropertyArtwork] = artwork
        }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = metadata
    }

    func setDucked(_ ducked: Bool) {
        state = ducked ? .ducked : .active
    }

    func handleInterruptionBegan() {
        state = .interrupted
        eventHandler?.audioSessionDidBeginInterruption(self)
    }

    func handleInterruptionEnded(shouldResume: Bool) {
        state = shouldResume ? .active : .idle
        eventHandler?.audioSessionDidEndInterruption(self, shouldResume: shouldResume)
    }

    // MARK: - Notifications

    private func registerNotificationObservers() {
        removeNotificationObservers()
        let center = NotificationCenter.default
        let session = AVAudioSession.sharedInstance()
        notificationObservers.append(center.addObserver(
            forName: AVAudioSession.interruptionNotification,
            object: session,
            queue: .main
        ) { [weak self] notification in
            self?.receiveInterruption(notification)
        })
        notificationObservers.append(center.addObserver(
            forName: AVAudioSession.routeChangeNotification,
            object: session,
            queue: .main
        ) { [weak self] notification in
            self?.receiveRouteChange(notification)
        })
        notificationObservers.append(center.addObserver(
            forName: AVAudioSession.mediaServicesWereResetNotification,
            object: session,
            queue: .main
        ) { [weak self] _ in
            self?.receiveMediaServicesReset()
        })
    }

    private func removeNotificationObservers() {
        let center = NotificationCenter.default
        for observer in notificationObservers {
            center.removeObserver(observer)
        }
        notificationObservers.removeAll()
    }

    private func receiveInterruption(_ notification: Notification) {
        guard let rawType = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: rawType)
        else { return }

        switch type {
        case .began:
            handleInterruptionBegan()
        case .ended:
            let rawOptions = notification.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
            let options = AVAudioSession.InterruptionOptions(rawValue: rawOptions)
            handleInterruptionEnded(shouldResume: options.contains(.shouldResume))
        @unknown default:
            break
        }
    }

    private func receiveRouteChange(_ notification: Notification) {
        guard let rawReason = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
              let reason = AVAudioSession.RouteChangeReason(rawValue: rawReason)
        else { return }

        switch reason {
        case .oldDeviceUnavailable:
            eventHandler?.audioSession(self, didChangeRoute: .oldDeviceUnavailable)
        case .newDeviceAvailable:
            eventHandler?.audioSession(self, didChangeRoute: .newDeviceAvailable)
        default:
            break
        }
    }

    private func receiveMediaServicesReset() {
        isConfigured = false
        remoteCommandTargets.removeAll()
        try? configure()
        eventHandler?.audioSessionDidResetMediaServices(self)
    }

    // MARK: - Remote commands

    private func registerRemoteCommands() {
        removeRemoteCommands()
        let center = MPRemoteCommandCenter.shared()

        addTarget(center.playCommand) { [weak self] _ in
            self?.send(.play)
            return .success
        }
        addTarget(center.pauseCommand) { [weak self] _ in
            self?.send(.pause)
            return .success
        }
        addTarget(center.togglePlayPauseCommand) { [weak self] _ in
            self?.send(.togglePlayPause)
            return .success
        }
        addTarget(center.nextTrackCommand) { [weak self] _ in
            self?.send(.nextVerse)
            return .success
        }
        addTarget(center.previousTrackCommand) { [weak self] _ in
            self?.send(.previousVerse)
            return .success
        }
        addTarget(center.skipForwardCommand) { [weak self] _ in
            self?.send(.nextRepeat)
            return .success
        }
        addTarget(center.skipBackwardCommand) { [weak self] _ in
            self?.send(.previousRepeat)
            return .success
        }

        center.skipForwardCommand.preferredIntervals = [NSNumber(value: 1)]
        center.skipBackwardCommand.preferredIntervals = [NSNumber(value: 1)]
        center.changePlaybackPositionCommand.isEnabled = false
        center.seekForwardCommand.isEnabled = false
        center.seekBackwardCommand.isEnabled = false
    }

    private func addTarget(
        _ command: MPRemoteCommand,
        handler: @escaping (MPRemoteCommandEvent) -> MPRemoteCommandHandlerStatus
    ) {
        command.isEnabled = true
        let token = command.addTarget(handler: handler)
        remoteCommandTargets.append((command, token))
    }

    private func removeRemoteCommands() {
        for entry in remoteCommandTargets {
            entry.command.removeTarget(entry.token)
        }
        remoteCommandTargets.removeAll()
    }

    private func send(_ command: AudioRemoteCommand) {
        if Thread.isMainThread {
            eventHandler?.audioSession(self, didReceive: command)
        } else {
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                self.eventHandler?.audioSession(self, didReceive: command)
            }
        }
    }

    private static func artwork(named name: String) -> MPMediaItemArtwork? {
        guard let image = UIImage(named: name) else { return nil }
        return MPMediaItemArtwork(boundsSize: image.size) { _ in image }
    }
}
