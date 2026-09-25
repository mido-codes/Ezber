import Foundation

/// State of the (future) native audio session. The real implementation will
/// wrap AVAudioSession and react to interruptions, route changes and ducking.
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

/// Interface the real playback engine will implement. This slice ships only
/// `StubAudioSessionService`; no audio is played and no CarPlay is involved.
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

/// No-op audio session. Keeps state so the UI can reflect it, but produces no
/// sound. Replace with an AVFoundation-backed implementation later.
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
