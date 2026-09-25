import Foundation

/// State of the native audio session: `LiveAudioSessionService` wraps
/// AVAudioSession and reacts to interruptions, route changes and ducking.
enum AudioSessionState: Equatable {
    case idle
    case active
    case ducked
    case interrupted
}

/// Metadata the app would publish to the lock screen / Now Playing center.
/// Next/previous map to next/previous verse, per the product brief.
struct NowPlayingInfo: Equatable {
    var title: String
    var subtitle: String
    var albumTitle: String
    var artworkName: String?
    var elapsed: TimeInterval
    var duration: TimeInterval
    var playbackRate: Float
    var queuePosition: Int
    var queueCount: Int
}

/// A transport command from the lock screen, Control Center or a remote.
/// Next/previous track map to next/previous verse (the product brief's lock
/// screen behavior); the skip commands map to next/previous repeat.
enum AudioRemoteCommand: Equatable {
    case play
    case pause
    case togglePlayPause
    case nextVerse
    case previousVerse
    case nextRepeat
    case previousRepeat
}

/// The audio-route changes playback reacts to.
enum AudioRouteChange: Equatable {
    case oldDeviceUnavailable
    case newDeviceAvailable
}

/// Additive companion to `AudioSessionService`: a service that can push
/// transport, interruption and route events to the engine. It is a separate
/// protocol so the original service shape stays unchanged and stubs can ignore
/// it entirely.
protocol AudioSessionEventSourcing: AnyObject {
    var eventHandler: (any AudioSessionEventHandler)? { get set }
}

/// Receives events from an `AudioSessionEventSourcing` service. The drill
/// engine implements this.
protocol AudioSessionEventHandler: AnyObject {
    func audioSession(_ service: any AudioSessionService, didReceive command: AudioRemoteCommand)
    func audioSessionDidBeginInterruption(_ service: any AudioSessionService)
    func audioSessionDidEndInterruption(_ service: any AudioSessionService, shouldResume: Bool)
    func audioSession(_ service: any AudioSessionService, didChangeRoute route: AudioRouteChange)
    func audioSessionDidResetMediaServices(_ service: any AudioSessionService)
}

/// Interface the playback engine publishes audio state through. The app uses
/// `LiveAudioSessionService` (AVFoundation); `StubAudioSessionService` remains
/// for previews and tests. No CarPlay is involved.
protocol AudioSessionService: AnyObject {
    var state: AudioSessionState { get }
    var nowPlaying: NowPlayingInfo? { get }

    func configure() throws
    func activate() throws
    func deactivate() throws
    func updateNowPlaying(_ info: NowPlayingInfo?)
    func setDucked(_ ducked: Bool)
    func handleInterruptionBegan()
    func handleInterruptionEnded(shouldResume: Bool)
}

/// No-op audio session for previews and tests. Keeps state so the UI can
/// reflect it, but produces no sound and emits no events.
final class StubAudioSessionService: AudioSessionService {
    private(set) var state: AudioSessionState = .idle
    private(set) var nowPlaying: NowPlayingInfo?

    func configure() throws {
        state = .idle
    }

    func activate() throws {
        state = .active
    }

    func deactivate() throws {
        state = .idle
    }

    func updateNowPlaying(_ info: NowPlayingInfo?) {
        nowPlaying = info
    }

    func setDucked(_ ducked: Bool) {
        state = ducked ? .ducked : .active
    }

    func handleInterruptionBegan() {
        state = .interrupted
    }

    func handleInterruptionEnded(shouldResume: Bool) {
        state = shouldResume ? .active : .idle
    }
}
